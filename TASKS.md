# TASKS

## Low Effort
_No active tasks (see `COMPLETED.md` for prior items)._

## Medium Effort
1. Garbage‑collect stale connections and nodes in the aggregator
   - **Problem:** `connections_data` grows indefinitely because entries are only added in `receive_node_data`, and `nodes_data` never prunes offline nodes. Long-lived deployments will accumulate stale entries and inflate `/api/stats` (`total_connections`) even when nodes disappear.
   - **Proposed Solution:** Introduce a cleanup pass (either on each request or in a background task) that removes nodes and connections that haven’t been updated within `NODE_TIMEOUT` plus a grace period.
   - **Acceptance Criteria:** After simulating a node silently disappearing, `/api/nodes` reports one fewer node, `/api/connections` omits its connections, and `/api/stats` recalculates totals accordingly.
   - **Plan:** Add a helper that iterates over `nodes_data`/`connections_data`, compares `received_at`, and drops old entries before the API responses are built. Consider caching the cleanup timestamp so it only runs once per query to limit CPU in busy deployments.

2. Sidebar node clicks should zoom to individual markers
   - **Problem:** Clicking a node in the sidebar often leaves the map zoomed out enough that only the cluster count is visible, forcing extra clicks to locate the exact marker.
   - **Proposed Solution:** Adjust the selection logic so the map zoom/flyTo targets an individual node zoom level (or expands the cluster automatically).
   - **Acceptance Criteria:** A single click in the sidebar focuses the map close enough to show the selected node marker, even when it previously belonged to a cluster.

3. Remove the horizontal gap when the map is fully zoomed out
   - **Problem:** With the map zoomed all the way out, a visible gap appears beside the sidebar.
   - **Proposed Solution:** Increase the sidebar width (or otherwise adjust layout spacing) so the empty gap disappears at world view.
   - **Acceptance Criteria:** At maximum zoom-out the sidebar and map meet cleanly with no background gap.

## High Effort
1. Introduce historical storage for node metrics
   - **Problem:** The aggregator only keeps the latest snapshot (`nodes_data`/`connections_data` in memory), so there’s no way to surface historical trends, and a restart loses all visibility.
   - **Proposed Solution:** Persist incoming node snapshots to a lightweight time-series store (SQLite, Prometheus push gateway, or even append-only JSON) and add endpoints that can retrieve metrics over time for charting.
   - **Acceptance Criteria:** Aggregator keeps at least a rolling 24‑hour window (configurable) of node snapshots, `/api/stats` can return average/min/max in that window, and the frontend adds a “History” view that can consume that endpoint.
   - **Plan:** Define a storage abstraction (`HistoryStore`) that can write/read from disk, record each payload at `receive_node_data`, expose new FastAPI routes (e.g., `/api/history`), and update the frontend to visualize the data (e.g., sparkline in `StatsPanel`).
