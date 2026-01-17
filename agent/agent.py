#!/usr/bin/env python3
"""
Homelab K3s Agent - Runs on each node as a DaemonSet
Collects node metadata and sends to aggregator service
"""

import os
import socket
import time
import logging
import subprocess
import statistics
import random
import requests
import psutil
from typing import Optional
from kubernetes import client, config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def _get_int_env(var_name: str, default: int) -> int:
    """Return an int from the environment or fall back to default."""
    raw_value = os.getenv(var_name)
    if raw_value is None:
        return default
    try:
        value = int(raw_value)
    except ValueError:
        logger.warning(
            "Invalid %s value '%s'; falling back to %s",
            var_name,
            raw_value,
            default,
        )
        return default
    if value < 0:
        logger.warning(
            "%s must be non-negative; falling back to %s",
            var_name,
            default,
        )
        return default
    return value


# Configuration from environment variables
AGGREGATOR_URL = os.getenv('AGGREGATOR_URL', 'http://homelab-map-aggregator:8000')
REPORT_INTERVAL = _get_int_env('REPORT_INTERVAL', 30)  # seconds
CONNECTION_CHECK_INTERVAL = _get_int_env('CONNECTION_CHECK_INTERVAL', 5)
MAX_CONNECTION_TARGETS = _get_int_env('MAX_CONNECTION_TARGETS', 25)
NODE_NAME = os.getenv('NODE_NAME', socket.gethostname())
NETWORK_COUNTER_SNAPSHOT = None
DISK_IO_SNAPSHOT = None
ENABLE_AUTO_GEOLOCATION = os.getenv('ENABLE_AUTO_GEOLOCATION', 'true').lower() == 'true'

# Cache for geolocation results (key: node_name, value: location dict)
_geolocation_cache: dict = {}

def _measure_network_throughput() -> dict:
    """Calculate bytes-per-second deltas using psutil net_io_counters."""
    global NETWORK_COUNTER_SNAPSHOT
    try:
        counters = psutil.net_io_counters()
    except Exception as exc:  # pragma: no cover - defensive guard
        logger.warning(f"Failed to read network counters: {exc}")
        return {
            'network_tx_bytes_per_sec': 0.0,
            'network_rx_bytes_per_sec': 0.0,
        }

    now = time.time()
    if NETWORK_COUNTER_SNAPSHOT is None:
        NETWORK_COUNTER_SNAPSHOT = (counters.bytes_sent, counters.bytes_recv, now)
        return {
            'network_tx_bytes_per_sec': 0.0,
            'network_rx_bytes_per_sec': 0.0,
        }

    prev_sent, prev_recv, prev_time = NETWORK_COUNTER_SNAPSHOT
    elapsed = max(now - prev_time, 1e-3)
    tx_per_sec = max(counters.bytes_sent - prev_sent, 0) / elapsed
    rx_per_sec = max(counters.bytes_recv - prev_recv, 0) / elapsed
    NETWORK_COUNTER_SNAPSHOT = (counters.bytes_sent, counters.bytes_recv, now)

    return {
        'network_tx_bytes_per_sec': tx_per_sec,
        'network_rx_bytes_per_sec': rx_per_sec,
    }


def _measure_disk_io_throughput() -> dict:
    """Calculate disk I/O bytes-per-second deltas using psutil disk_io_counters."""
    global DISK_IO_SNAPSHOT
    try:
        counters = psutil.disk_io_counters()
        if counters is None:
            return {}
    except Exception as exc:
        logger.debug(f"Failed to read disk I/O counters: {exc}")
        return {}

    now = time.time()
    if DISK_IO_SNAPSHOT is None:
        DISK_IO_SNAPSHOT = (counters.read_bytes, counters.write_bytes, now)
        return {
            'disk_read_bytes_per_sec': 0.0,
            'disk_write_bytes_per_sec': 0.0,
        }

    prev_read, prev_write, prev_time = DISK_IO_SNAPSHOT
    elapsed = max(now - prev_time, 1e-3)
    read_per_sec = max(counters.read_bytes - prev_read, 0) / elapsed
    write_per_sec = max(counters.write_bytes - prev_write, 0) / elapsed
    DISK_IO_SNAPSHOT = (counters.read_bytes, counters.write_bytes, now)

    return {
        'disk_read_bytes_per_sec': read_per_sec,
        'disk_write_bytes_per_sec': write_per_sec,
    }


