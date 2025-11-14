import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import ClusterMap from './components/ClusterMap';
import StatsPanel from './components/StatsPanel';
import { Node, ClusterStats, Connection } from './types';
import { mockNodes, mockConnections, mockStats } from './mockData';
import './App.css';

// Use relative path in production (behind ingress), or env var for local dev
const AGGREGATOR_URL = process.env.REACT_APP_AGGREGATOR_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:8000' : '');
const REFRESH_INTERVAL = 10000; // 10 seconds
const USE_MOCK_DATA = process.env.REACT_APP_USE_MOCK_DATA === 'true' || false;

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

      setNodes(nodesResponse.data);
      setStats(statsResponse.data);
      setConnections(connectionsResponse.data);
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

  const handleNodeDeselect = useCallback(() => {
    setSelection(null);
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
            <h1>🏠 Homelab K3s Cluster Map</h1>
          </div>
          <button 
            className="theme-toggle"
            onClick={() => setDarkMode(!darkMode)}
            aria-label="Toggle theme"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
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
          onNodeSelect={handleNodeSelect}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <ClusterMap
          nodes={nodes}
          connections={connections}
          darkMode={darkMode}
          selectedNodeId={selection?.id || null}
          selectionToken={selection?.token || 0}
          onNodeSelect={handleNodeSelect}
          onNodeDeselect={handleNodeDeselect}
        />
      </div>
    </div>
  );
}

export default App;
