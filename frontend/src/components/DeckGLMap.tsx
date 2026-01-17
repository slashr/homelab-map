import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Map as ReactMapGL } from 'react-map-gl/maplibre';
import DeckGL from '@deck.gl/react';
import { ArcLayer, IconLayer } from '@deck.gl/layers';
import { FlyToInterpolator } from '@deck.gl/core';
import type { PickingInfo } from '@deck.gl/core';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Node, Connection } from '../types';
import { getLatencyColor, getLatencyQuality, getAvatarUrl } from '../utils/mapUtils';
import './DeckGLMap.css';

interface DeckGLMapProps {
  nodes: Node[];
  connections: Connection[];
  darkMode: boolean;
  connectionsTotal?: number;
  selectedNodeId: string | null;
  selectionToken: number;
  onNodeSelect?: (nodeName: string) => void;
  onNodeDeselect?: () => void;
}

interface ArcDatum {
  source: [number, number];
  target: [number, number];
  sourceColor: [number, number, number, number];
  targetColor: [number, number, number, number];
  latency: number;
  label: string;
}

interface NodeDatum {
  name: string;
  coordinates: [number, number];
  status: string;
  isSelected: boolean;
}

interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  transitionDuration?: number;
  transitionInterpolator?: FlyToInterpolator;
}

// Free map tile providers
const MAP_STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

const MAX_RENDERED_CONNECTIONS = 200;

// Border colors for node icons - black with white outline for visibility in both modes
const BORDER_FILL_COLOR = '#000000';
const BORDER_OUTLINE_COLOR = '#FFFFFF';
const BORDER_OUTLINE_WIDTH = 6;

// Create a data URL for a black square with white outline (visible in both light and dark modes)
const createSquareBorderIcon = (): string => {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Draw white outline first (larger square)
    ctx.fillStyle = BORDER_OUTLINE_COLOR;
    ctx.fillRect(0, 0, size, size);
    // Draw black fill on top (smaller square, leaving white border)
    ctx.fillStyle = BORDER_FILL_COLOR;
    ctx.fillRect(BORDER_OUTLINE_WIDTH, BORDER_OUTLINE_WIDTH, size - BORDER_OUTLINE_WIDTH * 2, size - BORDER_OUTLINE_WIDTH * 2);
  }
  return canvas.toDataURL('image/png');
};

// Cache the border icon URL
let borderIconUrl: string | null = null;
const getBorderIconUrl = (): string => {
  if (!borderIconUrl) {
    borderIconUrl = createSquareBorderIcon();
  }
  return borderIconUrl;
};

// Initial view state centered on US with global view
const INITIAL_VIEW_STATE: ViewState = {
  longitude: -40,
  latitude: 30,
  zoom: 1.8,
  pitch: 0,
  bearing: 0,
};


