# ExecPlan: Sidebar Click → Map Focus

## Goal
When someone clicks a node inside the StatsPanel list, the map should automatically center/zoom on that node and highlight both the sidebar entry and the marker. This keeps users from hunting for markers manually.

## Steps
1. **Introduce shared selection state**
   - Lift `selectedNodeId` into `App.tsx`, pass `onNodeSelect`/`selectedNodeId` props to both `StatsPanel` and `ClusterMap`.
   - Extend `Node` type if needed (e.g., ensure `lat/lon` optional) and add helper selectors.

2. **Update StatsPanel interactions**
   - Render each node row as a button/div with `onClick={() => onNodeSelect(node.name)}`.
   - Highlight the active node (CSS class) and optionally ensure keyboard accessibility.

3. **Map focusing + marker highlight**
   - In `ClusterMap`, keep a ref to the Leaflet map. When `selectedNodeId` changes, find that node’s coordinates and `map.flyTo` with a reasonable zoom (e.g., 5–6). Debounce rapid changes (~200ms) to avoid jitter.
   - Optionally add a small `useEffect` that temporarily adds a `blip` animation or uses Leaflet `setZIndexOffset` for the active marker.

4. **Polish + validation**
   - Add CSS for selected sidebar row + optional animation on markers.
   - Run `npm run build` in `frontend/` to ensure TypeScript compiles; rely on jest? (build enough).

## Validation
- `cd frontend && npm install && npm run build`
- Manual sanity: `npm start` locally (if time) to verify flyTo/scroll highlight.
