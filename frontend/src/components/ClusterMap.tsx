import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, GeoJSON } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L, { LatLngBoundsExpression } from 'leaflet';
import { Node, Connection } from '../types';
import ConnectionLines from './ConnectionLines';
import './ClusterMap.css';

// Fix for default marker icons in React Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Map node names to character images
const getCharacterImage = (nodeName: string): string => {
  // Extract character name from node name (e.g., "michael-pi" -> "michael")
  const character = nodeName.split('-')[0].toLowerCase();
  
  // Use local image if available, otherwise fallback to UI Avatars
  const localImage = `/characters/${character}.jpg`;
  
  // Return local image path (will fallback to UI Avatars via onError in img tag)
  return localImage;
};

// Get fallback avatar for when local image fails to load
const getFallbackAvatar = (nodeName: string): string => {
  const character = nodeName.split('-')[0].toLowerCase();
  const characterNames: Record<string, string> = {
    'michael': 'Michael+Scott',
    'jim': 'Jim+Halpert',
    'dwight': 'Dwight+Schrute',
    'angela': 'Angela+Martin',
    'stanley': 'Stanley+Hudson',
    'phyllis': 'Phyllis+Vance',
    'toby': 'Toby+Flenderson',
  };

  const characterColors: Record<string, string> = {
    'michael': '667eea',
    'jim': '4285F4',
    'dwight': 'FFC107',
    'angela': '9c27b0',
    'stanley': 'ff9800',
    'phyllis': '4caf50',
    'toby': '795548',
  };
  
  const fallbackName = characterNames[character] || character;
  const fallbackColor = characterColors[character] || '607D8B';
  
  return `https://ui-avatars.com/api/?name=${fallbackName}&size=128&background=${fallbackColor}&color=fff&bold=true`;
};

// Custom markers with character images
const getMarkerIcon = (nodeName: string, status: string) => {
  const imageUrl = getCharacterImage(nodeName);
  
  // Status border colors
  const statusColors: Record<string, string> = {
    'online': '#4caf50',
    'warning': '#ff9800',
    'offline': '#9e9e9e',
  };
  
  const borderColor = statusColors[status] || '#2196F3';
  
  const fallbackUrl = getFallbackAvatar(nodeName);
  
  const html = `
    <div style="
      width: 50px;
      height: 50px;
      border-radius: 50%;
      border: 3px solid ${borderColor};
      overflow: hidden;
      background: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">
      <img src="${imageUrl}" 
           onerror="this.src='${fallbackUrl}'"
           style="width: 100%; height: 100%; object-fit: cover;"
           alt="Character" />
    </div>
  `;

  return L.divIcon({
    html: html,
    className: 'character-marker',
    iconSize: [50, 50],
    iconAnchor: [25, 25],
    popupAnchor: [0, -25],
  });
};

interface ClusterMapProps {
  nodes: Node[];
  connections: Connection[];
  darkMode: boolean;
}

const WORLD_BOUNDS: LatLngBoundsExpression = [
  [-85, -180],
  [85, 180],
];

const clampToRange = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, value));
};

const SingleWorldView: React.FC = () => {
  const map = useMap();

  useEffect(() => {
    map.setMaxBounds(WORLD_BOUNDS);

    const keepWithinWorld = () => {
      const center = map.getCenter();
      const clampedLat = clampToRange(center.lat, -85, 85);
      const clampedLng = clampToRange(center.lng, -180, 180);

      if (center.lat !== clampedLat || center.lng !== clampedLng) {
        map.setView([clampedLat, clampedLng], map.getZoom(), { animate: false });
      }
    };

    map.on('moveend', keepWithinWorld);

    return () => {
      map.off('moveend', keepWithinWorld);
    };
  }, [map]);

  return null;
};

// Component to highlight countries where nodes are located
const CountryHighlights: React.FC<{ nodes: Node[], darkMode: boolean }> = ({ nodes, darkMode }) => {
  const [geoData, setGeoData] = useState<any>(null);
  
  useEffect(() => {
    // Fetch world countries GeoJSON
    fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
      .then(res => res.json())
      .then(data => setGeoData(data))
      .catch(err => console.error('Failed to load country data:', err));
  }, []);
  
  if (!geoData || nodes.length === 0) return null;
  
  // Determine which countries have nodes
  const countriesWithNodes = new Set<string>();
  nodes.forEach(node => {
    if (node.location?.includes('Germany')) {
      countriesWithNodes.add('Germany');
    }
    if (node.location?.includes('CA') || node.location?.includes('IA') || 
        node.location?.includes('California') || node.location?.includes('Iowa')) {
      countriesWithNodes.add('United States of America');
    }
  });
  
  const style = (feature: any) => {
    const countryName = feature.properties.ADMIN || feature.properties.name;
    const isHighlighted = countriesWithNodes.has(countryName);
    
    return {
      fillColor: isHighlighted ? (darkMode ? '#667eea' : '#4285F4') : 'transparent',
      fillOpacity: isHighlighted ? 0.15 : 0,
      color: isHighlighted ? (darkMode ? '#667eea' : '#4285F4') : 'transparent',
      weight: isHighlighted ? 2 : 0,
      opacity: isHighlighted ? 0.5 : 0,
    };
  };
  
  return <GeoJSON data={geoData} style={style} />;
};

