import React, { memo } from 'react';
import { ClusterStats, Node } from '../types';
import { formatBytesPerSecond } from '../utils/format';
import { getCharacterFromNodeName, getCharacterImage, getCharacterQuote } from '../utils/characterUtils';
import './StatsPanel.css';

interface StatsPanelProps {
  stats: ClusterStats | null;
  nodes: Node[];
  darkMode: boolean;
  selectedNodeId: string | null;
  showDetails?: boolean;
  onNodeSelect: (nodeName: string) => void;
  onNodeDeselect?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const StatsPanel: React.FC<StatsPanelProps> = ({
  stats,
  nodes,
  darkMode,
  selectedNodeId,
  showDetails = false,
  onNodeSelect,
  onNodeDeselect,
  isOpen = true,
  onClose,
}) => {
  if (!stats) {
    return null;
  }

  const selectedNode = selectedNodeId && showDetails ? nodes.find((node) => node.name === selectedNodeId) : null;

  return (
    <div className={`stats-panel ${darkMode ? 'dark' : 'light'} ${isOpen ? 'open' : ''} ${showDetails ? 'showing-details' : ''}`}>
      {onClose && (
        <button
          className="stats-panel__close"
          onClick={onClose}
          aria-label="Close sidebar"
        >
          ×
        </button>
      )}
      
      {showDetails && selectedNode ? (
        <>
          <div className="stats-section node-details">
            <div className="node-details-header">
              <h2>Node Details</h2>
              {onNodeDeselect && (
                <button
                  className="node-details-close"
                  onClick={onNodeDeselect}
                  aria-label="Close node details"
                  title="Close"
                >
                  ×
                </button>
              )}
            </div>
            
            <div className="node-details-content">
            <div className="node-details-title">
              <div className="node-details-title-content">
                <img 
                  src={getCharacterImage(selectedNode.name)} 
                  alt={selectedNode.name}
                  className="node-character-image"
                  onError={(e) => {
                    // Fallback to a placeholder if image fails to load
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${selectedNode.name}&size=128&background=667eea&color=fff&bold=true`;
                  }}
                />
                <div className="node-details-title-text">
                  <h3>{selectedNode.name}</h3>
                  <span className={`status-pill status-${selectedNode.status}`}>
                    {selectedNode.status}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="node-quote">
              <div className="node-quote-text">
                "{getCharacterQuote(getCharacterFromNodeName(selectedNode.name))}"
              </div>
            </div>
            
            {selectedNode.location && (
                <div className="node-detail-item">
                  <span className="node-detail-label">Location</span>
                  <span className="node-detail-value">{selectedNode.location}</span>
                </div>
              )}

              {selectedNode.provider && (
                <div className="node-detail-item">
                  <span className="node-detail-label">Provider</span>
                  <span className="node-detail-value">{selectedNode.provider}</span>
                </div>
              )}

              {selectedNode.external_ip && (
                <div className="node-detail-item">
                  <span className="node-detail-label">External IP</span>
                  <code className="node-detail-value">{selectedNode.external_ip}</code>
                </div>
              )}

              {selectedNode.internal_ip && (
                <div className="node-detail-item">
                  <span className="node-detail-label">Internal IP</span>
                  <code className="node-detail-value">{selectedNode.internal_ip}</code>
                </div>
              )}

              <div className="node-details-metrics">
                <div className="node-detail-metric">
                  <span className="node-detail-label">CPU</span>
                  <span className="node-detail-value">
                    {selectedNode.cpu_percent != null ? `${selectedNode.cpu_percent.toFixed(1)}%` : '—'}
                  </span>
                </div>
                <div className="node-detail-metric">
                  <span className="node-detail-label">Memory</span>
                  <span className="node-detail-value">
                    {selectedNode.memory_percent != null ? `${selectedNode.memory_percent.toFixed(1)}%` : '—'}
                  </span>
                </div>
                <div className="node-detail-metric">
                  <span className="node-detail-label">Disk</span>
                  <span className="node-detail-value">
                    {selectedNode.disk_percent != null ? `${selectedNode.disk_percent.toFixed(1)}%` : '—'}
                  </span>
                </div>
              </div>

              {(selectedNode.network_tx_bytes_per_sec != null ||
                selectedNode.network_rx_bytes_per_sec != null) && (
                <div className="node-detail-item">
                  <span className="node-detail-label">Network</span>
                  <span className="node-detail-value">
                    ⬆ {formatBytesPerSecond(selectedNode.network_tx_bytes_per_sec)} · ⬇{' '}
                    {formatBytesPerSecond(selectedNode.network_rx_bytes_per_sec)}
                  </span>
                </div>
              )}

              <div className="node-detail-item">
                <span className="node-detail-label">Last seen</span>
                <span className="node-detail-value">{selectedNode.last_seen}</span>
              </div>

              {selectedNode.kubelet_version && (
                <div className="node-detail-item">
                  <span className="node-detail-label">Kubelet</span>
                  <code className="node-detail-value">{selectedNode.kubelet_version}</code>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
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
                onClick={() => {
                  onNodeSelect(node.name);
                  // Close sidebar on mobile after selection
                  if (onClose && window.innerWidth <= 768) {
                    onClose();
                  }
                }}
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
        </>
      )}
    </div>
  );
};

// Memoize to prevent re-renders when parent state changes but props are identical
export default memo(StatsPanel);
