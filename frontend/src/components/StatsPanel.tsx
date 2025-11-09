import React from 'react';
import { ClusterStats, Node } from '../types';
import { formatBytesPerSecond } from '../utils/format';
import './StatsPanel.css';

interface StatsPanelProps {
  stats: ClusterStats | null;
  nodes: Node[];
  darkMode: boolean;
  selectedNodeId: string | null;
  onNodeSelect: (nodeName: string) => void;
}

const StatsPanel: React.FC<StatsPanelProps> = ({
  stats,
  nodes,
  darkMode,
  selectedNodeId,
  onNodeSelect,
}) => {
  if (!stats) {
    return null;
  }

  return (
    <div className={`stats-panel ${darkMode ? 'dark' : 'light'}`}>
      <div className="stats-section">
        <h2>Cluster Overview</h2>
        
        <div className="stat-card">
          <div className="stat-icon">🖥️</div>
          <div className="stat-content">
            <div className="stat-value">{stats.total_nodes}</div>
            <div className="stat-label">Total Nodes</div>
          </div>
        </div>

        <div className="stat-card online">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <div className="stat-value">{stats.online_nodes}</div>
            <div className="stat-label">Online</div>
          </div>
        </div>

        {stats.offline_nodes > 0 && (
          <div className="stat-card offline">
            <div className="stat-icon">❌</div>
            <div className="stat-content">
              <div className="stat-value">{stats.offline_nodes}</div>
              <div className="stat-label">Offline</div>
            </div>
          </div>
        )}
      </div>

      <div className="stats-section">
        <h2>Resource Usage</h2>
        
        <div className="metric-bar">
          <div className="metric-label">
            <span>CPU</span>
            <span className="metric-value">{stats.avg_cpu_percent.toFixed(1)}%</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill cpu"
              style={{ width: `${Math.min(stats.avg_cpu_percent, 100)}%` }}
            ></div>
          </div>
        </div>

        <div className="metric-bar">
          <div className="metric-label">
            <span>Memory</span>
            <span className="metric-value">{stats.avg_memory_percent.toFixed(1)}%</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill memory"
              style={{ width: `${Math.min(stats.avg_memory_percent, 100)}%` }}
            ></div>
          </div>
        </div>

        <div className="metric-bar">
          <div className="metric-label">
            <span>Disk</span>
            <span className="metric-value">{stats.avg_disk_percent.toFixed(1)}%</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill disk"
              style={{ width: `${Math.min(stats.avg_disk_percent, 100)}%` }}
            ></div>
          </div>
        </div>

        <div className="throughput-cards">
          <div className="throughput-card upload">
            <div className="throughput-label">Upload</div>
            <div className="throughput-value">
              {formatBytesPerSecond(stats.avg_network_tx_bytes_per_sec)}
            </div>
          </div>
          <div className="throughput-card download">
            <div className="throughput-label">Download</div>
            <div className="throughput-value">
              {formatBytesPerSecond(stats.avg_network_rx_bytes_per_sec)}
            </div>
          </div>
        </div>
      </div>

      <div className="stats-section">
        <h2>Providers</h2>
        {Object.entries(stats.providers).map(([provider, count]) => (
          <div key={provider} className="provider-item">
            <span className="provider-name">{provider}</span>
            <span className="provider-count">{count}</span>
          </div>
        ))}
      </div>

      <div className="stats-section nodes-list">
        <h2>Nodes</h2>
        {nodes.map((node) => (
          <div
            key={node.name}
            className={`node-item status-${node.status} ${
              selectedNodeId === node.name ? 'active' : ''
            }`}
            role="button"
            tabIndex={0}
            onClick={() => onNodeSelect(node.name)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onNodeSelect(node.name);
              }
            }}
            aria-pressed={selectedNodeId === node.name}
          >
            <div className="node-item-header">
              <div className="node-name">{node.name}</div>
              <div className="node-status">{node.status}</div>
            </div>
            {(node.network_tx_bytes_per_sec !== undefined ||
              node.network_rx_bytes_per_sec !== undefined) && (
              <div className="node-throughput">
                <span>⬆ {formatBytesPerSecond(node.network_tx_bytes_per_sec)}</span>
                <span>⬇ {formatBytesPerSecond(node.network_rx_bytes_per_sec)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatsPanel;
