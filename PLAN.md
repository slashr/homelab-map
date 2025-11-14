# ExecPlan: Map Mode Toggle & UX Improvements

## Goal
1. Add two map modes: flat world map and globe view with toggle
2. Remove restrictions from globe rotation (allow full top-bottom rotation)
3. Reduce node info card size to prevent it from covering other elements
4. Improve network connection animation (smoother, slower, dotted but continuous lines)

## Problems
1. Only globe view available - no flat map option
2. Globe rotation is restricted to horizontal view only
3. Node info card is too large and covers map elements
4. Network connection animations are too fast and not smooth enough

## Solution

### 1. Map Mode Toggle
- Add toggle button in header (🗺️/🌍) to switch between globe and flat map
- Create new `FlatMap` component using d3-geo with Mercator projection
- Store mode preference in localStorage
- Both modes share same node selection and info card functionality

### 2. Remove Globe Rotation Restrictions
- Remove `minPolarAngle` and `maxPolarAngle` constraints
- Allow full 360-degree rotation in all directions
- Remove constraint enforcement code

### 3. Reduce Info Card Size
- Reduce width from `clamp(160px, 12vw, 200px)` to `clamp(140px, 10vw, 160px)`
- Reduce padding and font sizes throughout
- Reduce gaps and margins for more compact layout

### 4. Improve Connection Animation
- **Globe mode**: Increase `arcDashLength` to 0.6, `arcDashGap` to 0.3, `arcDashAnimateTime` to 4000ms
- **Flat map mode**: Implement smooth requestAnimationFrame animation with `stroke-dasharray: '10 5'` for dotted continuous lines

## Changes
- `frontend/src/App.tsx`: Add map mode state and toggle button
- `frontend/src/App.css`: Style header-right and map-mode-toggle button
- `frontend/src/components/ClusterMap.tsx`: Remove rotation restrictions, improve animation
- `frontend/src/components/ClusterMap.css`: Reduce info card sizes
- `frontend/src/components/FlatMap.tsx`: New component for flat map view
- `frontend/src/components/FlatMap.css`: Styles for flat map
- `frontend/package.json`: Add d3-geo and d3-selection dependencies

## Validation
- Test locally with `npm start`
- Verify globe/flat map toggle works and persists preference
- Test unrestricted globe rotation in all directions
- Verify info card is smaller and doesn't cover nodes
- Test smooth, slow connection animations in both modes
- Test in both light and dark modes
- Verify node selection works in both map modes
