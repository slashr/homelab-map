import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import Globe, { GlobeMethods } from 'react-globe.gl';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import type { FeatureCollection, Geometry } from 'geojson';
import { capitalLabels, CapitalLabel } from '../data/capitals';
import { Node, Connection } from '../types';
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

  // Track mouse position for tooltip (throttled to reduce updates)
  useEffect(() => {
    let rafId: number | null = null;
    const handleMouseMove = (event: MouseEvent) => {
      mousePositionRef.current = { x: event.clientX, y: event.clientY };
      // Only update tooltip position if hovering and use RAF for throttling
      if (hoveredArc) {
        if (rafId === null) {
          rafId = requestAnimationFrame(() => {
            setTooltipPosition(mousePositionRef.current);
            rafId = null;
          });
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [hoveredArc]);

  const nodesWithLocation = useMemo(() => {
    // First, filter nodes with valid locations
    const validNodes = nodes
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
      }));
    
    // Group nodes by approximate location (within 0.01 degrees ~ 1km)
    const locationGroups = new Map<string, typeof validNodes>();
    validNodes.forEach((node) => {
      // Round to 2 decimal places to group nearby nodes
      const key = `${Math.round(node.lat * 100) / 100},${Math.round(node.lng * 100) / 100}`;
      if (!locationGroups.has(key)) {
        locationGroups.set(key, []);
      }
      locationGroups.get(key)!.push(node);
    });
    
    // Apply visual offset to nodes sharing the same location
    const result: typeof validNodes = [];
    locationGroups.forEach((groupNodes) => {
      if (groupNodes.length === 1) {
        // Single node, no offset needed
        result.push(groupNodes[0]);
      } else {
        // Multiple nodes at same location - spread them in a circle
        const radius = 0.5; // degrees offset (visible at globe scale)
        groupNodes.forEach((node, index) => {
          const angle = (2 * Math.PI * index) / groupNodes.length;
          result.push({
            ...node,
            lat: node.lat + radius * Math.sin(angle),
            lng: node.lng + radius * Math.cos(angle),
          });
        });
      }
    });
    
    return result;
  }, [nodes]);

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
    // Allow zoom in to city level (reduced from 180 to 50)
    controls.minDistance = 50;
    controls.maxDistance = 750;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    // Allow full rotation in all directions - no restrictions
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
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

    globeRef.current.pointOfView({ lat: focusLat, lng: focusLng, altitude: 0.5 }, 900);
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

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleSelect(event);
        }
      };

      container.addEventListener('click', handleSelect);
      container.addEventListener('keydown', handleKeyDown);

      // Store cleanup function on container for Globe component to call
      (container as any).__cleanup = () => {
        container.removeEventListener('click', handleSelect);
        container.removeEventListener('keydown', handleKeyDown);
      };

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

  // Memoize Globe callbacks to prevent unnecessary re-renders
  const arcColorCallback = useCallback((arc: object) => (arc as GlobeConnectionDatum).color, []);
  const arcAltitudeCallback = useCallback((arc: object) => (arc as GlobeConnectionDatum).altitude, []);
  const arcLabelCallback = useCallback((arc: object) => {
    const datum = arc as GlobeConnectionDatum;
    return `${datum.label} · ${datum.latency.toFixed(1)} ms`;
  }, []);
  const onArcHoverCallback = useCallback((arc: object | null) => {
    if (arc) {
      setHoveredArc(arc as GlobeConnectionDatum);
      setTooltipPosition(mousePositionRef.current);
    } else {
      setHoveredArc(null);
      setTooltipPosition(null);
    }
  }, []);
  const polygonCapColorCallback = useCallback(() => (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'), [darkMode]);
  const polygonSideColorCallback = useCallback(() => 'rgba(0,0,0,0)', []);
  const polygonStrokeColorCallback = useCallback(() => (darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.25)'), [darkMode]);
  const labelLatCallback = useCallback((label: object) => (label as CapitalLabel).lat, []);
  const labelLngCallback = useCallback((label: object) => (label as CapitalLabel).lng, []);
  const labelTextCallback = useCallback((label: object) => (label as CapitalLabel).name, []);
  const labelColorCallback = useCallback(() => (darkMode ? '#f5f5ff' : '#0b1740'), [darkMode]);

  if (nodesWithLocation.length === 0) {
    return (
      <div className="cluster-map empty">
        <p>No nodes with location data available</p>
      </div>
    );
  }

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
          arcColor={arcColorCallback}
          arcStroke={0.8}
          arcAltitude={arcAltitudeCallback}
          arcDashLength={0.4}
          arcDashGap={0.2}
          arcDashAnimateTime={3000}
          arcsTransitionDuration={0}
          arcLabel={arcLabelCallback}
          onArcHover={onArcHoverCallback}
          polygonsData={countryPolygons}
          polygonCapColor={polygonCapColorCallback}
          polygonSideColor={polygonSideColorCallback}
          polygonStrokeColor={polygonStrokeColorCallback}
          polygonsTransitionDuration={0}
          labelsData={capitalLabels}
          labelLat={labelLatCallback}
          labelLng={labelLngCallback}
          labelText={labelTextCallback}
          labelColor={labelColorCallback}
          labelSize={0.45}
          labelDotRadius={0.18}
          labelResolution={1}
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

      </div>
    </div>
  );
};

export default ClusterMap;