// Component to fit map bounds to all markers (only on first load)
const FitBounds: React.FC<{ nodes: Node[] }> = ({ nodes }) => {
  const map = useMap();
  const hasFitted = useRef(false);
  
  useEffect(() => {
    // Only fit bounds once when nodes first load, not on every refresh
    if (nodes.length > 0 && !hasFitted.current) {
      const bounds = L.latLngBounds(
        nodes.map(node => [node.lat!, node.lon!] as [number, number])
      );
      
      // Fit bounds with padding
      map.fitBounds(bounds, {
        padding: [50, 50],
        maxZoom: 6, // Don't zoom in too close
      });
      
      hasFitted.current = true;
    }
  }, [nodes, map]);
  
  return null;
};

const ClusterMap: React.FC<ClusterMapProps> = ({ nodes, connections, darkMode }) => {
  // Filter nodes that have location data
  const nodesWithLocation = nodes.filter(node => node.lat && node.lon);

  // Default center (world view)
  const center: [number, number] = [20, 0]; // Center of the world
  const zoom = 2; // Global view

  return (
    <div className="cluster-map">
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
        maxBounds={WORLD_BOUNDS}
        maxBoundsViscosity={1.0}
        minZoom={2}
        worldCopyJump={false}
      >
        {/* Limit view to a single world copy and fit bounds to nodes */}
        <SingleWorldView />
        <FitBounds nodes={nodesWithLocation} />
        
        {/* Highlight countries with nodes */}
        <CountryHighlights nodes={nodesWithLocation} darkMode={darkMode} />
        
        {/* Draw connection lines between nodes */}
        <ConnectionLines connections={connections} darkMode={darkMode} />
        
        {/* Conditionally render dark or light map tiles */}
        {darkMode ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains='abcd'
            maxZoom={20}
            noWrap={true}
            bounds={WORLD_BOUNDS}
          />
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains='abcd'
            maxZoom={20}
            noWrap={true}
            bounds={WORLD_BOUNDS}
          />
        )}
        
        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={50}
          spiderfyOnMaxZoom={true}
          showCoverageOnHover={false}
        >
          {nodesWithLocation.map((node) => (
            <Marker
              key={node.name}
              position={[node.lat!, node.lon!]}
              icon={getMarkerIcon(node.name, node.status)}
            >
              <Tooltip direction="top" offset={[0, -45]} opacity={0.9}>
                <strong>{node.name}</strong>
              </Tooltip>
              
              <Popup>
              <div className={`node-popup ${darkMode ? 'dark' : 'light'}`}>
                <h3>{node.name}</h3>
                <div className="node-popup-content">
                  <div className="popup-row">
                    <span className="label">Status:</span>
                    <span className={`status-badge status-${node.status}`}>
                      {node.status}
                    </span>
                  </div>
                  
                  {node.location && (
                    <div className="popup-row">
                      <span className="label">Location:</span>
                      <span>{node.location}</span>
                    </div>
                  )}
                  
                  {node.provider && (
                    <div className="popup-row">
                      <span className="label">Provider:</span>
                      <span className="provider-badge">{node.provider}</span>
                    </div>
                  )}
                  
                  {node.internal_ip && (
                    <div className="popup-row">
                      <span className="label">Internal IP:</span>
                      <span><code>{node.internal_ip}</code></span>
                    </div>
                  )}
                  
                  {node.external_ip && (
                    <div className="popup-row">
                      <span className="label">External IP:</span>
                      <span><code>{node.external_ip}</code></span>
                    </div>
                  )}
                  
                  {node.cpu_percent !== undefined && (
                    <div className="popup-row">
                      <span className="label">CPU:</span>
                      <span>{node.cpu_percent.toFixed(1)}%</span>
                    </div>
                  )}
                  
                  {node.memory_percent !== undefined && (
                    <div className="popup-row">
                      <span className="label">Memory:</span>
                      <span>{node.memory_percent.toFixed(1)}%</span>
                    </div>
                  )}
                  
                  {node.disk_percent !== undefined && (
                    <div className="popup-row">
                      <span className="label">Disk:</span>
                      <span>{node.disk_percent.toFixed(1)}%</span>
                    </div>
                  )}
                  
                  <div className="popup-row">
                    <span className="label">Last Seen:</span>
                    <span>{node.last_seen}</span>
                  </div>
                  
                  {node.kubelet_version && (
                    <div className="popup-row">
                      <span className="label">Version:</span>
                      <span><code>{node.kubelet_version}</code></span>
                    </div>
                  )}
                </div>
              </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
};

export default ClusterMap;
