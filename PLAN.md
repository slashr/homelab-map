# ExecPlan: Sidebar Zoom & Layout Polish

## Goal
Finish TASKS #2 and #3 (former “tasks 8/9”): ensure clicking a node in the sidebar zooms the map tightly enough to reveal the individual marker, and remove the empty gap that appears when the map is fully zoomed out by widening/adjusting the sidebar layout.

## Steps
1. **Zoom-to-node behavior**
   - Investigate how Leaflet clustering currently reacts to `map.flyTo` and whether we need to trigger marker expansion when the sidebar selection changes.
   - Adjust the selection handler to zoom to a configurable level (e.g., 8–10) and/or leverage `MarkerClusterGroup`’s `spiderfy`/`zoomToShowLayer` helpers so the selected marker is always visible.

2. **Sidebar width / layout gap**
   - Review `App.css`/layout styles to understand how the map area leaves a margin when fully zoomed out.
   - Increase the sidebar width (or tweak flex spacing) until the map spans the remaining width without exposing background gaps at world view; verify responsiveness on smaller screens.

3. **Validation + UX polish**
   - Run `npm run build` in `frontend/` to ensure TypeScript/ESLint stay clean.
   - Manual sanity via `npm start` (time permitting) to confirm clicks zoom appropriately and the gap is gone in light/dark modes.

## Validation
- `cd frontend && npm run build`
- Optional manual UI smoke test (document observations in PR).
