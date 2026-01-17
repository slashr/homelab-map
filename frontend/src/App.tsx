import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import axios from 'axios';
import StatsPanel from './components/StatsPanel';
import { Node, ClusterStats, Connection } from './types';
import { mockNodes, mockConnections, mockStats } from './mockData';
import './App.css';

// Password modal state
interface PasswordModalState {
  passwordInput: string;
  passwordError: boolean;
}

// Lazy load heavy map components to improve initial page load
const DeckGLMap = lazy(() => import('./components/DeckGLMap'));

// Use relative path in production (behind ingress), or env var for local dev
const AGGREGATOR_URL = process.env.REACT_APP_AGGREGATOR_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:8000' : '');
const REFRESH_INTERVAL = 15000; // 15 seconds (reduced from 10s to lower server load)
const REFRESH_INTERVAL_BACKGROUND = 60000; // 60 seconds when tab is hidden
const USE_MOCK_DATA = process.env.REACT_APP_USE_MOCK_DATA === 'true' || false;

function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [stats, setStats] = useState<ClusterStats | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionsTotal, setConnectionsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ id: string; token: number } | null>(null);
  const [zoomOnly, setZoomOnly] = useState(false);
  
  // Load theme preference from localStorage, default to light mode
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved !== null ? saved === 'true' : false; // Default to light mode
  });

  // Interactive mode for AI quotes (global toggle)
  const [interactiveMode, setInteractiveMode] = useState(false);
  const [interactivePassword, setInteractivePassword] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState<PasswordModalState>({
    passwordInput: '',
    passwordError: false,
  });

  // Handle password submission for interactive mode
  const handlePasswordSubmit = async () => {
    const testNode = nodes[0]?.name || 'michael-pi';
    try {
      await axios.post(`${AGGREGATOR_URL}/api/quote/${testNode}`, {
        password: passwordModal.passwordInput
      });
      // Password valid - enable interactive mode
      setInteractivePassword(passwordModal.passwordInput);
      setInteractiveMode(true);
      setShowPasswordModal(false);
      setPasswordModal({ passwordInput: '', passwordError: false });
    } catch {
      setPasswordModal(prev => ({ ...prev, passwordError: true }));
    }
  };
  
  // Sidebar visibility for mobile - start open on desktop, closed on mobile
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return window.innerWidth > 768;
  });
  
  // Update sidebar state on window resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Save theme preference when it changes
  useEffect(() => {
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  const fetchData = async () => {
    // Use mock data if enabled or if aggregator is unavailable
    if (USE_MOCK_DATA) {
      setNodes(mockNodes);
      setStats(mockStats);
      setConnections(mockConnections);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      const [nodesResponse, statsResponse, connectionsResponse] = await Promise.all([
        axios.get(`${AGGREGATOR_URL}/api/nodes`),
        axios.get(`${AGGREGATOR_URL}/api/stats`),
        axios.get(`${AGGREGATOR_URL}/api/connections`)
      ]);

      // Only update state if data has actually changed to prevent unnecessary re-renders
      setNodes(prevNodes => {
        const newNodes = nodesResponse.data;
        // Quick comparison: check length and first/last node names
        if (prevNodes.length !== newNodes.length) return newNodes;
        if (prevNodes.length > 0 && (
          prevNodes[0].name !== newNodes[0].name ||
          prevNodes[prevNodes.length - 1].name !== newNodes[newNodes.length - 1].name
        )) return newNodes;
        // Deep comparison for actual changes - check all fields used by UI
        // Create a map for O(1) lookup by name
        const newNodeMap = new Map<string, Node>(newNodes.map((n: Node) => [n.name, n]));
        
        const nodesChanged = prevNodes.some((node) => {
          const newNode = newNodeMap.get(node.name);
          if (!newNode) return true;
          
          // Compare all fields that could change and are used by the UI
          return node.name !== newNode.name ||
                 node.status !== newNode.status ||
                 node.lat !== newNode.lat ||
                 node.lon !== newNode.lon ||
                 node.location !== newNode.location ||
                 node.provider !== newNode.provider ||
                 node.external_ip !== newNode.external_ip ||
                 node.internal_ip !== newNode.internal_ip ||
                 node.cpu_percent !== newNode.cpu_percent ||
                 node.memory_percent !== newNode.memory_percent ||
                 node.disk_percent !== newNode.disk_percent ||
                 node.network_tx_bytes_per_sec !== newNode.network_tx_bytes_per_sec ||
                 node.network_rx_bytes_per_sec !== newNode.network_rx_bytes_per_sec ||
                 node.last_seen_timestamp !== newNode.last_seen_timestamp ||
                 node.last_seen !== newNode.last_seen ||
                 node.kubelet_version !== newNode.kubelet_version;
        });
        return nodesChanged ? newNodes : prevNodes;
      });

      setStats(prevStats => {
        const newStats = statsResponse.data;
        if (!prevStats) return newStats;
        // Only update if stats actually changed
        if (prevStats.total_nodes !== newStats.total_nodes ||
            prevStats.online_nodes !== newStats.online_nodes ||
            prevStats.offline_nodes !== newStats.offline_nodes) {
          return newStats;
        }
        return prevStats;
      });

      setConnections(prevConnections => {
        const newConnections = connectionsResponse.data;
        setConnectionsTotal(newConnections.length);
        // Quick comparison: check length
        if (prevConnections.length !== newConnections.length) return newConnections;
        
        // Create a map for O(1) lookup by connection key
        const newConnMap = new Map<string, Connection>(
          newConnections.map((c: Connection) => [`${c.source_node}-${c.target_node}`, c])
        );
        
        // Compare all connections - check all fields that could change
        const connectionsChanged = prevConnections.some((conn) => {
          const key = `${conn.source_node}-${conn.target_node}`;
          const newConn = newConnMap.get(key);
          if (!newConn) return true;
          
          // Compare all fields that could change
          return conn.source_node !== newConn.source_node ||
                 conn.target_node !== newConn.target_node ||
                 conn.latency_ms !== newConn.latency_ms ||
                 conn.min_ms !== newConn.min_ms ||
                 conn.max_ms !== newConn.max_ms ||
                 conn.source_lat !== newConn.source_lat ||
                 conn.source_lon !== newConn.source_lon ||
                 conn.target_lat !== newConn.target_lat ||
                 conn.target_lon !== newConn.target_lon;
        });
        
        return connectionsChanged ? newConnections : prevConnections;
      });

      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      console.log('Falling back to mock data...');
      // Fallback to mock data if aggregator is unavailable
      setNodes(mockNodes);
      setStats(mockStats);
      setConnections(mockConnections);
      setError('Using mock data - aggregator unavailable');
    } finally {
      setLoading(false);
    }
  };

  // Track if tab is visible for polling optimization
  const isVisibleRef = useRef(!document.hidden);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);

  // Debounced fetch to prevent multiple rapid fetches
  const debouncedFetch = useCallback(() => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    fetchData().finally(() => {
      isFetchingRef.current = false;
    });
  }, []);

  // Setup polling with visibility-aware interval
  useEffect(() => {
    const setupInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      // Use longer interval when tab is hidden
      const interval = isVisibleRef.current ? REFRESH_INTERVAL : REFRESH_INTERVAL_BACKGROUND;
      intervalRef.current = setInterval(debouncedFetch, interval);
    };

    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
      setupInterval();
      // Fetch immediately when becoming visible (data may be stale)
      if (isVisibleRef.current) {
        debouncedFetch();
      }
    };

    // Initial fetch
    debouncedFetch();
    setupInterval();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [debouncedFetch]);

  // Use a Set for O(1) lookup instead of O(n) .some() check
  const nodeNamesSet = useMemo(() => new Set(nodes.map(n => n.name)), [nodes]);
  
  useEffect(() => {
    if (!selection?.id) {
      return;
    }
    if (!nodeNamesSet.has(selection.id)) {
      setSelection(null);
    }
  }, [nodeNamesSet, selection?.id]);

  const handleNodeSelect = useCallback((nodeName: string) => {
    setSelection({ id: nodeName, token: Date.now() });
    setZoomOnly(false); // Show details in sidebar
  }, []);

  const handleNodeZoom = useCallback((nodeName: string) => {
    setSelection({ id: nodeName, token: Date.now() });
    setZoomOnly(true); // Zoom only, don't show details
  }, []);

  const handleNodeDeselect = useCallback(() => {
    setSelection(null);
    setZoomOnly(false);
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading cluster data...</p>
      </div>
    );
  }

  return (
    <div className={`App ${darkMode ? 'dark-mode' : 'light-mode'}`}>
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <button 
              className="sidebar-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle sidebar"
              aria-expanded={sidebarOpen}
            >
              ☰
            </button>
            <h1>Dunder Mifflin</h1>
          </div>
          <div className="header-right">
            <button
              className={`interactive-toggle ${interactiveMode ? 'active' : ''}`}
              onClick={() => interactiveMode ? setInteractiveMode(false) : setShowPasswordModal(true)}
              aria-label="Toggle interactive mode"
              title={interactiveMode ? 'Disable interactive AI quotes' : 'Enable interactive AI quotes'}
            >
              {interactiveMode ? '🎭' : '🔒'}
            </button>
            <button
              className="theme-toggle"
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle theme"
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
        {error && (
          <div className={`error-banner ${error.includes('mock') ? 'info-banner' : ''}`}>
            {error}
          </div>
        )}
      </header>
      
      <div className="app-content">
        <div 
          className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
          onClick={() => setSidebarOpen(false)}
          aria-hidden={!sidebarOpen}
        />
        <StatsPanel
          stats={stats}
          nodes={nodes}
          darkMode={darkMode}
          selectedNodeId={selection?.id || null}
          showDetails={selection !== null && !zoomOnly}
          onNodeSelect={handleNodeZoom}
          onNodeDeselect={handleNodeDeselect}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          interactiveMode={interactiveMode}
          interactivePassword={interactivePassword}
        />
        <Suspense fallback={<div className="map-loading">Loading map...</div>}>
          <DeckGLMap
            nodes={nodes}
            connections={connections}
            darkMode={darkMode}
            connectionsTotal={connectionsTotal}
            selectedNodeId={selection?.id || null}
            selectionToken={selection?.token || 0}
            onNodeSelect={handleNodeSelect}
            onNodeDeselect={handleNodeDeselect}
          />
        </Suspense>
      </div>

      {/* Password Modal for Interactive Mode */}
      {showPasswordModal && (
        <div className="password-modal-overlay" onClick={() => {
          setShowPasswordModal(false);
          setPasswordModal({ passwordInput: '', passwordError: false });
        }}>
          <div className="password-modal" onClick={e => e.stopPropagation()}>
            <h4>Enter Password</h4>
            <p className="password-modal-hint">Enable interactive AI quotes</p>
            <input
              type="password"
              placeholder="Password"
              autoFocus
              value={passwordModal.passwordInput}
              className={passwordModal.passwordError ? 'error' : ''}
              onChange={(e) => {
                setPasswordModal({ passwordInput: e.target.value, passwordError: false });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handlePasswordSubmit();
                } else if (e.key === 'Escape') {
                  setShowPasswordModal(false);
                  setPasswordModal({ passwordInput: '', passwordError: false });
                }
              }}
            />
            {passwordModal.passwordError && <span className="error-text">Incorrect password</span>}
            <div className="modal-buttons">
              <button
                className="modal-button cancel"
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordModal({ passwordInput: '', passwordError: false });
                }}
              >
                Cancel
              </button>
              <button
                className="modal-button submit"
                onClick={handlePasswordSubmit}
              >
                Enter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
