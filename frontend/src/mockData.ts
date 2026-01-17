import { Node, Connection, ClusterStats } from './types';

const mockNow = Math.floor(Date.now() / 1000);

// Mock nodes with various locations around the world
export const mockNodes: Node[] = [
  {
    name: 'michael-1',
    hostname: 'michael-1',
    internal_ip: '10.0.1.10',
    external_ip: '192.168.1.10',
    lat: 40.7128,
    lon: -74.0060,
    location: 'New York, USA',
    provider: 'Raspberry-Pi',
    status: 'online',
    cpu_percent: 12.5,
    memory_percent: 45.2,
    disk_percent: 62.3,
    network_tx_bytes_per_sec: 1024000,
    network_rx_bytes_per_sec: 2048000,
    last_seen_timestamp: mockNow - 5,
    last_seen: '5s ago',
    kubelet_version: 'v1.28.0'
  },
  {
    name: 'jim-2',
    hostname: 'jim-2',
    internal_ip: '10.0.1.11',
    external_ip: '192.168.1.11',
    lat: 51.5074,
    lon: -0.1278,
    location: 'London, UK',
    provider: 'Oracle',
    status: 'online',
    cpu_percent: 8.3,
    memory_percent: 32.1,
    disk_percent: 58.7,
    network_tx_bytes_per_sec: 512000,
    network_rx_bytes_per_sec: 1024000,
    last_seen_timestamp: mockNow - 3,
    last_seen: '3s ago',
    kubelet_version: 'v1.28.0'
  },
  {
    name: 'dwight-3',
    hostname: 'dwight-3',
    internal_ip: '10.0.1.12',
    external_ip: '192.168.1.12',
    lat: 52.5200,
    lon: 13.4050,
    location: 'Berlin, Germany',
    provider: 'Raspberry-Pi',
    status: 'online',
    cpu_percent: 15.7,
    memory_percent: 38.9,
    disk_percent: 71.2,
    network_tx_bytes_per_sec: 768000,
    network_rx_bytes_per_sec: 1536000,
    last_seen_timestamp: mockNow - 7,
    last_seen: '7s ago',
    kubelet_version: 'v1.27.5'
  },
  {
    name: 'angela-4',
    hostname: 'angela-4',
    internal_ip: '10.0.1.13',
    external_ip: '192.168.1.13',
    lat: 35.6762,
    lon: 139.6503,
    location: 'Tokyo, Japan',
    provider: 'Gcp',
    status: 'online',
    cpu_percent: 22.1,
    memory_percent: 55.3,
    disk_percent: 48.9,
    network_tx_bytes_per_sec: 2048000,
    network_rx_bytes_per_sec: 4096000,
    last_seen_timestamp: mockNow - 2,
    last_seen: '2s ago',
    kubelet_version: 'v1.28.0'
  },
  {
    name: 'stanley-5',
    hostname: 'stanley-5',
    internal_ip: '10.0.1.14',
    external_ip: '192.168.1.14',
    lat: -33.8688,
    lon: 151.2093,
    location: 'Sydney, Australia',
    provider: 'Oracle',
    status: 'online',
    cpu_percent: 18.6,
    memory_percent: 42.7,
    disk_percent: 65.4,
    network_tx_bytes_per_sec: 1536000,
    network_rx_bytes_per_sec: 3072000,
    last_seen_timestamp: mockNow - 4,
    last_seen: '4s ago',
    kubelet_version: 'v1.27.5'
  },
  {
    name: 'phyllis-6',
    hostname: 'phyllis-6',
    internal_ip: '10.0.1.15',
    external_ip: '192.168.1.15',
    lat: 37.7749,
    lon: -122.4194,
    location: 'San Francisco, USA',
    provider: 'Raspberry-Pi',
    status: 'online',
    cpu_percent: 9.2,
    memory_percent: 28.5,
    disk_percent: 52.1,
    network_tx_bytes_per_sec: 896000,
    network_rx_bytes_per_sec: 1792000,
    last_seen_timestamp: mockNow - 6,
    last_seen: '6s ago',
    kubelet_version: 'v1.28.0'
  },
  {
    name: 'toby-7',
    hostname: 'toby-7',
    internal_ip: '10.0.1.16',
    external_ip: '192.168.1.16',
    lat: 55.7558,
    lon: 37.6173,
    location: 'Moscow, Russia',
    provider: 'Oracle',
    status: 'warning',
    cpu_percent: 25.3,
    memory_percent: 68.2,
    disk_percent: 78.5,
    network_tx_bytes_per_sec: 256000,
    network_rx_bytes_per_sec: 512000,
    last_seen_timestamp: mockNow - 45,
    last_seen: '45s ago',
    kubelet_version: 'v1.27.5'
  }
];

