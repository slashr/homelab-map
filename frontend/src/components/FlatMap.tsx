import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity, ZoomTransform } from 'd3-zoom';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import type { FeatureCollection, Geometry } from 'geojson';
import { capitalLabels } from '../data/capitals';
import { Node, Connection } from '../types';
import './FlatMap.css';

interface FlatMapProps {
  nodes: Node[];
  connections: Connection[];
  darkMode: boolean;
  selectedNodeId: string | null;
  selectionToken: number;
  onNodeSelect?: (nodeName: string) => void;
  onNodeDeselect?: () => void;
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
  return `/characters/${character}.png`;
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
  const [zoomTransform, setZoomTransform] = React.useState<ZoomTransform | null>(null);
  const mousePositionRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const animationFrameRef = useRef<number>();
  const dashOffsetRef = useRef<number>(0);
  const zoomTransformRef = useRef<ZoomTransform | null>(null);
  const baseScaleRef = useRef<number>(1);

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
        const radius = 0.5; // degrees offset (visible at map scale)
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

  // Handle map resize with debouncing to prevent excessive re-renders
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let resizeTimeout: NodeJS.Timeout;
    const updateMapSize = () => {
      if (!containerRef.current) {
        return;
      }
      const container = containerRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      
      if (width > 0 && height > 0) {
        setMapSize(prevSize => {
          // Only update if size actually changed
          if (!prevSize || prevSize.width !== width || prevSize.height !== height) {
            return { width, height };
          }
          return prevSize;
        });
      }
    };

