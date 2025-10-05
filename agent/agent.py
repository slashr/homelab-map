#!/usr/bin/env python3
"""
Homelab K3s Agent - Runs on each node as a DaemonSet
Collects node metadata and sends to aggregator service
"""

import os
import socket
import time
import logging
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

# =============================================================================
# CONFIGURATION: Update your home location here
# =============================================================================
# For the map to work, we need approximate coordinates. You can find yours at:
# https://www.latlong.net/ or just search "your city latitude longitude"
HOME_LOCATION = {
    'city': 'Berlin, Germany',  # UPDATE THIS: Your city name
    'lat': 52.5200,               # UPDATE THIS: Approximate latitude
    'lon': 13.4050,             # UPDATE THIS: Approximate longitude
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


def main():
    """Main agent loop"""
    logger.info(f"Starting Homelab K3s Agent on {NODE_NAME}")
    logger.info(f"Aggregator URL: {AGGREGATOR_URL}")
    logger.info(f"Report interval: {REPORT_INTERVAL}s")
    
    while True:
        try:
            # Collect node information
            node_data = get_node_info()
            node_data['timestamp'] = time.time()
            
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
