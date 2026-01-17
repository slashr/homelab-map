export interface Node {
  name: string;
  hostname: string;
  internal_ip?: string;
  external_ip?: string;
  lat?: number;
  lon?: number;
  location?: string;
  provider?: string;
  status: 'online' | 'offline' | 'warning';
  cpu_percent?: number;
  memory_percent?: number;
  disk_percent?: number;
  network_tx_bytes_per_sec?: number;
  network_rx_bytes_per_sec?: number;
  last_seen_timestamp?: number;
  last_seen: string;
  kubelet_version?: string;
}

export interface Connection {
  source_node: string;
  source_lat: number;
  source_lon: number;
  target_node: string;
  target_lat: number;
  target_lon: number;
  latency_ms: number;
  min_ms?: number;
  max_ms?: number;
}

export interface ClusterStats {
  total_nodes: number;
  online_nodes: number;
  offline_nodes: number;
  avg_cpu_percent: number;
  avg_memory_percent: number;
  avg_disk_percent: number;
  avg_network_tx_bytes_per_sec: number;
  avg_network_rx_bytes_per_sec: number;
  providers: Record<string, number>;
  total_connections?: number;
  timestamp: string;
}
