import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import type { FeatureCollection, Geometry } from 'geojson';
import { capitalLabels, CapitalLabel } from '../data/capitals';
import { Node, Connection } from '../types';
import { formatBytesPerSecond } from '../utils/format';
import './FlatMap.css';
import './ClusterMap.css';

interface FlatMapProps {
  nodes: Node[];
  connections: Connection[];
  darkMode: boolean;
  selectedNodeId: string | null;
  selectionToken: number;
  onNodeSelect?: (nodeName: string) => void;
  onNodeDeselect?: () => void;
}

interface FlatMapNodeDatum extends Node {
  lat: number;
  lng: number;
  isSelected: boolean;
  theme: 'dark' | 'light';
}

interface FlatMapConnectionDatum {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: [string, string];
  latency: number;
  label: string;
}

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

const FlatMap: React.FC<FlatMapProps> = ({
  nodes,
  connections,
  darkMode,
  selectedNodeId,
  selectionToken,
  onNodeSelect,
  onNodeDeselect,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = React.useState<{ width: number; height: number } | null>(null);
  const [hoveredArc, setHoveredArc] = React.useState<FlatMapConnectionDatum | null>(null);
  const [tooltipPosition, setTooltipPosition] = React.useState<{ x: number; y: number } | null>(null);
  const mousePositionRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const animationFrameRef = useRef<number>();
  const dashOffsetRef = useRef<number>(0);

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

  const nodeLookup = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    nodesWithLocation.forEach((node) => {
      map.set(node.name, { lat: node.lat, lng: node.lng });
    });
    return map;
  }, [nodesWithLocation]);

  const flatMapConnections = useMemo(() => {
    return connections
      .map((conn) => {
        const source = nodeLookup.get(conn.source_node);
        const target = nodeLookup.get(conn.target_node);
        if (!source || !target) {
          return null;
        }
        const colors = getLatencyColor(conn.latency_ms, darkMode);
        return {
          startLat: source.lat,
          startLng: source.lng,
          endLat: target.lat,
          endLng: target.lng,
          color: colors,
          latency: conn.latency_ms,
          label: `${conn.source_node} → ${conn.target_node}`,
        } as FlatMapConnectionDatum;
      })
      .filter((value): value is FlatMapConnectionDatum => Boolean(value));
  }, [connections, nodeLookup, darkMode]);

  const countryPolygons = useMemo(() => {
    const geoJson = feature(
      countriesTopo as any,
      (countriesTopo as any).objects.countries
    ) as unknown as FeatureCollection<Geometry>;
    return geoJson.features;
  }, []);

  // Handle map resize
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const updateMapSize = () => {
      if (!containerRef.current) {
        return;
      }
      const container = containerRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      
      if (width > 0 && height > 0) {
        setMapSize({ width, height });
      }
    };

    updateMapSize();
    window.addEventListener('resize', updateMapSize);
    
    const resizeObserver = new ResizeObserver(() => {
      updateMapSize();
    });
    
    resizeObserver.observe(containerRef.current);

    return () => {
      window.removeEventListener('resize', updateMapSize);
      resizeObserver.disconnect();
    };
  }, []);

  // Setup projection and path
  const projection = useMemo(() => {
    if (!mapSize) return null;
    return geoMercator()
      .scale(mapSize.width / (2 * Math.PI))
      .translate([mapSize.width / 2, mapSize.height / 2]);
  }, [mapSize]);

  const path = useMemo(() => {
    if (!projection) return null;
    return geoPath().projection(projection);
  }, [projection]);

  // Animate connection lines - smooth and slow
  useEffect(() => {
    if (!svgRef.current || !projection) return;

    const animate = () => {
      // Slower animation: move 0.3 pixels per frame (was 0.5)
      // This creates a smoother, slower flow
      dashOffsetRef.current = (dashOffsetRef.current - 0.3) % 20;
      const arcs = select(svgRef.current).selectAll<SVGPathElement, FlatMapConnectionDatum>('.connection-line');
      arcs.attr('stroke-dashoffset', dashOffsetRef.current);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [projection, flatMapConnections]);

  // Render map
  useEffect(() => {
    if (!svgRef.current || !path || !projection || !mapSize) return;

    const svg = select(svgRef.current);
    svg.selectAll('*').remove();

    // Draw countries
    svg
      .append('g')
      .attr('class', 'countries')
      .selectAll('path')
      .data(countryPolygons)
      .enter()
      .append('path')
      .attr('d', path as any)
      .attr('fill', darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)')
      .attr('stroke', darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.25)')
      .attr('stroke-width', 0.5);

    // Draw connections
    const connectionGroup = svg.append('g').attr('class', 'connections');
    
    flatMapConnections.forEach((conn) => {
      const start = projection([conn.startLng, conn.startLat]);
      const end = projection([conn.endLng, conn.endLat]);
      
      if (!start || !end) return;

      const line = connectionGroup
        .append('path')
        .attr('class', 'connection-line')
        .attr('d', `M ${start[0]},${start[1]} L ${end[0]},${end[1]}`)
        .attr('stroke', conn.color[0])
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '10 5')
        .attr('stroke-dashoffset', 0)
        .attr('fill', 'none')
        .attr('opacity', 0.7)
        .style('cursor', 'pointer')
        .on('mouseenter', function() {
          select(this).attr('opacity', 1).attr('stroke-width', 3);
          setHoveredArc(conn);
          setTooltipPosition(mousePositionRef.current);
        })
        .on('mouseleave', function() {
          select(this).attr('opacity', 0.7).attr('stroke-width', 2);
          setHoveredArc(null);
          setTooltipPosition(null);
        });
    });

    // Draw capital labels
    const labelsGroup = svg.append('g').attr('class', 'labels');
    capitalLabels.forEach((label) => {
      const coords = projection([label.lng, label.lat]);
      if (!coords) return;

      labelsGroup
        .append('circle')
        .attr('cx', coords[0])
        .attr('cy', coords[1])
        .attr('r', 2)
        .attr('fill', darkMode ? '#f5f5ff' : '#0b1740')
        .attr('opacity', 0.6);

      labelsGroup
        .append('text')
        .attr('x', coords[0] + 4)
        .attr('y', coords[1] + 3)
        .attr('font-size', '10px')
        .attr('fill', darkMode ? '#f5f5ff' : '#0b1740')
        .attr('opacity', 0.7)
        .text(label.name);
    });

    // Draw nodes
    const nodesGroup = svg.append('g').attr('class', 'nodes');
    nodesWithLocation.forEach((node) => {
      const coords = projection([node.lng, node.lat]);
      if (!coords) return;

      const isSelected = node.name === selectedNodeId;
      const nodeGroup = nodesGroup
        .append('g')
        .attr('class', `node-group ${isSelected ? 'selected' : ''}`)
        .attr('transform', `translate(${coords[0]},${coords[1]})`)
        .style('cursor', 'pointer')
        .on('click', (e) => {
          e.stopPropagation();
          onNodeSelect?.(node.name);
        });

      // Node circle
      nodeGroup
        .append('circle')
        .attr('r', isSelected ? 28 : 26)
        .attr('fill', darkMode ? '#10101a' : '#ffffff')
        .attr('stroke', 
          node.status === 'online' ? '#4caf50' :
          node.status === 'warning' ? '#ff9800' : '#9e9e9e'
        )
        .attr('stroke-width', isSelected ? 4 : 3)
        .attr('filter', 'url(#node-shadow)');

      // Node image
      const image = nodeGroup
        .append('image')
        .attr('x', -24)
        .attr('y', -24)
        .attr('width', 48)
        .attr('height', 48)
        .attr('clip-path', 'url(#node-clip)')
        .attr('href', getCharacterImage(node.name))
        .on('error', function() {
          select(this).attr('href', getFallbackAvatar(node.name));
        });
    });

    // Add defs for shadows and clipping
    const defs = svg.append('defs');
    
    // Shadow filter
    defs
      .append('filter')
      .attr('id', 'node-shadow')
      .append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 2)
      .attr('stdDeviation', 3)
      .attr('flood-opacity', 0.3);

    // Clip path for circular images
    defs
      .append('clipPath')
      .attr('id', 'node-clip')
      .append('circle')
      .attr('r', 24);
  }, [path, projection, mapSize, countryPolygons, flatMapConnections, nodesWithLocation, selectedNodeId, darkMode, onNodeSelect]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.name === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  const handleMapClick = useCallback((event: React.MouseEvent) => {
    const target = event.target as Element;
    // Don't deselect if clicking on a node, connection line, or the info card
    if (
      target.closest('.node-group') ||
      target.closest('.connection-line') ||
      target.closest('.node-info-card') ||
      target.closest('.labels')
    ) {
      return;
    }
    // Deselect when clicking on the container background or map countries
    if (target === event.currentTarget || target.closest('.countries')) {
      onNodeDeselect?.();
    }
  }, [onNodeDeselect]);

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

  if (nodesWithLocation.length === 0) {
    return (
      <div className="flat-map empty">
        <p>No nodes with location data available</p>
      </div>
    );
  }

  return (
    <div 
      className={`flat-map ${darkMode ? 'dark' : 'light'}`}
      onClick={handleMapClick}
    >
      <div className="flat-map-wrapper" ref={containerRef}>
        {mapSize && (
          <svg
            ref={svgRef}
            width={mapSize.width}
            height={mapSize.height}
            className="flat-map-svg"
          />
        )}

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

export default FlatMap;

