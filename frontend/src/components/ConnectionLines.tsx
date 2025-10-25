import React, { useState, useEffect } from 'react';
import { Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Connection } from '../types';
import './ConnectionLines.css';

interface ConnectionLinesProps {
  connections: Connection[];
  darkMode: boolean;
}

// Get color based on latency with distinct colors for each range
const getLatencyColor = (latency_ms: number, darkMode: boolean): string => {
  if (latency_ms < 10) {
    return darkMode ? '#00e676' : '#00c853'; // Bright green - excellent (<10ms)
  } else if (latency_ms < 30) {
    return darkMode ? '#76ff03' : '#64dd17'; // Lime green - great (10-30ms)
  } else if (latency_ms < 60) {
    return darkMode ? '#ffea00' : '#ffd600'; // Yellow - good (30-60ms)
  } else if (latency_ms < 100) {
    return darkMode ? '#ffab00' : '#ff8f00'; // Amber - medium (60-100ms)
  } else if (latency_ms < 150) {
    return darkMode ? '#ff6d00' : '#f57c00'; // Orange - slow (100-150ms)
  } else {
    return darkMode ? '#ff1744' : '#d50000'; // Red - very slow (>150ms)
  }
};

// Thicker lines for better visibility and clickability
const getLineWeight = (latency_ms: number, isHovered: boolean): number => {
  const baseWeight = isHovered ? 6 : 4; // Thicker lines
  return baseWeight;
};

const ConnectionLines: React.FC<ConnectionLinesProps> = ({ connections, darkMode }) => {
  const [hoveredConnection, setHoveredConnection] = useState<string | null>(null);
  const map = useMap();
  const curvesRef = React.useRef<Map<string, L.Polyline>>(new Map());

  useEffect(() => {
    // Clear existing curves
    curvesRef.current.forEach(curve => map.removeLayer(curve));
    curvesRef.current.clear();

    // Filter out connections without valid coordinates (including NaN check)
    const validConnections = connections.filter(
      conn => 
        conn.source_lat != null && 
        conn.source_lon != null && 
        conn.target_lat != null && 
        conn.target_lon != null &&
        !isNaN(conn.source_lat) &&
        !isNaN(conn.source_lon) &&
        !isNaN(conn.target_lat) &&
        !isNaN(conn.target_lon)
    );

    // Skip if no valid connections
    if (validConnections.length === 0) {
      return;
    }

    // Draw curved lines for each connection using bezier approximation
    validConnections.forEach((conn) => {
      const start: [number, number] = [conn.source_lat, conn.source_lon];
      const end: [number, number] = [conn.target_lat, conn.target_lon];
      
      // Calculate control point for curve (offset perpendicular to line)
      const midLat = (start[0] + end[0]) / 2;
      const midLon = (start[1] + end[1]) / 2;
      
      // Perpendicular offset to create curve
      const dx = end[1] - start[1];
      const dy = end[0] - start[0];
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Skip connections where nodes are at the same location (distance = 0 would cause NaN)
      if (distance === 0 || !isFinite(distance)) {
        return;
      }
      
      // Offset amount (15% of distance for nice curve)
      const offsetFactor = 0.15 * distance;
      const perpX = -dy / distance * offsetFactor;
      const perpY = dx / distance * offsetFactor;
      
      // Control point offset from midpoint
      const controlPoint: [number, number] = [midLat + perpY, midLon + perpX];
      
      const connectionKey = `${conn.source_node}-${conn.target_node}`;
      const isHovered = hoveredConnection === connectionKey;
      
      // Approximate bezier curve with multiple points for smoother curve
      const curvePoints: [number, number][] = [];
      const steps = 30; // More steps = smoother curve
      
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Quadratic Bezier formula: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
        const lat = Math.pow(1 - t, 2) * start[0] + 
                    2 * (1 - t) * t * controlPoint[0] + 
                    Math.pow(t, 2) * end[0];
        const lon = Math.pow(1 - t, 2) * start[1] + 
                    2 * (1 - t) * t * controlPoint[1] + 
                    Math.pow(t, 2) * end[1];
        curvePoints.push([lat, lon]);
      }
      
      // Create polyline with curved points
      const curve = L.polyline(curvePoints, {
        color: getLatencyColor(conn.latency_ms, darkMode),
        weight: getLineWeight(conn.latency_ms, isHovered),
        opacity: isHovered ? 0.9 : 0.6,
        smoothFactor: 1,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'animated-connection-line',
      });

      // Add popup to curve
      const popupContent = `
        <div class="connection-popup ${darkMode ? 'dark' : 'light'}">
          <h4>Network Connection</h4>
          <div class="connection-info">
            <div class="connection-row">
              <span class="conn-label">From:</span>
              <span class="conn-value">${conn.source_node}</span>
            </div>
            <div class="connection-row">
              <span class="conn-label">To:</span>
              <span class="conn-value">${conn.target_node}</span>
            </div>
            <div class="connection-divider"></div>
            <div class="connection-row highlight">
              <span class="conn-label">Latency:</span>
              <span class="conn-value latency">${conn.latency_ms.toFixed(2)} ms</span>
            </div>
            ${conn.min_ms !== undefined ? `
              <div class="connection-row">
                <span class="conn-label">Min:</span>
                <span class="conn-value">${conn.min_ms.toFixed(2)} ms</span>
              </div>
            ` : ''}
            ${conn.max_ms !== undefined ? `
              <div class="connection-row">
                <span class="conn-label">Max:</span>
                <span class="conn-value">${conn.max_ms.toFixed(2)} ms</span>
              </div>
            ` : ''}
            <div class="connection-quality">
              ${conn.latency_ms < 20 ? '<span class="quality-badge excellent">⚡ Excellent</span>' : ''}
              ${conn.latency_ms >= 20 && conn.latency_ms < 50 ? '<span class="quality-badge good">✓ Good</span>' : ''}
              ${conn.latency_ms >= 50 && conn.latency_ms < 100 ? '<span class="quality-badge medium">~ Medium</span>' : ''}
              ${conn.latency_ms >= 100 ? '<span class="quality-badge slow">⚠ Slow</span>' : ''}
            </div>
          </div>
        </div>
      `;
      
      curve.bindPopup(popupContent);
      
      // Add hover effects
      curve.on('mouseover', () => {
        setHoveredConnection(connectionKey);
        curve.setStyle({
          weight: getLineWeight(conn.latency_ms, true),
          opacity: 0.9,
        });
      });
      
      curve.on('mouseout', () => {
        setHoveredConnection(null);
        curve.setStyle({
          weight: getLineWeight(conn.latency_ms, false),
          opacity: 0.6,
        });
      });
      
      curve.addTo(map);
      curvesRef.current.set(connectionKey, curve);
    });

    // Cleanup on unmount
    return () => {
      curvesRef.current.forEach(curve => map.removeLayer(curve));
      curvesRef.current.clear();
    };
  }, [connections, darkMode, map]);

  return null;
};

export default ConnectionLines;
