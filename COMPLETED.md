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

## High Effort
1. Accelerate CI builds with caching and smarter service selection
   - **Problem:** Every PR rebuilt all service images, wasting Release time.
   - **Solution:** Use `dorny/paths-filter` plus BuildKit cache to build/push only the services with file changes.
   - **Acceptance Criteria:** Service-specific builds run, caching speeds repeats, and docs explain skip logic.
