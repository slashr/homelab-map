# ExecPlan: Globe Connection Continuity Fix

## Goal
Ensure the globe’s arcs render continuously between nodes (currently they appear broken/dashed beyond the intended animation), while keeping the new 3D map setup intact.

## Steps
1. **Reproduce / inspect settings**
   - Review the `arc*` props in `ClusterMap.tsx` to confirm which options (dash length/gap, altitude scaling) are making arcs look segmented.
   - Check whether connections with missing coordinates are filtered correctly.

2. **Adjust arc rendering**
   - Update the arc configuration to draw solid lines (either disable dashes or tweak lengths) and clamp altitudes so they don’t collapse near the globe surface.
   - Consider introducing `arcDashGap` tweaks or zeroing out the dash settings entirely when the animation isn’t needed.

3. **Validation**
   - Run `npm run build` to ensure TypeScript/CRA compile with the new settings.
   - Manually reason about the arcs (no UI access) and note the improvement in the PR description.

## Validation
- `cd frontend && npm run build`
