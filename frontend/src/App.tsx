import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import ClusterMap from './components/ClusterMap';
import StatsPanel from './components/StatsPanel';
import { Node, ClusterStats, Connection } from './types';
import './App.css';

// Use relative path in production (behind ingress), or env var for local dev
const AGGREGATOR_URL = process.env.REACT_APP_AGGREGATOR_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:8000' : '');
const REFRESH_INTERVAL = 10000; // 10 seconds

function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [stats, setStats] = useState<ClusterStats | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ id: string; token: number } | null>(null);
  
  // Load theme preference from localStorage, default to light mode
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved !== null ? saved === 'true' : false; // Default to light mode
  });
  
  // Save theme preference when it changes
  useEffect(() => {
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  const fetchData = async () => {
    try {
      const [nodesResponse, statsResponse, connectionsResponse] = await Promise.all([
        axios.get(`${AGGREGATOR_URL}/api/nodes`),
        axios.get(`${AGGREGATOR_URL}/api/stats`),
        axios.get(`${AGGREGATOR_URL}/api/connections`)
      ]);

      setNodes(nodesResponse.data);
      setStats(statsResponse.data);
      setConnections(connectionsResponse.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to connect to aggregator service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selection?.id) {
      return;
    }
    const exists = nodes.some((node) => node.name === selection.id);
    if (!exists) {
      setSelection(null);
    }
  }, [nodes, selection?.id]);

  const handleNodeSelect = useCallback((nodeName: string) => {
    setSelection({ id: nodeName, token: Date.now() });
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
          <h1>🏠 Homelab K3s Cluster Map</h1>
          <button 
            className="theme-toggle"
            onClick={() => setDarkMode(!darkMode)}
            aria-label="Toggle theme"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
        {error && <div className="error-banner">{error}</div>}
      </header>
      
      <div className="app-content">
        <StatsPanel
          stats={stats}
          nodes={nodes}
          darkMode={darkMode}
          selectedNodeId={selection?.id || null}
          onNodeSelect={handleNodeSelect}
        />
        <ClusterMap
          nodes={nodes}
          connections={connections}
          darkMode={darkMode}
          selectedNodeId={selection?.id || null}
          selectionToken={selection?.token || 0}
        />
      </div>
    </div>
  );
}

export default App;
