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
import requests
import psutil
from kubernetes import client, config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration from environment variables
AGGREGATOR_URL = os.getenv('AGGREGATOR_URL', 'http://homelab-map-aggregator:8000')
REPORT_INTERVAL = int(os.getenv('REPORT_INTERVAL', '30'))  # seconds
NODE_NAME = os.getenv('NODE_NAME', socket.gethostname())
NETWORK_COUNTER_SNAPSHOT = None

# =============================================================================
# CONFIGURATION: Update your home location here
# =============================================================================
# For the map to work, we need approximate coordinates. You can find yours at:
# https://www.latlong.net/ or just search "your city latitude longitude"
HOME_CITY_ENV_VAR = 'HOME_CITY'
HOME_LAT_ENV_VAR = 'HOME_LAT'
HOME_LON_ENV_VAR = 'HOME_LON'
DEFAULT_HOME_CITY = 'Berlin, Germany'
DEFAULT_HOME_LAT = 52.5200
DEFAULT_HOME_LON = 13.4050


def _get_float_env(var_name: str, default: float) -> float:
    """Return a float from the environment or fall back to default."""
    raw_value = os.getenv(var_name)
    if raw_value is None:
        return default
    try:
        return float(raw_value)
    except ValueError:
        logger.warning(
            "Invalid %s value '%s'; falling back to %s",
            var_name,
            raw_value,
            default,
        )
        return default


def _build_home_location() -> dict:
    """Create the home location configuration from environment variables."""
    return {
        'city': os.getenv(HOME_CITY_ENV_VAR, DEFAULT_HOME_CITY),
        'lat': _get_float_env(HOME_LAT_ENV_VAR, DEFAULT_HOME_LAT),
        'lon': _get_float_env(HOME_LON_ENV_VAR, DEFAULT_HOME_LON),
    }


HOME_LOCATION = _build_home_location()


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

# Cloud provider datacenter locations (no need to change these)
CLOUD_LOCATIONS = {
    'oracle': {
        'location': 'San Jose, CA (Oracle US-West)',
        'lat': 37.3382,
        'lon': -121.8863,
    },
    'gcp': {
        'location': 'Council Bluffs, IA (GCP us-central1)',
        'lat': 41.2619,
        'lon': -95.8608,
    },
}

# Node location mapping
NODE_LOCATIONS = {
    # Raspberry Pi nodes (at home)
    'michael-pi': {**HOME_LOCATION, 'location': f"{HOME_LOCATION['city']} (Home)", 'provider': 'raspberry-pi'},
    'jim-pi': {**HOME_LOCATION, 'location': f"{HOME_LOCATION['city']} (Home)", 'provider': 'raspberry-pi'},
    'dwight-pi': {**HOME_LOCATION, 'location': f"{HOME_LOCATION['city']} (Home)", 'provider': 'raspberry-pi'},
    
    # Oracle Cloud nodes (San Jose datacenter)
    'angela-amd2': {**CLOUD_LOCATIONS['oracle'], 'provider': 'oracle'},
    'stanley-arm1': {**CLOUD_LOCATIONS['oracle'], 'provider': 'oracle'},
    'phyllis-arm2': {**CLOUD_LOCATIONS['oracle'], 'provider': 'oracle'},
    
    # GCP nodes (Iowa datacenter)
    'toby-gcp1': {**CLOUD_LOCATIONS['gcp'], 'provider': 'gcp'},
}


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
        
        # Add location data if available with slight offset for co-located nodes
        if NODE_NAME in NODE_LOCATIONS:
            location = NODE_LOCATIONS[NODE_NAME].copy()
            # Add small offset based on node name hash to separate co-located nodes
            # ~0.001 degree = ~100 meters, use smaller offset for visual clustering
            offset = hash(NODE_NAME) % 10 * 0.0001  # 0-10 meters offset
            location['lat'] += offset
            location['lon'] += offset
            node_info.update(location)
        
        # Add system metrics
        node_info['cpu_percent'] = psutil.cpu_percent(interval=1)
        node_info['memory_percent'] = psutil.virtual_memory().percent
        node_info['disk_percent'] = psutil.disk_usage('/').percent
        
        # Get network interfaces
        net_if_addrs = psutil.net_if_addrs()
        node_info['network_interfaces'] = list(net_if_addrs.keys())

        node_info.update(_measure_network_throughput())
        
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
    
    connection_check_counter = 0
    CONNECTION_CHECK_INTERVAL = 5  # Measure connections every 5 reports (2.5 minutes)
    
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
