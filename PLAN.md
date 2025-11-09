# ExecPlan: Globe-Based Cluster View (TASK-004)

## Goal
Replace the flat Leaflet map with an interactive 3D globe (Google Earth style) that still visualizes nodes and their connections, supports sidebar-driven focusing, and respects light/dark mode.

## Steps
1. **Approach selection**
   - Evaluate `react-globe.gl` (Three.js-based) for rendering HTML markers and arc connections.
   - Sketch how node avatars, selection highlighting, and stats-panel interactions map onto the globe controls/API.

2. **Implementation**
   - Introduce the new dependency (`react-globe.gl` + `three`) and remove unused Leaflet packages.
   - Rebuild `ClusterMap.tsx` around the globe component: render nodes as custom HTML elements, draw arcs for connections, animate focus on sidebar selection, and surface a lightweight info card in lieu of Leaflet popups.
   - Update CSS to style the globe container, overlay cards, and ensure dark/light theming works against the WebGL canvas.

3. **Validation & polish**
   - Run `npm install` (to refresh lockfile) and `npm run build` to confirm the React bundle passes TypeScript/ESLint.
   - Manually sanity-check via reasoning (since no UI access) that selection + theming interactions fire through the new APIs.

## Validation
- `cd frontend && npm install`
- `cd frontend && npm run build`
