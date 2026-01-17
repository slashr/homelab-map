import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Map as ReactMapGL } from 'react-map-gl/maplibre';
import DeckGL from '@deck.gl/react';
import { ArcLayer, IconLayer } from '@deck.gl/layers';
import { FlyToInterpolator } from '@deck.gl/core';
import type { PickingInfo } from '@deck.gl/core';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Node, Connection } from '../types';
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

// Initial view state centered on US with global view
const INITIAL_VIEW_STATE: ViewState = {
  longitude: -40,
  latitude: 30,
  zoom: 1.8,
  pitch: 0,
  bearing: 0,
};

const getLatencyColor = (latency: number, darkMode: boolean): [number, number, number, number] => {
  if (latency < 20) {
    return darkMode ? [0, 245, 212, 220] : [3, 201, 136, 220];
  }
  if (latency < 60) {
    return darkMode ? [249, 255, 108, 220] : [244, 162, 89, 220];
  }
  if (latency < 120) {
    return darkMode ? [255, 140, 66, 220] : [255, 130, 67, 220];
  }
  return darkMode ? [255, 63, 129, 220] : [255, 77, 109, 220];
};

const getLatencyQuality = (latency: number): string => {
  if (latency < 20) return 'Excellent';
  if (latency < 60) return 'Good';
  if (latency < 120) return 'Fair';
  return 'Poor';
};

// Generate avatar URL for nodes
const getAvatarUrl = (nodeName: string): string => {
  const character = nodeName.split('-')[0].toLowerCase();
  const nameMap: Record<string, string> = {
    michael: 'Michael+Scott',
    jim: 'Jim+Halpert',
    dwight: 'Dwight+Schrute',
    angela: 'Angela+Martin',
    stanley: 'Stanley+Hudson',
    phyllis: 'Phyllis+Vance',
    toby: 'Toby+Flenderson',
  };
  const colorMap: Record<string, string> = {
    michael: '667eea',
    jim: '4285F4',
    dwight: 'FFC107',
    angela: '9c27b0',
    stanley: 'ff9800',
    phyllis: '4caf50',
    toby: '795548',
  };

  const name = nameMap[character] || character;
  const color = colorMap[character] || '607D8B';
  return `https://ui-avatars.com/api/?name=${name}&size=128&background=${color}&color=fff&bold=true&rounded=true`;
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
      getSize: (d: NodeDatum) => (d.isSelected ? 56 : 44),
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
      sizeMinPixels: 32,
      sizeMaxPixels: 64,
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