def _collect_temperature_metrics() -> dict:
    """Collect temperature and fan metrics using psutil sensors."""
    result = {}

    # Temperature sensors (primarily for Raspberry Pi, but works on any Linux with sensors)
    try:
        if hasattr(psutil, 'sensors_temperatures'):
            temps = psutil.sensors_temperatures()
            if temps:
                # Look for CPU thermal sensor (common names)
                for sensor_name in ['cpu_thermal', 'coretemp', 'k10temp', 'acpitz']:
                    if sensor_name in temps and temps[sensor_name]:
                        sensor = temps[sensor_name][0]
                        result['cpu_temp_celsius'] = sensor.current
                        if sensor.critical:
                            result['temp_critical'] = sensor.critical
                        break
                # If no known sensor found, try the first available
                if 'cpu_temp_celsius' not in result:
                    for sensor_name, readings in temps.items():
                        if readings:
                            result['cpu_temp_celsius'] = readings[0].current
                            if readings[0].critical:
                                result['temp_critical'] = readings[0].critical
                            break
    except Exception as exc:
        logger.debug(f"Failed to read temperature sensors: {exc}")

    # Fan sensors (primarily for Raspberry Pi 5 with active cooling)
    try:
        if hasattr(psutil, 'sensors_fans'):
            fans = psutil.sensors_fans()
            if fans:
                # Look for PWM fan (Raspberry Pi 5)
                for fan_name in ['pwmfan', 'fan1']:
                    if fan_name in fans and fans[fan_name]:
                        result['fan_rpm'] = fans[fan_name][0].current
                        break
                # If no known fan found, try the first available
                if 'fan_rpm' not in result:
                    for fan_name, readings in fans.items():
                        if readings:
                            result['fan_rpm'] = readings[0].current
                            break
    except Exception as exc:
        logger.debug(f"Failed to read fan sensors: {exc}")

    return result


def _collect_cpu_frequency() -> dict:
    """Collect CPU frequency metrics."""
    result = {}
    try:
        freq = psutil.cpu_freq()
        if freq:
            result['cpu_freq_mhz'] = freq.current
            if freq.max and freq.max > 0:
                result['cpu_freq_max_mhz'] = freq.max
    except Exception as exc:
        logger.debug(f"Failed to read CPU frequency: {exc}")
    return result


def _collect_system_metrics() -> dict:
    """Collect uptime, load average, and swap metrics."""
    result = {}

    # Uptime
    try:
        boot_time = psutil.boot_time()
        result['uptime_seconds'] = time.time() - boot_time
    except Exception as exc:
        logger.debug(f"Failed to read boot time: {exc}")

    # Load average
    try:
        load = os.getloadavg()
        result['load_avg_1m'] = load[0]
        result['load_avg_5m'] = load[1]
        result['load_avg_15m'] = load[2]
    except Exception as exc:
        logger.debug(f"Failed to read load average: {exc}")

    # Swap usage
    try:
        swap = psutil.swap_memory()
        result['swap_percent'] = swap.percent
        result['swap_total_bytes'] = swap.total
        result['swap_used_bytes'] = swap.used
    except Exception as exc:
        logger.debug(f"Failed to read swap memory: {exc}")

    # Memory details
    try:
        mem = psutil.virtual_memory()
        result['memory_total_bytes'] = mem.total
        result['memory_available_bytes'] = mem.available
    except Exception as exc:
        logger.debug(f"Failed to read memory details: {exc}")

    return result


def _collect_network_health() -> dict:
    """Collect network error and drop statistics."""
    result = {}
    try:
        net = psutil.net_io_counters()
        if net:
            result['network_packets_sent'] = net.packets_sent
            result['network_packets_recv'] = net.packets_recv
            result['network_errin'] = net.errin
            result['network_errout'] = net.errout
            result['network_dropin'] = net.dropin
            result['network_dropout'] = net.dropout
    except Exception as exc:
        logger.debug(f"Failed to read network error stats: {exc}")
    return result


def _collect_process_count() -> dict:
    """Collect number of running processes."""
    result = {}
    try:
        result['process_count'] = len(psutil.pids())
    except Exception as exc:
        logger.debug(f"Failed to read process count: {exc}")
    return result


def _discover_public_ip() -> Optional[str]:
    """Discover actual public IP via external service"""
    try:
        response = requests.get('https://api.ipify.org', timeout=5)
        if response.status_code == 200:
            return response.text.strip()
    except Exception as e:
        logger.debug(f"Failed to discover public IP: {e}")
    return None


def _is_private_ip(ip: str) -> bool:
    """Check if IP is private/internal (RFC1918, Tailscale, etc.)"""
    if not ip:
        return True
    # Common private ranges: 10.x, 172.16-31.x, 192.168.x, 100.64-127.x (CGNAT/Tailscale)
    return (ip.startswith('10.') or
            ip.startswith('192.168.') or
            ip.startswith('172.16.') or ip.startswith('172.17.') or
            ip.startswith('172.18.') or ip.startswith('172.19.') or
            ip.startswith('172.2') or ip.startswith('172.30.') or ip.startswith('172.31.') or
            ip.startswith('100.'))