    const debouncedUpdateMapSize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateMapSize, 150);
    };

    // Initial size
    updateMapSize();

    // Resize on window resize (debounced)
    window.addEventListener('resize', debouncedUpdateMapSize, { passive: true });
    
    // Use ResizeObserver for more accurate container size tracking (debounced)
    const resizeObserver = new ResizeObserver(debouncedUpdateMapSize);
    
    resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', debouncedUpdateMapSize);
      resizeObserver.disconnect();
    };
  }, []);

  // Setup projection and path (base scale, zoom handled by SVG transform)
  const projection = useMemo(() => {
    if (!mapSize) return null;
    const baseScale = mapSize.width / (2 * Math.PI);
    baseScaleRef.current = baseScale;
    
    return geoMercator()
      .scale(baseScale)
      .translate([mapSize.width / 2, mapSize.height / 2]);
  }, [mapSize]);

  const path = useMemo(() => {
    if (!projection) return null;
    return geoPath().projection(projection);
  }, [projection]);

  // Animate connection lines - smooth bidirectional gradient flow
  // Optimized: Cache gradient selections and check dynamically to handle gradients created after mount
  useEffect(() => {
    if (!svgRef.current || !projection || flatMapConnections.length === 0) return;

    const svg = select(svgRef.current);
    
    const animate = () => {
      // Re-query gradient stops each frame to handle case where they're created after animation starts
      // This is still efficient as D3 selections are lightweight
      const forwardStops = [
        svg.selectAll('.gradient-stop-forward-0'),
        svg.selectAll('.gradient-stop-forward-1'),
        svg.selectAll('.gradient-stop-forward-2'),
        svg.selectAll('.gradient-stop-forward-3'),
        svg.selectAll('.gradient-stop-forward-4'),
      ];
      const reverseStops = [
        svg.selectAll('.gradient-stop-reverse-0'),
        svg.selectAll('.gradient-stop-reverse-1'),
        svg.selectAll('.gradient-stop-reverse-2'),
        svg.selectAll('.gradient-stop-reverse-3'),
        svg.selectAll('.gradient-stop-reverse-4'),
      ];

      // Only animate if stops exist (they may not exist yet on initial mount)
      const hasStops = forwardStops[0].size() > 0 || reverseStops[0].size() > 0;
      if (hasStops) {
        // Smooth bidirectional gradient animation
        // Animate gradient stop positions to create flowing effect
        const cycleLength = 200; // Animation cycle length
        dashOffsetRef.current = (dashOffsetRef.current - 0.15 + cycleLength) % cycleLength;
        const progress = dashOffsetRef.current / cycleLength;
        
        // Forward flow - animate gradient stops to move forward
        forwardStops[0].attr('offset', `${(progress * 100) % 100}%`);
        forwardStops[1].attr('offset', `${((progress * 100) + 25) % 100}%`);
        forwardStops[2].attr('offset', `${((progress * 100) + 50) % 100}%`);
        forwardStops[3].attr('offset', `${((progress * 100) + 75) % 100}%`);
        forwardStops[4].attr('offset', `${((progress * 100) + 100) % 100}%`);
        
        // Reverse flow - animate gradient stops to move backward (opposite direction)
        const reverseProgress = (1 - progress) % 1;
        reverseStops[0].attr('offset', `${(reverseProgress * 100) % 100}%`);
        reverseStops[1].attr('offset', `${((reverseProgress * 100) + 25) % 100}%`);
        reverseStops[2].attr('offset', `${((reverseProgress * 100) + 50) % 100}%`);
        reverseStops[3].attr('offset', `${((reverseProgress * 100) + 75) % 100}%`);
        reverseStops[4].attr('offset', `${((reverseProgress * 100) + 100) % 100}%`);
      }
      
      // Continue animation loop regardless of whether stops exist yet
      // This ensures animation starts once gradients are created
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [projection, flatMapConnections.length]);

  // Store zoom behavior ref for programmatic zooming
  const zoomBehaviorRef = useRef<ReturnType<typeof d3Zoom<SVGSVGElement, unknown>> | null>(null);

  // Setup zoom behavior
  useEffect(() => {
    if (!svgRef.current || !mapSize) return;

    const svg = select(svgRef.current);
    
    // Ensure map-content group exists
    let mapContent = svg.select<SVGGElement>('g.map-content');
    if (mapContent.empty()) {
      mapContent = svg.append('g').attr('class', 'map-content');
    }

    const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8]) // Only allow zoom in (1x to 8x), no zoom out beyond full map
      .filter((event: any) => {
        // Allow zoom on wheel, but prevent on node/connection clicks
        if (event.type === 'wheel') return true;
        if (event.type === 'mousedown' && (event.target as Element).closest('.node-group, .connection-line')) {
          return false;
        }
        return event.type === 'mousedown' && event.button === 0; // Allow pan with left mouse button
      })
      .on('zoom', (event: any) => {
        zoomTransformRef.current = event.transform;
        setZoomTransform(event.transform);
        mapContent.attr('transform', event.transform.toString());
        
        // Update node scales to maintain constant size (inverse of zoom scale)
        const inverseScale = 1 / event.transform.k;
        const nodesGroup = svg.select('g.nodes');
        nodesGroup.selectAll('g.node-group').attr('data-zoom-scale', inverseScale);
      });

    svg.call(zoomBehavior);
    zoomBehaviorRef.current = zoomBehavior;

    return () => {
      svg.on('.zoom', null);
    };
  }, [mapSize]);

  // Zoom to selected node
  useEffect(() => {
    if (!selectedNodeId || !projection || !svgRef.current || !mapSize || !zoomBehaviorRef.current) {
      return;
    }

    const selectedNodeData = nodesWithLocation.find((node) => node.name === selectedNodeId);
    if (!selectedNodeData) {
      return;
    }

    const coords = projection([selectedNodeData.lng, selectedNodeData.lat]);
    if (!coords) {
      return;
    }

    // Zoom to the node with a smooth transition
    const svg = select(svgRef.current);
    const zoomBehavior = zoomBehaviorRef.current;
    
    // Calculate zoom transform: center on node and zoom in
    const centerX = coords[0];
    const centerY = coords[1];
    const scale = 3; // Zoom level (3x)
    
    // Calculate translate to center the node
    const translateX = mapSize.width / 2 - centerX * scale;
    const translateY = mapSize.height / 2 - centerY * scale;
    
    // Create ZoomTransform using d3-zoom's zoomIdentity
    const transform = zoomIdentity.translate(translateX, translateY).scale(scale);
    
    // Apply zoom with transition by manually animating the transform
    const currentTransform = zoomTransformRef.current || zoomIdentity;
    const startTime = Date.now();
    const duration = 750;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Easing function (ease-in-out)
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      
      // Interpolate between start and target transform
      const x = currentTransform.x + (transform.x - currentTransform.x) * eased;
      const y = currentTransform.y + (transform.y - currentTransform.y) * eased;
      const k = currentTransform.k + (transform.k - currentTransform.k) * eased;
      
      const interpolatedTransform = zoomIdentity.translate(x, y).scale(k);
      
      // Update transform and trigger zoom event manually
      zoomTransformRef.current = interpolatedTransform;
      setZoomTransform(interpolatedTransform);
      const mapContent = svg.select<SVGGElement>('g.map-content');
      mapContent.attr('transform', interpolatedTransform.toString());
      
      // Update node scales to maintain constant size (inverse of zoom scale)
      const inverseScale = 1 / k;
      const nodesGroup = svg.select('g.nodes');
      nodesGroup.selectAll('g.node-group').each(function() {
        const nodeGroup = select(this);
        const isSelected = nodeGroup.classed('selected');
        const selectionScale = isSelected ? 1.12 : 1;
        const totalScale = inverseScale * selectionScale;
        const currentTransform = nodeGroup.attr('transform');
        // Extract translate values from current transform
        const match = currentTransform.match(/translate\(([^,]+),([^)]+)\)/);
        if (match) {
          const x = match[1];
          const y = match[2];
          nodeGroup.attr('transform', `translate(${x},${y}) scale(${totalScale})`);
        }
      });
      
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        // Animation complete - update zoom behavior's transform state so further zooming works
        const finalTransform = zoomIdentity.translate(transform.x, transform.y).scale(transform.k);
        zoomTransformRef.current = finalTransform;
        setZoomTransform(finalTransform);
        
        // Update the zoom behavior's internal state by calling transform on the selection
        // This ensures the zoom behavior knows about the current transform and allows further zooming
        const currentSelection = select(svgRef.current);
        // Use the zoom behavior's transform method to update its internal state
        (zoomBehavior as any).transform(currentSelection, finalTransform);
      }
    };
    
    requestAnimationFrame(animate);
      
  }, [selectedNodeId, selectionToken, projection, nodesWithLocation, mapSize]);

  // Track projection to detect when it changes (e.g., on resize)
  const projectionRef = useRef(projection);
  const pathRef = useRef(path);

  // Render map
  useEffect(() => {
    if (!svgRef.current || !path || !projection || !mapSize) return;

    const svg = select(svgRef.current);
    let mapContent = svg.select<SVGGElement>('g.map-content');
    if (mapContent.empty()) {
      mapContent = svg.append('g').attr('class', 'map-content');
    }
    
    // Check if projection changed (e.g., on resize) - need to re-render countries
    const projectionChanged = projectionRef.current !== projection || pathRef.current !== path;
    
    // Only clear dynamic content (connections, nodes, labels), or everything if projection changed
    if (projectionChanged) {
      mapContent.selectAll('*').remove();
    } else {
      mapContent.selectAll('g.connections, g.nodes, g.labels').remove();
    }

    // Draw countries - re-render if projection changed, otherwise just update colors
    let countriesGroup = mapContent.select<SVGGElement>('g.countries');
    if (projectionChanged || countriesGroup.empty()) {
      countriesGroup = mapContent
        .append('g')
        .attr('class', 'countries');
      
      countriesGroup
        .selectAll('path')
        .data(countryPolygons)
        .enter()
        .append('path')
        .attr('d', path as any)
        .attr('fill', darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)')
        .attr('stroke', darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.25)')
        .attr('stroke-width', 0.5);
      
      projectionRef.current = projection;
      pathRef.current = path;
    } else {
      // Update country colors if theme changed
      countriesGroup.selectAll('path')
        .attr('fill', darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)')
        .attr('stroke', darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.25)');
    }

    // Draw connections with smooth gradient-based bidirectional flow
    const connectionGroup = mapContent.append('g').attr('class', 'connections');
    
    // Ensure defs exist for gradients (check if already exists from node rendering)
    let defs = svg.select<SVGDefsElement>('defs');
    if (defs.empty()) {
      defs = svg.append('defs');
    }
    
    flatMapConnections.forEach((conn, index) => {
      const start = projection([conn.startLng, conn.startLat]);
      const end = projection([conn.endLng, conn.endLat]);
      
      if (!start || !end) return;

      // Create unique gradient IDs for each connection
      const forwardGradientId = `gradient-forward-${index}`;
      const reverseGradientId = `gradient-reverse-${index}`;

      // Forward flow gradient (source to target) - aligned along the line
      const forwardGradient = defs.append('linearGradient')
        .attr('id', forwardGradientId)
        .attr('x1', start[0])
        .attr('y1', start[1])
        .attr('x2', end[0])
        .attr('y2', end[1])
        .attr('gradientUnits', 'userSpaceOnUse');

      // Create smooth flowing gradient stops for forward direction
      forwardGradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', conn.color[0])
        .attr('stop-opacity', '0.2')
        .attr('class', 'gradient-stop-forward-0');
      forwardGradient.append('stop')
        .attr('offset', '25%')
        .attr('stop-color', conn.color[0])
        .attr('stop-opacity', '0.1')
        .attr('class', 'gradient-stop-forward-1');
      forwardGradient.append('stop')
        .attr('offset', '50%')
        .attr('stop-color', conn.color[0])
        .attr('stop-opacity', '0.6')
        .attr('class', 'gradient-stop-forward-2');
      forwardGradient.append('stop')
        .attr('offset', '75%')
        .attr('stop-color', conn.color[0])
        .attr('stop-opacity', '0.1')
        .attr('class', 'gradient-stop-forward-3');
      forwardGradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', conn.color[0])
        .attr('stop-opacity', '0.2')
        .attr('class', 'gradient-stop-forward-4');

      // Reverse flow gradient (target to source) - opposite direction
      const reverseGradient = defs.append('linearGradient')
        .attr('id', reverseGradientId)
        .attr('x1', end[0])
        .attr('y1', end[1])
        .attr('x2', start[0])
        .attr('y2', start[1])
        .attr('gradientUnits', 'userSpaceOnUse');

      // Create smooth flowing gradient stops for reverse direction
      reverseGradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', conn.color[1] || conn.color[0])
        .attr('stop-opacity', '0.2')
        .attr('class', 'gradient-stop-reverse-0');
      reverseGradient.append('stop')
        .attr('offset', '25%')
        .attr('stop-color', conn.color[1] || conn.color[0])
        .attr('stop-opacity', '0.1')
        .attr('class', 'gradient-stop-reverse-1');
      reverseGradient.append('stop')
        .attr('offset', '50%')
        .attr('stop-color', conn.color[1] || conn.color[0])
        .attr('stop-opacity', '0.6')
        .attr('class', 'gradient-stop-reverse-2');
      reverseGradient.append('stop')
        .attr('offset', '75%')
        .attr('stop-color', conn.color[1] || conn.color[0])
        .attr('stop-opacity', '0.1')
        .attr('class', 'gradient-stop-reverse-3');
      reverseGradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', conn.color[1] || conn.color[0])
        .attr('stop-opacity', '0.2')
        .attr('class', 'gradient-stop-reverse-4');

      // Single line with forward gradient
      const forwardFlow = connectionGroup
        .append('path')
        .attr('class', 'connection-line-flow-forward')
        .attr('d', `M ${start[0]},${start[1]} L ${end[0]},${end[1]}`)
        .attr('stroke', `url(#${forwardGradientId})`)
        .attr('stroke-width', 1.5)
        .attr('fill', 'none')
        .style('cursor', 'pointer');

      // Single line with reverse gradient
      const reverseFlow = connectionGroup
        .append('path')
        .attr('class', 'connection-line-flow-reverse')
        .attr('d', `M ${start[0]},${start[1]} L ${end[0]},${end[1]}`)
        .attr('stroke', `url(#${reverseGradientId})`)
        .attr('stroke-width', 1.5)
        .attr('fill', 'none')
        .style('cursor', 'pointer');

      // Group for hover effects
      const lineGroup = connectionGroup.append('g')
        .attr('class', 'connection-line-group')
        .attr('data-connection-index', index);
      
      lineGroup.node()?.appendChild(forwardFlow.node()!);
      lineGroup.node()?.appendChild(reverseFlow.node()!);

      lineGroup
        .on('mouseenter', function() {
          forwardFlow.attr('stroke-width', 2.2);
          reverseFlow.attr('stroke-width', 2.2);
          setHoveredArc(conn);
          setTooltipPosition(mousePositionRef.current);
        })
        .on('mouseleave', function() {
          forwardFlow.attr('stroke-width', 1.5);
          reverseFlow.attr('stroke-width', 1.5);
          setHoveredArc(null);
          setTooltipPosition(null);
        });
    });

    // Draw capital labels
    const labelsGroup = mapContent.append('g').attr('class', 'labels');
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

    // Draw nodes - sort so selected node renders last (on top)
    const nodesGroup = mapContent.append('g').attr('class', 'nodes');
    const sortedNodes = [...nodesWithLocation].sort((a, b) => {
      // Selected node should be last (rendered on top)
      if (a.name === selectedNodeId) return 1;
      if (b.name === selectedNodeId) return -1;
      return 0;
    });
    
    sortedNodes.forEach((node) => {
      const coords = projection([node.lng, node.lat]);
      if (!coords) return;

      const isSelected = node.name === selectedNodeId;
      // Get current zoom scale to apply inverse scale for constant node size
      const currentZoomScale = zoomTransformRef.current?.k || 1;
      const inverseZoomScale = 1 / currentZoomScale;
      // Combine translate and scale in SVG transform to avoid CSS/SVG transform conflicts
      // Apply inverse zoom scale to keep node size constant, plus selection scale
      const selectionScale = isSelected ? 1.12 : 1;
      const totalScale = inverseZoomScale * selectionScale;
      const nodeGroup = nodesGroup
        .append('g')
        .attr('class', `node-group ${isSelected ? 'selected' : ''}`)
        .attr('transform', `translate(${coords[0]},${coords[1]}) scale(${totalScale})`)
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
      nodeGroup
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

    // Add defs for shadows and clipping (defs already created above for gradients)
    // Reuse the existing defs element
    defs = svg.select<SVGDefsElement>('defs');
    
    // Shadow filter
    defs
      .append('filter')
      .attr('id', 'node-shadow')
      .append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 2)
      .attr('stdDeviation', 3)
      .attr('flood-opacity', 0.3);

    // Clip path for square images with rounded corners
    defs
      .append('clipPath')
      .attr('id', 'node-clip')
      .append('rect')
      .attr('x', -24)
      .attr('y', -24)
      .attr('width', 48)
      .attr('height', 48)
      .attr('rx', 8)
      .attr('ry', 8);
  }, [path, projection, mapSize, countryPolygons, flatMapConnections, nodesWithLocation, selectedNodeId, darkMode, onNodeSelect, zoomTransform]);

  const handleMapClick = useCallback((event: React.MouseEvent) => {
    const target = event.target as Element;
    // Don't deselect if clicking on a node or connection line
    if (
      target.closest('.node-group') ||
      target.closest('.connection-line') ||
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
      </div>
    </div>
  );
};

export default FlatMap;

