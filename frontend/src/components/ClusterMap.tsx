import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import Globe, { GlobeMethods } from 'react-globe.gl';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import type { FeatureCollection, Geometry } from 'geojson';
import { capitalLabels, CapitalLabel } from '../data/capitals';
import { Node, Connection } from '../types';
import { formatBytesPerSecond } from '../utils/format';
import * as THREE from 'three';
import './ClusterMap.css';

interface ClusterMapProps {
  nodes: Node[];
  connections: Connection[];
  darkMode: boolean;
  selectedNodeId: string | null;
  selectionToken: number;
  onNodeSelect?: (nodeName: string) => void;
  onNodeDeselect?: () => void;
}

interface GlobeNodeDatum extends Node {
  lat: number;
  lng: number;
  isSelected: boolean;
  theme: 'dark' | 'light';
}

interface GlobeConnectionDatum {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: [string, string];
  altitude: number;
  latency: number;
  label: string;
}

const DARK_GLOBE = 'https://unpkg.com/three-globe/example/img/earth-night.jpg';
const LIGHT_GLOBE = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const BUMP_MAP = 'https://unpkg.com/three-globe/example/img/earth-topology.png';
const STARS = 'https://unpkg.com/three-globe/example/img/night-sky.png';

const getCharacterImage = (nodeName: string): string => {
  const character = nodeName.split('-')[0].toLowerCase();
  return `/characters/${character}.jpg`;
};

const getFallbackAvatar = (nodeName: string): string => {
  const character = nodeName.split('-')[0].toLowerCase();
  const fallbackNameMap: Record<string, string> = {
    michael: 'Michael+Scott',
    jim: 'Jim+Halpert',
    dwight: 'Dwight+Schrute',
    angela: 'Angela+Martin',
    stanley: 'Stanley+Hudson',
    phyllis: 'Phyllis+Vance',
    toby: 'Toby+Flenderson',
  };
  const fallbackColorMap: Record<string, string> = {
    michael: '667eea',
    jim: '4285F4',
    dwight: 'FFC107',
    angela: '9c27b0',
    stanley: 'ff9800',
    phyllis: '4caf50',
    toby: '795548',
  };

  const fallbackName = fallbackNameMap[character] || character;
  const fallbackColor = fallbackColorMap[character] || '607D8B';
  return `https://ui-avatars.com/api/?name=${fallbackName}&size=128&background=${fallbackColor}&color=fff&bold=true`;
};

const getLatencyColor = (latency: number, darkMode: boolean): [string, string] => {
  if (latency < 20) {
    return darkMode ? ['#00f5d4', '#00c2a8'] : ['#03c988', '#00a96f'];
  }
  if (latency < 60) {
    return darkMode ? ['#f9ff6c', '#ffd166'] : ['#f4a259', '#f6bd60'];
  }
  if (latency < 120) {
    return darkMode ? ['#ff8c42', '#ff6b35'] : ['#ff8243', '#ff5c2b'];
  }
  return darkMode ? ['#ff3f81', '#ff0054'] : ['#ff4d6d', '#d81159'];
};

