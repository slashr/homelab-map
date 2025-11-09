# Completed Tasks

## Low Effort
1. Make `NODE_TIMEOUT` configurable
   - **Problem:** `aggregator/main.py` hardcoded `NODE_TIMEOUT = 120`, so the online/offline thresholds in `/api/nodes` and `/api/stats` couldn’t adapt to larger clusters or slower reporters.
   - **Solution:** Load `NODE_TIMEOUT_SECONDS` from the environment (default 120) and reuse it wherever the constant was referenced.
   - **Acceptance Criteria:** Behavior unchanged by default, configurable via env, and tests cover both default/custom values.

2. Allow the agent home location to be injected via environment variables
   - **Problem:** Repositioning on-prem nodes required editing `agent/agent.py`.
   - **Solution:** Build `HOME_LOCATION` from `HOME_CITY`, `HOME_LAT`, and `HOME_LON` env vars (with Berlin as fallback).
   - **Acceptance Criteria:** Agents redeploy without code changes and README documents the new variables.

## Medium Effort
1. Surface network throughput per node in the UI
   - **Problem:** “Real-time network speed metrics” was unchecked; no throughput data was collected/displayed.
   - **Solution:** Collect tx/rx deltas in the agent, expose via aggregator models/endpoints, and display in StatsPanel/ClusterMap.
   - **Acceptance Criteria:** `/api/nodes` exposes throughput, UI renders it, README feature marked complete.

2. Make sidebar nodes focus the map when clicked
   - **Problem:** Clicking a node in StatsPanel didn’t help locate it on the map.
   - **Solution:** Share selected-node state between StatsPanel and ClusterMap, pan/zoom to the node, and highlight markers/rows.
   - **Acceptance Criteria:** Clicking a node centers the map with smooth feedback in both themes.

3. Sidebar node clicks should zoom to individual markers
   - **Problem:** Even after highlighting, the map sometimes stayed zoomed out enough to show only clustered counts.
   - **Solution:** Track marker references, use `zoomToShowLayer`, and fly the map to at least zoom 9 so the selected marker is visible/opened.
   - **Acceptance Criteria:** A single click focuses the individual marker regardless of clustering state.

4. Remove the horizontal gap when the map is fully zoomed out
   - **Problem:** At world view a strip of background was visible between the sidebar and map.
   - **Solution:** Increase the sidebar’s default width (with responsive clamps) so the map edge aligns with it at all zoom levels.
   - **Acceptance Criteria:** No gap appears when fully zoomed out; layout stays responsive.

5. Keep sidebar-triggered node popups open
   - **Problem:** Selecting Michael or Jim from the sidebar briefly opened their map info panels before clustering/fly-to animations closed them again, so users couldn’t read the details.
   - **Solution:** Refined `SelectedNodeFocus` to wait for fly-to completion before opening the popup, added a short window that reopens popups closed by clustering, and limited the hook dependencies to stable node identifiers so telemetry updates don’t refire the focus logic.
   - **Acceptance Criteria:** Clicking Michael or Jim keeps their info panel open until the user dismisses it, and the behavior matches other nodes.

6. Replace the flat map with an interactive globe
   - **Problem:** The UI needed a Google-Earth-like experience instead of the existing Leaflet world map.
   - **Solution:** Swapped the Leaflet stack for `react-globe.gl`, rendered nodes as HTML avatars hovering above the sphere, drew latency arcs for every connection, added a floating info card, and wired sidebar selections into the globe point-of-view animation.
   - **Acceptance Criteria:** Nodes and connections render on a 3D globe in both themes, selecting a node or toggling the sidebar focuses the correct spot, and the card surfaces the same metrics previously shown in the map popup.

7. Fix sidebar width and clear npm audit issues
   - **Problem:** The stats sidebar collapsed to a sliver after the globe refactor, and `npm audit` flagged nine vulnerabilities (svgo/postcss/webpack-dev-server, etc.) from CRA’s dependency tree.
   - **Solution:** Locked the sidebar’s flex-basis/min-width via the existing clamp variable so it can’t shrink, pinned patched versions of the vulnerable packages with `package.json` overrides, and used `patch-package` to update CRA’s dev-server config to the modern `server`/`setupMiddlewares` API to stay compatible with the new dependencies.
   - **Acceptance Criteria:** Sidebar width remains stable across breakpoints, `npm audit` reports zero issues, and `npm run build/start` continue working.

8. Polish the 3D globe interactions
   - **Problem:** The globe auto-rotated nonstop, pinch markers weren’t clickable, the sphere appeared off-center, and there was little geographic context (no borders/capitals).
   - **Solution:** Disabled auto-rotation, wired each HTML marker to the shared selection handler, recentered the canvas via layout tweaks, and layered country polygons plus curated capital labels using `world-atlas`/`topojson-client`.
   - **Acceptance Criteria:** Globe stays still until the user drags it, clicking a marker opens the info card, the sphere is centered in its panel, and borders/capital labels render without overwhelming the UI.

## High Effort
1. Accelerate CI builds with caching and smarter service selection
   - **Problem:** Every PR rebuilt all service images, wasting Release time.
   - **Solution:** Use `dorny/paths-filter` plus BuildKit cache to build/push only the services with file changes.
   - **Acceptance Criteria:** Service-specific builds run, caching speeds repeats, and docs explain skip logic.