// Mock connections between nodes
export const mockConnections: Connection[] = [
  {
    source_node: 'michael-1',
    source_lat: 40.7128,
    source_lon: -74.0060,
    target_node: 'jim-2',
    target_lat: 51.5074,
    target_lon: -0.1278,
    latency_ms: 45.2,
    min_ms: 42.1,
    max_ms: 48.5
  },
  {
    source_node: 'michael-1',
    source_lat: 40.7128,
    source_lon: -74.0060,
    target_node: 'phyllis-6',
    target_lat: 37.7749,
    target_lon: -122.4194,
    latency_ms: 12.8,
    min_ms: 11.2,
    max_ms: 14.5
  },
  {
    source_node: 'jim-2',
    source_lat: 51.5074,
    source_lon: -0.1278,
    target_node: 'dwight-3',
    target_lat: 52.5200,
    target_lon: 13.4050,
    latency_ms: 18.5,
    min_ms: 16.3,
    max_ms: 21.2
  },
  {
    source_node: 'jim-2',
    source_lat: 51.5074,
    source_lon: -0.1278,
    target_node: 'toby-7',
    target_lat: 55.7558,
    target_lon: 37.6173,
    latency_ms: 125.3,
    min_ms: 118.7,
    max_ms: 132.1
  },
  {
    source_node: 'dwight-3',
    source_lat: 52.5200,
    source_lon: 13.4050,
    target_node: 'angela-4',
    target_lat: 35.6762,
    target_lon: 139.6503,
    latency_ms: 185.7,
    min_ms: 178.2,
    max_ms: 192.4
  },
  {
    source_node: 'angela-4',
    source_lat: 35.6762,
    source_lon: 139.6503,
    target_node: 'stanley-5',
    target_lat: -33.8688,
    target_lon: 151.2093,
    latency_ms: 95.4,
    min_ms: 89.1,
    max_ms: 102.8
  },
  {
    source_node: 'phyllis-6',
    source_lat: 37.7749,
    source_lon: -122.4194,
    target_node: 'michael-1',
    target_lat: 40.7128,
    target_lon: -74.0060,
    latency_ms: 68.2,
    min_ms: 64.5,
    max_ms: 72.1
  },
  {
    source_node: 'toby-7',
    source_lat: 55.7558,
    source_lon: 37.6173,
    target_node: 'dwight-3',
    target_lat: 52.5200,
    target_lon: 13.4050,
    latency_ms: 38.9,
    min_ms: 35.2,
    max_ms: 42.7
  }
];

// Mock cluster stats
export const mockStats: ClusterStats = {
  total_nodes: 7,
  online_nodes: 6,
  offline_nodes: 0,
  avg_cpu_percent: 15.9,
  avg_memory_percent: 44.4,
  avg_disk_percent: 62.5,
  avg_network_tx_bytes_per_sec: 1024000,
  avg_network_rx_bytes_per_sec: 2048000,
  providers: {
    'Raspberry-Pi': 3,
    'Oracle': 3,
    'Gcp': 1
  },
  total_connections: 8,
  timestamp: new Date().toISOString()
};
