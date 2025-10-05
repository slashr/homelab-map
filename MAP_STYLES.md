# Map Styles Guide

Your homelab map now has **dark mode by default** with simplified node details! 🌙

## Current Configuration

✅ **Dark theme** with CartoDB Dark tiles  
✅ **Simplified popup** - Shows only: Status, Location, CPU, Memory, Last Seen  
✅ **Dark sidebar** - Matches the map theme  
✅ **Character avatars** - Circular profile images with status borders

## Available Map Styles

To change the map style, edit `frontend/src/components/ClusterMap.tsx` and uncomment the style you want:

### 1. **Dark Mode** (Current - Default) 🌑
```tsx
<TileLayer
  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
/>
```
Perfect for night viewing, reduces eye strain

### 2. **Light Minimalist** ☀️
```tsx
<TileLayer
  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
/>
```
Clean and minimal, less visual clutter

### 3. **Voyager (Colorful)** 🎨
```tsx
<TileLayer
  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
/>
```
Balanced colors, good detail, modern look

### 4. **Standard OpenStreetMap** 🗺️
```tsx
<TileLayer
  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
/>
```
Traditional map view with full details

## Map Detail Levels

The **dark mode map style** has less geographic detail (fewer road names, simplified features) which makes it cleaner and focuses attention on your nodes.

**Node popups show full details:**
- ✅ Node name & status
- ✅ Location & provider
- ✅ IP addresses (internal/external)
- ✅ CPU, Memory, Disk usage
- ✅ Last seen & Kubernetes version

All the info you need when you click a node!

## Quick Rebuild

After changing styles:
```bash
docker build -t dawker/homelab-map-frontend:latest ./frontend
docker push dawker/homelab-map-frontend:latest
kubectl rollout restart deployment/homelab-map-frontend -n homelab-map
```

## Screenshots Reference

**Dark Mode Features:**
- Dark map tiles
- Dark sidebar (#1e1e1e)
- Dark popups with light text
- Character avatars with colored status borders (green = online)
- Smooth hover effects on markers
