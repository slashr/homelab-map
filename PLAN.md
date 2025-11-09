# ExecPlan: Sidebar Info Panel Fix (TASK-003)

## Goal
Ensure the node info popup opened from the sidebar selection no longer closes a second later for Michael/Jim (or any co-located nodes) by hardening the `SelectedNodeFocus` logic in `ClusterMap`.

## Steps
1. **Root-cause review**
   - Study `ClusterMap.tsx` to see how `MarkerClusterGroup.zoomToShowLayer`, `map.flyTo`, and popup timing interact.
   - Confirm where popups might close automatically (e.g., during cluster animations) and capture the selection timestamp for heuristics.

2. **Popup stabilization**
   - Refactor `SelectedNodeFocus` so popups open only after the fly-to animation completes, with fallbacks if no move occurs.
   - Add a listener that reopens the popup once if it closes within ~2–3 seconds of selection (to cover cluster-induced closes) without preventing manual dismissals later.

3. **Validation**
   - Run `npm run build` inside `frontend/` to ensure the TypeScript bundle succeeds.
   - Spot-check TypeScript types and lint warnings during build logs.

## Validation
- `cd frontend && npm run build`