const DeckGLMap: React.FC<DeckGLMapProps> = ({
  nodes,
  connections,
  darkMode,
  connectionsTotal,
  selectedNodeId,
  selectionToken,
  onNodeSelect,
  onNodeDeselect,
}) => {
  const [viewState, setViewState] = useState<ViewState>(INITIAL_VIEW_STATE);
  const [hoveredArc, setHoveredArc] = useState<ArcDatum | null>(null);
  const [hoveredNode, setHoveredNode] = useState<NodeDatum | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);

  // Filter nodes with valid locations
  const nodesWithLocation = useMemo(() => {
    const validNodes = nodes.filter(
      (node) =>
        node.lat != null &&
        node.lon != null &&
        !Number.isNaN(node.lat) &&
        !Number.isNaN(node.lon)
    );

    // Group nodes by approximate location
    const locationGroups = new Map<string, Node[]>();
    validNodes.forEach((node) => {
      const key = `${Math.round(node.lat! * 100) / 100},${Math.round(node.lon! * 100) / 100}`;
      if (!locationGroups.has(key)) {
        locationGroups.set(key, []);
      }
      locationGroups.get(key)!.push(node);
    });

    // Apply visual offset to nodes sharing the same location
    const result: Array<Node & { adjustedLat: number; adjustedLon: number }> = [];
    locationGroups.forEach((groupNodes: Node[]) => {
      if (groupNodes.length === 1) {
        result.push({
          ...groupNodes[0],
          adjustedLat: groupNodes[0].lat!,
          adjustedLon: groupNodes[0].lon!,
        });
      } else {
        const radius = 0.5;
        groupNodes.forEach((node: Node, index: number) => {
          const angle = (2 * Math.PI * index) / groupNodes.length;
          result.push({
            ...node,
            adjustedLat: node.lat! + radius * Math.sin(angle),
            adjustedLon: node.lon! + radius * Math.cos(angle),
          });
        });
      }
    });

    return result;
  }, [nodes]);

  // Create node lookup for connections
  const nodeLookup = useMemo(() => {
    const map = new Map<string, { lat: number; lon: number }>();
    nodesWithLocation.forEach((node) => {
      map.set(node.name, { lat: node.adjustedLat, lon: node.adjustedLon });
    });
    return map;
  }, [nodesWithLocation]);

  // Build arc data for connections
  const arcData = useMemo((): ArcDatum[] => {
    const mapped = connections
      .map((conn): ArcDatum | null => {
        const source = nodeLookup.get(conn.source_node);
        const target = nodeLookup.get(conn.target_node);
        if (!source || !target) return null;

        const color = getLatencyColor(conn.latency_ms, darkMode);
        return {
          source: [source.lon, source.lat],
          target: [target.lon, target.lat],
          sourceColor: color,
          targetColor: color,
          latency: conn.latency_ms,
          label: `${conn.source_node} → ${conn.target_node}`,
        };
      })
      .filter((d): d is ArcDatum => d !== null);

    if (mapped.length <= MAX_RENDERED_CONNECTIONS) {
      return mapped;
    }
    return mapped.sort((a, b) => a.latency - b.latency).slice(0, MAX_RENDERED_CONNECTIONS);
  }, [connections, nodeLookup, darkMode]);

  // Build node data for IconLayer
  const nodeData = useMemo((): NodeDatum[] => {
    return nodesWithLocation.map((node) => ({
      name: node.name,
      coordinates: [node.adjustedLon, node.adjustedLat] as [number, number],
      status: node.status,
      isSelected: node.name === selectedNodeId,
    }));
  }, [nodesWithLocation, selectedNodeId]);

  const totalConnections = connectionsTotal ?? connections.length;

  // Layers
  const layers = useMemo(() => [
    // Connections arc layer
    new ArcLayer<ArcDatum>({
      id: 'connections-arc',
      data: arcData,
      getSourcePosition: (d: ArcDatum) => d.source,
      getTargetPosition: (d: ArcDatum) => d.target,
      getSourceColor: (d: ArcDatum) => d.sourceColor,
      getTargetColor: (d: ArcDatum) => d.targetColor,
      getWidth: 2,
      getHeight: 0.3,
      greatCircle: true,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 100],
      onHover: (info: PickingInfo<ArcDatum>) => {
        if (info.object) {
          setHoveredArc(info.object);
          setHoveredNode(null);
          setTooltipPosition({ x: info.x ?? 0, y: info.y ?? 0 });
        } else {
          setHoveredArc(null);
          setTooltipPosition(null);
        }
      },
    }),
    // Node border layer (black square with white outline, visible in both light and dark modes)
    new IconLayer<NodeDatum>({
      id: 'nodes-border',
      data: nodeData,
      getPosition: (d: NodeDatum) => d.coordinates,
      getIcon: () => ({
        url: getBorderIconUrl(),
        width: 128,
        height: 128,
        anchorY: 64,
      }),
      getSize: (d: NodeDatum) => (d.isSelected ? 56 : 48),
      pickable: false,
      sizeScale: 1,
      sizeUnits: 'pixels',
      sizeMinPixels: 36,
      sizeMaxPixels: 68,
    }),
    // Nodes icon layer
    new IconLayer<NodeDatum>({
      id: 'nodes-icon',
      data: nodeData,
      getPosition: (d: NodeDatum) => d.coordinates,
      getIcon: (d: NodeDatum) => ({
        url: getAvatarUrl(d.name),
        width: 128,
        height: 128,
        anchorY: 64,
      }),
      getSize: (d: NodeDatum) => (d.isSelected ? 48 : 40),
      pickable: true,
      onClick: (info: PickingInfo<NodeDatum>) => {
        if (info.object) {
          onNodeSelect?.(info.object.name);
        }
      },
      onHover: (info: PickingInfo<NodeDatum>) => {
        if (info.object) {
          setHoveredNode(info.object);
          setHoveredArc(null);
          setTooltipPosition({ x: info.x ?? 0, y: info.y ?? 0 });
        } else {
          setHoveredNode(null);
          if (!hoveredArc) {
            setTooltipPosition(null);
          }
        }
      },
      sizeScale: 1,
      sizeUnits: 'pixels',
      sizeMinPixels: 28,
      sizeMaxPixels: 60,
    }),
  ], [arcData, nodeData, onNodeSelect, hoveredArc]);

  // Fly to selected node
  useEffect(() => {
    if (!selectedNodeId) return;

    const selectedNode = nodesWithLocation.find((n) => n.name === selectedNodeId);
    if (!selectedNode) return;

    setViewState((prev: ViewState) => ({
      ...prev,
      longitude: selectedNode.adjustedLon,
      latitude: selectedNode.adjustedLat,
      zoom: 5,
      transitionDuration: 800,
      transitionInterpolator: new FlyToInterpolator(),
    }));
  }, [selectedNodeId, selectionToken, nodesWithLocation]);

  // Handle map click for deselection
  const handleClick = useCallback(
    (info: PickingInfo) => {
      if (!info.object) {
        onNodeDeselect?.();
      }
    },
    [onNodeDeselect]
  );

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedNodeId) {
        onNodeDeselect?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, onNodeDeselect]);

  // Handle view state change
  const onViewStateChange = useCallback((e: { viewState: ViewState }) => {
    setViewState(e.viewState);
  }, []);

  if (nodesWithLocation.length === 0) {
    return (
      <div className="deck-gl-map empty">
        <p>No nodes with location data available</p>
      </div>
    );
  }

  return (
    <div className={`deck-gl-map ${darkMode ? 'dark' : 'light'}`}>
      <DeckGL
        viewState={viewState}
        onViewStateChange={onViewStateChange as any}
        controller={true}
        layers={layers}
        onClick={handleClick}
        getCursor={({ isDragging, isHovering }: { isDragging: boolean; isHovering: boolean }) =>
          isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'
        }
      >
        <ReactMapGL
          mapStyle={darkMode ? MAP_STYLES.dark : MAP_STYLES.light}
          attributionControl={false}
        />
      </DeckGL>

      {/* Connection count indicator */}
      {totalConnections > MAX_RENDERED_CONNECTIONS && (
        <div className={`connection-cap-indicator ${darkMode ? 'dark' : 'light'}`}>
          Showing {MAX_RENDERED_CONNECTIONS} / {totalConnections} connections
        </div>
      )}

      {/* Arc tooltip */}
      {hoveredArc && tooltipPosition && (
        <div
          className={`arc-tooltip ${darkMode ? 'dark' : 'light'}`}
          style={{
            position: 'absolute',
            left: tooltipPosition.x + 12,
            top: tooltipPosition.y - 12,
            pointerEvents: 'none',
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
              <strong>{getLatencyQuality(hoveredArc.latency)}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Node tooltip */}
      {hoveredNode && tooltipPosition && (
        <div
          className={`arc-tooltip ${darkMode ? 'dark' : 'light'}`}
          style={{
            position: 'absolute',
            left: tooltipPosition.x + 12,
            top: tooltipPosition.y - 12,
            pointerEvents: 'none',
          }}
        >
          <div className="arc-tooltip__header">
            <strong>{hoveredNode.name}</strong>
          </div>
          <div className="arc-tooltip__body">
            <div className="arc-tooltip__row">
              <span>Status</span>
              <strong style={{ 
                color: hoveredNode.status === 'online' ? '#4caf50' : 
                       hoveredNode.status === 'warning' ? '#ff9800' : '#f44336' 
              }}>
                {hoveredNode.status.charAt(0).toUpperCase() + hoveredNode.status.slice(1)}
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(DeckGLMap);