def _detect_ip_geolocation(ip: str) -> Optional[dict]:
    """Detect location from IP address using ip-api.com"""
    try:
        response = requests.get(
            f'http://ip-api.com/json/{ip}?fields=status,lat,lon,city,country',
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            if data.get('status') == 'success' and data.get('lat') and data.get('lon'):
                return {
                    'lat': data['lat'],
                    'lon': data['lon'],
                    'location': f"{data.get('city', '')}, {data.get('country', '')}".strip(', '),
                    'location_source': 'ip_api'
                }
    except Exception as e:
        logger.debug(f"IP geolocation API failed for {ip}: {e}")
    return None


def _detect_node_location(node_name: str, external_ip: Optional[str] = None, internal_ip: Optional[str] = None) -> Optional[dict]:
    """Detect node location using IP geolocation API"""
    # Check cache first
    if node_name in _geolocation_cache:
        return _geolocation_cache[node_name]

    if not ENABLE_AUTO_GEOLOCATION:
        return None

    # If provided IPs are private, discover actual public IP
    ip_to_try = external_ip or internal_ip
    if not ip_to_try or _is_private_ip(ip_to_try):
        public_ip = _discover_public_ip()
        if public_ip:
            ip_to_try = public_ip

    if ip_to_try:
        location = _detect_ip_geolocation(ip_to_try)
        if location:
            _geolocation_cache[node_name] = location
            return location

    # No location found
    return None


def get_node_info():
    """Collect node information using Kubernetes API and system utilities"""
    try:
        # Load in-cluster config
        config.load_incluster_config()
        v1 = client.CoreV1Api()
        
        # Get node details
        node = v1.read_node(NODE_NAME)
        
        # Extract relevant information
        addresses = {addr.type: addr.address for addr in node.status.addresses}
        
        node_info = {
            'name': NODE_NAME,
            'hostname': addresses.get('Hostname', NODE_NAME),
            'internal_ip': addresses.get('InternalIP', ''),
            'external_ip': addresses.get('ExternalIP', ''),
            'os_image': node.status.node_info.os_image,
            'kernel_version': node.status.node_info.kernel_version,
            'architecture': node.status.node_info.architecture,
            'kubelet_version': node.status.node_info.kubelet_version,
            'container_runtime': node.status.node_info.container_runtime_version,
        }
        
        # Add location data via auto-detection
        location = _detect_node_location(
            NODE_NAME,
            external_ip=node_info.get('external_ip'),
            internal_ip=node_info.get('internal_ip')
        )
        
        if location:
            # Add small offset based on node name hash to separate co-located nodes
            # ~0.001 degree = ~100 meters, use smaller offset for visual clustering
            if 'lat' in location and 'lon' in location:
                offset = hash(NODE_NAME) % 10 * 0.0001  # 0-10 meters offset
                location['lat'] = location['lat'] + offset
                location['lon'] = location['lon'] + offset
            node_info.update(location)
        
        # Add system metrics
        node_info['cpu_percent'] = psutil.cpu_percent(interval=1)
        node_info['memory_percent'] = psutil.virtual_memory().percent
        node_info['disk_percent'] = psutil.disk_usage('/').percent
        
        # Get network interfaces
        net_if_addrs = psutil.net_if_addrs()
        node_info['network_interfaces'] = list(net_if_addrs.keys())

        # Network throughput
        node_info.update(_measure_network_throughput())

        # Extended metrics
        node_info.update(_collect_temperature_metrics())
        node_info.update(_collect_cpu_frequency())
        node_info.update(_collect_system_metrics())
        node_info.update(_collect_network_health())
        node_info.update(_collect_process_count())
        node_info.update(_measure_disk_io_throughput())
        
        logger.info(f"Collected info for node: {NODE_NAME}")
        return node_info
        
    except Exception as e:
        logger.error(f"Error collecting node info: {e}")
        # Fallback to basic info if k8s API fails
        return {
            'name': NODE_NAME,
            'hostname': socket.gethostname(),
            'error': str(e)
        }


def send_to_aggregator(data):
    """Send node data to aggregator service"""
    try:
        response = requests.post(
            f"{AGGREGATOR_URL}/api/nodes",
            json=data,
            timeout=10
        )
        
        if response.status_code == 200:
            logger.info(f"Successfully sent data to aggregator")
        else:
            logger.warning(f"Aggregator returned status {response.status_code}")
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to send data to aggregator: {e}")


def measure_latency(target_ip: str, count: int = 3) -> dict:
    """Measure latency to a target IP using ping"""
    try:
        # Use ping command (works on Linux)
        result = subprocess.run(
            ['ping', '-c', str(count), '-W', '2', target_ip],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            # Parse ping output for latency statistics
            output = result.stdout
            
            # Try to extract min/avg/max from ping output
            # Example line: "rtt min/avg/max/mdev = 0.123/0.456/0.789/0.012 ms"
            for line in output.split('\n'):
                line_lower = line.lower()
                if 'min/avg/max' in line_lower or ('rtt' in line_lower and '/' in line):
                    # Extract the numbers
                    if '=' in line:
                        parts = line.split('=')
                        if len(parts) > 1:
                            # Get the stats part before any units
                            stats_str = parts[1].strip().split()[0]
                            stats = stats_str.split('/')
                            if len(stats) >= 3:
                                try:
                                    return {
                                        'min_ms': float(stats[0]),
                                        'avg_ms': float(stats[1]),
                                        'max_ms': float(stats[2]),
                                        'reachable': True
                                    }
                                except ValueError:
                                    pass
            
            # Fallback: just report as reachable if ping succeeded
            logger.warning(f"Could not parse ping stats for {target_ip}, marking as reachable with 0ms")
            return {'avg_ms': 0.0, 'reachable': True}
        else:
            logger.warning(f"Ping to {target_ip} failed with return code {result.returncode}")
            return {'reachable': False}
            
    except Exception as e:
        logger.error(f"Failed to measure latency to {target_ip}: {e}")
        return {'reachable': False}


def get_other_nodes() -> list:
    """Get list of other nodes in the cluster"""
    try:
        config.load_incluster_config()
        v1 = client.CoreV1Api()
        
        nodes = v1.list_node()
        other_nodes = []
        
        for node in nodes.items:
            if node.metadata.name != NODE_NAME:
                # Get internal IP
                addresses = {addr.type: addr.address for addr in node.status.addresses}
                internal_ip = addresses.get('InternalIP')
                
                if internal_ip:
                    other_nodes.append({
                        'name': node.metadata.name,
                        'ip': internal_ip
                    })
        
        return other_nodes
        
    except Exception as e:
        logger.error(f"Error getting other nodes: {e}")
        return []


def measure_connections():
    """Measure network latency to all other nodes"""
    other_nodes = get_other_nodes()
    connections = []

    original_count = len(other_nodes)
    if MAX_CONNECTION_TARGETS > 0 and original_count > MAX_CONNECTION_TARGETS:
        random.shuffle(other_nodes)
        other_nodes = other_nodes[:MAX_CONNECTION_TARGETS]
        logger.info(
            "Sampling %s connection targets out of %s nodes",
            MAX_CONNECTION_TARGETS,
            original_count,
        )
    
    logger.info(f"Measuring connections to {len(other_nodes)} other nodes...")
    
    for node in other_nodes:
        latency = measure_latency(node['ip'])
        
        if latency.get('reachable'):
            connections.append({
                'target_node': node['name'],
                'target_ip': node['ip'],
                'latency_ms': latency.get('avg_ms', 0),
                'min_ms': latency.get('min_ms', 0),
                'max_ms': latency.get('max_ms', 0),
            })
            logger.info(f"  → {node['name']}: {latency.get('avg_ms', 0):.2f}ms")
    
    return connections


def main():
    """Main agent loop"""
    logger.info(f"Starting Homelab K3s Agent on {NODE_NAME}")
    logger.info(f"Aggregator URL: {AGGREGATOR_URL}")
    logger.info(f"Report interval: {REPORT_INTERVAL}s")
    logger.info(f"Connection check interval: {CONNECTION_CHECK_INTERVAL} reports")
    
    connection_check_counter = 0
    
    while True:
        try:
            # Collect node information
            node_data = get_node_info()
            node_data['timestamp'] = time.time()
            
            # Measure network connections periodically (less frequent than node data)
            connection_check_counter += 1
            if connection_check_counter >= CONNECTION_CHECK_INTERVAL:
                node_data['connections'] = measure_connections()
                connection_check_counter = 0
            
            # Send to aggregator
            send_to_aggregator(node_data)
            
            # Wait for next interval
            time.sleep(REPORT_INTERVAL)
            
        except KeyboardInterrupt:
            logger.info("Agent stopped by user")
            break
        except Exception as e:
            logger.error(f"Unexpected error in main loop: {e}")
            time.sleep(REPORT_INTERVAL)


if __name__ == '__main__':
    main()
