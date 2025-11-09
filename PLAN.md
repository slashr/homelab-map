# ExecPlan: Globe Interaction & Detail Polish

## Goal
Improve the 3D globe UX by stopping the constant auto-rotation, allowing marker clicks to open the info card, centering the globe visually, and layering in geographic context (borders + capital labels).

## Steps
1. **Marker interaction & selection**
   - Extend `ClusterMap` to accept an `onNodeSelect` callback from `App` and attach click/keyboard handlers to each HTML marker so map clicks mirror sidebar selections.
   - Remove the auto-rotate logic so the globe stays still unless the user drags it.

2. **Layout centering**
   - Adjust `.cluster-map` / `.globe-wrapper` styles (and canvas display rules) so the globe canvas is centered regardless of the floating info card, and ensure markers show a pointer cursor.

3. **Geographic detail**
   - Import `world-atlas` + `topojson-client` to render subtle country polygons and add a curated `capitals.ts` dataset rendered via `labelsData` for quick visual reference.

4. **Validation**
   - `npm install` (for new topojson/world-atlas deps) and `npm run build` to confirm CRA compiles.
   - Verify `npm audit` stays clean.

## Validation
- `cd frontend && npm install`
- `cd frontend && npm run build`
- `cd frontend && npm audit`
