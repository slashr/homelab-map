import React, { memo, useState, useEffect } from 'react';
import axios from 'axios';
import { ClusterStats, Node } from '../types';
import { formatBytesPerSecond } from '../utils/format';
import { getCharacterFromNodeName, getCharacterImage, getCharacterQuote } from '../utils/characterUtils';
import './StatsPanel.css';

// Use relative path in production (behind ingress), or env var for local dev
const AGGREGATOR_URL = process.env.REACT_APP_AGGREGATOR_URL ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:8000' : '');

// Format a timestamp as relative time (e.g., "2s ago", "5m ago")
const formatRelativeTime = (timestamp: number | string | undefined): string => {
  if (timestamp === undefined) return 'unknown';
  if (typeof timestamp === 'string') {
    const trimmed = timestamp.trim();
    if (trimmed.endsWith('ago')) return trimmed;
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return formatRelativeTime(Math.floor(parsed / 1000));
    }
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return formatRelativeTime(numeric);
    }
    return trimmed;
  }

  const now = Date.now();
  const then = timestamp * 1000;
  const diffMs = now - then;
  
  if (Number.isNaN(then)) return 'unknown';
  
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

// Format uptime in a human-readable format (e.g., "5d 3h 20m")
const formatUptime = (uptimeSeconds: number | undefined): string => {
  if (uptimeSeconds === undefined || uptimeSeconds < 0) return '—';
  
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

// Get temperature status class based on temperature value
const getTempClass = (temp: number | undefined, critical: number | undefined): string => {
  if (temp === undefined) return '';
  const threshold = critical || 85; // Default critical threshold
  if (temp >= threshold * 0.9) return 'temp-critical';
  if (temp >= 65) return 'temp-hot';
  if (temp >= 50) return 'temp-warm';
  return 'temp-cool';
};

// Check if CPU is throttling (current freq significantly below max)
const isThrottling = (current: number | undefined, max: number | undefined): boolean => {
  if (current === undefined || max === undefined || max <= 0) return false;
  return current < max * 0.85; // Less than 85% of max frequency
};

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
  const [quote, setQuote] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const selectedNode = selectedNodeId && showDetails ? nodes.find((node) => node.name === selectedNodeId) : null;

  // Fetch AI-generated quote when node is selected
  useEffect(() => {
    if (!selectedNode) {
      setQuote(null);
      return;
    }

    const abortController = new AbortController();
    const nodeName = selectedNode.name;

    const fetchQuote = async () => {
      setQuoteLoading(true);
      try {
        const response = await axios.get(`${AGGREGATOR_URL}/api/quote/${nodeName}`, {
          signal: abortController.signal,
        });
        // Only update state if this request wasn't aborted
        if (!abortController.signal.aborted) {
          setQuote(response.data.quote);
        }
      } catch (error) {
        // Ignore aborted requests
        if (axios.isCancel(error)) {
          return;
        }
        // Fallback to static quote on error
        console.warn('Failed to fetch AI quote, using fallback:', error);
        if (!abortController.signal.aborted) {
          setQuote(getCharacterQuote(getCharacterFromNodeName(nodeName)));
        }
      } finally {
        if (!abortController.signal.aborted) {
          setQuoteLoading(false);
        }
      }
    };

    fetchQuote();

    // Cleanup: abort request if node selection changes
    return () => {
      abortController.abort();
    };
  }, [selectedNode]);

  if (!stats) {
    return null;
  }

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
              <div className={`node-quote-text ${quoteLoading ? 'loading' : ''}`}>
                {quoteLoading ? (
                  <span className="quote-loading">Generating quote...</span>
                ) : (
                  `"${quote || getCharacterQuote(getCharacterFromNodeName(selectedNode.name))}"`
                )}
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

              {/* System Overview Box */}
              <div className="metrics-box">
                <div className="metrics-box-header">System</div>
                <div className="metrics-box-grid cols-4">
                  <div className="metric-cell">
                    <span className="metric-cell-value">
                      {selectedNode.cpu_percent != null ? `${selectedNode.cpu_percent.toFixed(1)}%` : '—'}
                    </span>
                    <span className="metric-cell-label">CPU</span>
                  </div>
                  <div className="metric-cell">
                    <span className="metric-cell-value">
                      {selectedNode.memory_percent != null ? `${selectedNode.memory_percent.toFixed(1)}%` : '—'}
                    </span>
                    <span className="metric-cell-label">Memory</span>
                  </div>
                  <div className="metric-cell">
                    <span className="metric-cell-value">
                      {selectedNode.disk_percent != null ? `${selectedNode.disk_percent.toFixed(1)}%` : '—'}
                    </span>
                    <span className="metric-cell-label">Disk</span>
                  </div>
                  {selectedNode.swap_percent != null && selectedNode.swap_percent > 0 ? (
                    <div className="metric-cell">
                      <span className={`metric-cell-value ${selectedNode.swap_percent > 50 ? 'swap-warning' : ''}`}>
                        {selectedNode.swap_percent.toFixed(1)}%
                      </span>
                      <span className="metric-cell-label">Swap</span>
                    </div>
                  ) : (
                    <div className="metric-cell">
                      <span className="metric-cell-value">{selectedNode.process_count ?? '—'}</span>
                      <span className="metric-cell-label">Procs</span>
                    </div>
                  )}
                </div>
                {selectedNode.load_avg_1m != null && (
                  <div className="metrics-box-row">
                    <span className="metrics-row-label">Load</span>
                    <span className="metrics-row-value">
                      {selectedNode.load_avg_1m.toFixed(2)} · {selectedNode.load_avg_5m?.toFixed(2) ?? '—'} · {selectedNode.load_avg_15m?.toFixed(2) ?? '—'}
                    </span>
                  </div>
                )}
                {selectedNode.uptime_seconds != null && (
                  <div className="metrics-box-row">
                    <span className="metrics-row-label">Uptime</span>
                    <span className="metrics-row-value">{formatUptime(selectedNode.uptime_seconds)}</span>
                  </div>
                )}
              </div>

              {/* Hardware Box - Temperature, Fan, Frequency */}
              {(selectedNode.cpu_temp_celsius != null || selectedNode.fan_rpm != null || selectedNode.cpu_freq_mhz != null) && (
                <div className="metrics-box hardware">
                  <div className="metrics-box-header">Hardware</div>
                  <div className="metrics-box-grid cols-3">
                    {selectedNode.cpu_temp_celsius != null && (
                      <div className="metric-cell">
                        <span className={`metric-cell-value ${getTempClass(selectedNode.cpu_temp_celsius, selectedNode.temp_critical)}`}>
                          {selectedNode.cpu_temp_celsius.toFixed(0)}°C
                        </span>
                        <span className="metric-cell-label">🌡️ Temp</span>
                      </div>
                    )}
                    {selectedNode.fan_rpm != null && (
                      <div className="metric-cell">
                        <span className="metric-cell-value">{selectedNode.fan_rpm}</span>
                        <span className="metric-cell-label">🌀 RPM</span>
                      </div>
                    )}
                    {selectedNode.cpu_freq_mhz != null && (
                      <div className="metric-cell">
                        <span className={`metric-cell-value ${isThrottling(selectedNode.cpu_freq_mhz, selectedNode.cpu_freq_max_mhz) ? 'throttled' : ''}`}>
                          {(selectedNode.cpu_freq_mhz / 1000).toFixed(1)}G{isThrottling(selectedNode.cpu_freq_mhz, selectedNode.cpu_freq_max_mhz) && '⚠️'}
                        </span>
                        <span className="metric-cell-label">⚡ Freq</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* I/O Box - Network and Disk */}
              {(selectedNode.network_tx_bytes_per_sec != null || selectedNode.disk_read_bytes_per_sec != null) && (
                <div className="metrics-box io">
                  <div className="metrics-box-header">I/O</div>
                  {(selectedNode.network_tx_bytes_per_sec != null || selectedNode.network_rx_bytes_per_sec != null) && (
                    <div className="metrics-box-row io-row">
                      <span className="metrics-row-label">Net</span>
                      <span className="metrics-row-value io-value">
                        <span className="io-up">⬆ {formatBytesPerSecond(selectedNode.network_tx_bytes_per_sec)}</span>
                        <span className="io-down">⬇ {formatBytesPerSecond(selectedNode.network_rx_bytes_per_sec)}</span>
                      </span>
                    </div>
                  )}
                  {(selectedNode.disk_read_bytes_per_sec != null || selectedNode.disk_write_bytes_per_sec != null) && (
                    <div className="metrics-box-row io-row">
                      <span className="metrics-row-label">Disk</span>
                      <span className="metrics-row-value io-value">
                        <span className="io-up">⬆ {formatBytesPerSecond(selectedNode.disk_write_bytes_per_sec)}</span>
                        <span className="io-down">⬇ {formatBytesPerSecond(selectedNode.disk_read_bytes_per_sec)}</span>
                      </span>
                    </div>
                  )}
                  {((selectedNode.network_errin != null && selectedNode.network_errin > 0) ||
                    (selectedNode.network_errout != null && selectedNode.network_errout > 0) ||
                    (selectedNode.network_dropin != null && selectedNode.network_dropin > 0)) && (
                    <div className="metrics-box-row io-row warning-row">
                      <span className="metrics-row-label">⚠️ Errors</span>
                      <span className="metrics-row-value network-errors">
                        {selectedNode.network_errin != null && selectedNode.network_errin > 0 && `Err↓${selectedNode.network_errin} `}
                        {selectedNode.network_errout != null && selectedNode.network_errout > 0 && `Err↑${selectedNode.network_errout} `}
                        {selectedNode.network_dropin != null && selectedNode.network_dropin > 0 && `Drop↓${selectedNode.network_dropin.toLocaleString()}`}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Info Box - Static details */}
              <div className="metrics-box info">
                <div className="metrics-box-header">Info</div>
                <div className="metrics-box-row">
                  <span className="metrics-row-label">Last seen</span>
                  <span className="metrics-row-value">
                    {formatRelativeTime(selectedNode.last_seen_timestamp ?? selectedNode.last_seen)}
                  </span>
                </div>
                {selectedNode.kubelet_version && (
                  <div className="metrics-box-row">
                    <span className="metrics-row-label">Kubelet</span>
                    <code className="metrics-row-value code">{selectedNode.kubelet_version}</code>
                  </div>
                )}
              </div>
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
                  <div className={`node-last-seen status-${node.status}`}>
                    {formatRelativeTime(node.last_seen_timestamp ?? node.last_seen)}
                  </div>
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