const ClusterMap: React.FC<ClusterMapProps> = ({
  nodes,
  connections,
  darkMode,
  selectedNodeId,
  selectionToken,
  onNodeSelect,
  onNodeDeselect,
}) => {
  const globeRef = useRef<GlobeMethods>();
  const globeWrapperRef = useRef<HTMLDivElement>(null);
  const [globeSize, setGlobeSize] = React.useState<{ width: number; height: number } | null>(null);
  const [hoveredArc, setHoveredArc] = React.useState<GlobeConnectionDatum | null>(null);
  const [tooltipPosition, setTooltipPosition] = React.useState<{ x: number; y: number } | null>(null);
  const mousePositionRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Track mouse position for tooltip
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      mousePositionRef.current = { x: event.clientX, y: event.clientY };
      if (hoveredArc) {
        setTooltipPosition({ x: event.clientX, y: event.clientY });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [hoveredArc]);

  const nodesWithLocation = useMemo(
    () =>
      nodes
        .filter(
          (node) =>
            node.lat != null &&
            node.lon != null &&
            !Number.isNaN(node.lat) &&
            !Number.isNaN(node.lon)
        )
        .map((node) => ({
          ...node,
          lat: node.lat as number,
          lng: node.lon as number,
        })),
    [nodes]
  );

  const htmlMarkers = useMemo(
    () =>
      nodesWithLocation.map((node) => ({
        ...node,
        isSelected: node.name === selectedNodeId,
        theme: darkMode ? 'dark' : 'light',
      })),
    [nodesWithLocation, selectedNodeId, darkMode]
  );

  const nodeLookup = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    nodesWithLocation.forEach((node) => {
      map.set(node.name, { lat: node.lat, lng: node.lng });
    });
    return map;
  }, [nodesWithLocation]);

  const globeConnections = useMemo(() => {
    return connections
      .map((conn) => {
        const source = nodeLookup.get(conn.source_node);
        const target = nodeLookup.get(conn.target_node);
        if (!source || !target) {
          return null;
        }
        const colors = getLatencyColor(conn.latency_ms, darkMode);
        const altitude = 0.08 + Math.min(conn.latency_ms / 600, 0.3);
        return {
          startLat: source.lat,
          startLng: source.lng,
          endLat: target.lat,
          endLng: target.lng,
          color: colors,
          altitude,
          latency: conn.latency_ms,
          label: `${conn.source_node} → ${conn.target_node}`,
        } as GlobeConnectionDatum;
      })
      .filter((value): value is GlobeConnectionDatum => Boolean(value));
  }, [connections, nodeLookup, darkMode]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.name === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  const focusTarget = useMemo(
    () => nodesWithLocation.find((node) => node.name === selectedNodeId) ?? null,
    [nodesWithLocation, selectedNodeId]
  );
  const focusLat = focusTarget?.lat ?? null;
  const focusLng = focusTarget?.lng ?? null;

  const countryPolygons = useMemo(() => {
    const geoJson = feature(
      countriesTopo as any,
      (countriesTopo as any).objects.countries
    ) as unknown as FeatureCollection<Geometry>;
    return geoJson.features;
  }, []);

  // Handle globe resize to fill container
  useEffect(() => {
    if (!globeWrapperRef.current) {
      return;
    }

    const updateGlobeSize = () => {
      if (!globeWrapperRef.current) {
        return;
      }
      const container = globeWrapperRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      
      if (width > 0 && height > 0) {
        setGlobeSize({ width, height });
      }
    };

    // Initial size
    updateGlobeSize();

    // Resize on window resize
    window.addEventListener('resize', updateGlobeSize);
    
    // Use ResizeObserver for more accurate container size tracking
    const resizeObserver = new ResizeObserver(() => {
      updateGlobeSize();
    });
    
    resizeObserver.observe(globeWrapperRef.current);

    return () => {
      window.removeEventListener('resize', updateGlobeSize);
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!globeRef.current) {
      return;
    }
    const controls = globeRef.current.controls();
    controls.autoRotate = false;
    controls.enableZoom = true;
    controls.minDistance = 180;
    controls.maxDistance = 750;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    // Restrict vertical rotation to mostly horizontal with minimal tilting
    // Math.PI/2 is horizontal (equator view), allow ±0.08 radians (~4.6 degrees) of tilt
    // This prevents disorienting vertical rotation while allowing slight perspective adjustment
    controls.minPolarAngle = Math.PI / 2 - 0.08;
    controls.maxPolarAngle = Math.PI / 2 + 0.08;
    
    // Enforce constraints by listening to change events
    const enforceConstraints = () => {
      const spherical = new THREE.Spherical();
      spherical.setFromVector3(controls.object.position);
      // Clamp polar angle if it exceeds bounds
      if (spherical.phi < controls.minPolarAngle) {
        spherical.phi = controls.minPolarAngle;
        controls.object.position.setFromSpherical(spherical);
        controls.object.lookAt(0, 0, 0);
      } else if (spherical.phi > controls.maxPolarAngle) {
        spherical.phi = controls.maxPolarAngle;
        controls.object.position.setFromSpherical(spherical);
        controls.object.lookAt(0, 0, 0);
      }
    };
    
    // Listen to change events to enforce constraints
    controls.addEventListener('change', enforceConstraints);
    
    return () => {
      controls.removeEventListener('change', enforceConstraints);
    };
  }, []);

  useEffect(() => {
    if (
      !selectedNodeId ||
      !globeRef.current ||
      focusLat == null ||
      focusLng == null
    ) {
      return;
    }

    globeRef.current.pointOfView({ lat: focusLat, lng: focusLng, altitude: 1.3 }, 900);
  }, [selectedNodeId, selectionToken, focusLat, focusLng]);

  const renderMarker = useCallback(
    (nodeDatum: object) => {
      const datum = nodeDatum as GlobeNodeDatum;
      const container = document.createElement('div');
      container.className = `globe-node ${datum.theme} status-${datum.status} ${
        datum.isSelected ? 'selected' : ''
      }`;
      container.title = datum.name;
      container.tabIndex = 0;
      container.setAttribute('role', 'button');
      container.style.pointerEvents = 'auto';

      const handleSelect = (event?: MouseEvent | KeyboardEvent) => {
        event?.stopPropagation();
        onNodeSelect?.(datum.name);
      };

      container.addEventListener('click', handleSelect);
      container.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleSelect(event);
        }
      });

      const img = document.createElement('img');
      img.alt = datum.name;
      img.src = getCharacterImage(datum.name);
      img.onerror = () => {
        img.src = getFallbackAvatar(datum.name);
      };
      container.appendChild(img);

      return container;
    },
    [onNodeSelect]
  );

  if (nodesWithLocation.length === 0) {
    return (
      <div className="cluster-map empty">
        <p>No nodes with location data available</p>
      </div>
    );
  }

  // Handle Escape key to deselect
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedNodeId) {
        onNodeDeselect?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedNodeId, onNodeDeselect]);

  const handleMapClick = useCallback((event: React.MouseEvent) => {
    // Only deselect if clicking directly on the map container background, not on child elements
    if (event.target === event.currentTarget) {
      onNodeDeselect?.();
    }
  }, [onNodeDeselect]);

  return (
    <div 
      className={`cluster-map ${darkMode ? 'dark' : 'light'}`}
      onClick={handleMapClick}
    >
      <div className="globe-wrapper" ref={globeWrapperRef}>
        <Globe
          ref={globeRef}
          width={globeSize?.width}
          height={globeSize?.height}
          backgroundColor={darkMode ? '#04030b' : '#eef2ff'}
          backgroundImageUrl={darkMode ? STARS : null}
          globeImageUrl={darkMode ? DARK_GLOBE : LIGHT_GLOBE}
          bumpImageUrl={BUMP_MAP}
          showAtmosphere
          atmosphereColor={darkMode ? '#7c8cff' : '#8bbdfc'}
          atmosphereAltitude={0.22}
          htmlElementsData={htmlMarkers}
          htmlElement={renderMarker}
          arcsData={globeConnections}
          arcColor={(arc: object) => (arc as GlobeConnectionDatum).color}
          arcStroke={1.2}
          arcAltitude={(arc: object) => (arc as GlobeConnectionDatum).altitude}
          arcDashLength={0.4}
          arcDashGap={0.2}
          arcDashAnimateTime={2000}
          arcsTransitionDuration={0}
          arcLabel={(arc: object) => {
            const datum = arc as GlobeConnectionDatum;
            return `${datum.label} · ${datum.latency.toFixed(1)} ms`;
          }}
          onArcHover={(arc: object | null) => {
            if (arc) {
              setHoveredArc(arc as GlobeConnectionDatum);
              // Initialize tooltip position with current mouse position
              setTooltipPosition(mousePositionRef.current);
            } else {
              setHoveredArc(null);
              setTooltipPosition(null);
            }
          }}
          polygonsData={countryPolygons}
          polygonCapColor={() => (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)')}
          polygonSideColor={() => 'rgba(0,0,0,0)'}
          polygonStrokeColor={() => (darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.25)')}
          polygonsTransitionDuration={0}
          labelsData={capitalLabels}
          labelLat={(label) => (label as CapitalLabel).lat}
          labelLng={(label) => (label as CapitalLabel).lng}
          labelText={(label) => (label as CapitalLabel).name}
          labelColor={() => (darkMode ? '#f5f5ff' : '#0b1740')}
          labelSize={0.45}
          labelDotRadius={0.18}
          labelResolution={2}
        />

        {hoveredArc && tooltipPosition && (
          <div
            className={`arc-tooltip ${darkMode ? 'dark' : 'light'}`}
            style={{
              position: 'fixed',
              left: `${tooltipPosition.x + 10}px`,
              top: `${tooltipPosition.y - 10}px`,
              pointerEvents: 'none',
              zIndex: 1000,
            }}
          >
            <div className="arc-tooltip__header">
              <strong>{hoveredArc.label}</strong>
            </div>
            <div className="arc-tooltip__body">
              <div className="arc-tooltip__row">
                <span>Latency</span>
                <strong>{hoveredArc.latency.toFixed(1)} ms</strong>
              </div>
              <div className="arc-tooltip__row">
                <span>Quality</span>
                <strong>
                  {hoveredArc.latency < 20
                    ? 'Excellent'
                    : hoveredArc.latency < 60
                    ? 'Good'
                    : hoveredArc.latency < 120
                    ? 'Fair'
                    : 'Poor'}
                </strong>
              </div>
            </div>
          </div>
        )}

        {selectedNode && (
          <div 
            className={`node-info-card ${darkMode ? 'dark' : 'light'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="node-info-card__header">
              <div>
                <h3>{selectedNode.name}</h3>
                {selectedNode.location && <p>{selectedNode.location}</p>}
              </div>
              <div className="node-info-card__header-right">
                <span className={`status-pill status-${selectedNode.status}`}>
                  {selectedNode.status}
                </span>
                <button
                  className="node-info-card__close"
                  onClick={onNodeDeselect}
                  aria-label="Close node details"
                  title="Close"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="node-info-card__body">
              {selectedNode.provider && (
                <div className="info-row">
                  <span>Provider</span>
                  <strong>{selectedNode.provider}</strong>
                </div>
              )}
              {selectedNode.external_ip && (
                <div className="info-row">
                  <span>External IP</span>
                  <code>{selectedNode.external_ip}</code>
                </div>
              )}
              {selectedNode.internal_ip && (
                <div className="info-row">
                  <span>Internal IP</span>
                  <code>{selectedNode.internal_ip}</code>
                </div>
              )}
              <div className="metrics-grid">
                <div>
                  <span>CPU</span>
                  <strong>
                    {selectedNode.cpu_percent != null ? `${selectedNode.cpu_percent.toFixed(1)}%` : '—'}
                  </strong>
                </div>
                <div>
                  <span>Memory</span>
                  <strong>
                    {selectedNode.memory_percent != null ? `${selectedNode.memory_percent.toFixed(1)}%` : '—'}
                  </strong>
                </div>
                <div>
                  <span>Disk</span>
                  <strong>
                    {selectedNode.disk_percent != null ? `${selectedNode.disk_percent.toFixed(1)}%` : '—'}
                  </strong>
                </div>
              </div>

              {(selectedNode.network_tx_bytes_per_sec != null ||
                selectedNode.network_rx_bytes_per_sec != null) && (
                <div className="info-row">
                  <span>Network</span>
                  <strong>
                    ⬆ {formatBytesPerSecond(selectedNode.network_tx_bytes_per_sec)} · ⬇{' '}
                    {formatBytesPerSecond(selectedNode.network_rx_bytes_per_sec)}
                  </strong>
                </div>
              )}

              <div className="info-row">
                <span>Last seen</span>
                <strong>{selectedNode.last_seen}</strong>
              </div>

              {selectedNode.kubelet_version && (
                <div className="info-row">
                  <span>Kubelet</span>
                  <code>{selectedNode.kubelet_version}</code>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClusterMap;
