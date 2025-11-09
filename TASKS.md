# TASKS

## Low Effort
1. [DONE] Make `NODE_TIMEOUT` configurable
   - **Problem:** `aggregator/main.py` currently hardcodes `NODE_TIMEOUT = 120`, so the online/offline thresholds in `/api/nodes` and `/api/stats` cannot be tuned for larger clusters or when nodes naturally report slower (e.g., during performance testing).
   - **Proposed Solution:** Read `NODE_TIMEOUT_SECONDS` (or similar) from the environment, defaulting to 120, and reuse that value everywhere the code currently references the constant.
   - **Acceptance Criteria:** `NODE_TIMEOUT` becomes a runtime configuration, the default behavior is unchanged, and tests cover both the default and a custom timeout via monkeypatching.
   - **Plan:** Add a helper near the existing constant to load the env var, update the comparisons inside `get_all_nodes`/`get_cluster_stats`, and ensure the new configuration is documented in `README.md`.
   - **Alternatives:** Keep the constant but expose a configuration file; chosen path keeps the fast startup flow simple and consistent with the rest of the service.

2. [DONE] Allow the agent home location to be injected via environment variables
   - **Problem:** `agent/agent.py` requires editing the `HOME_LOCATION` dictionary (lines 32‑36) to reposition the on-prem nodes, which is inconvenient and error-prone for people who run their own clusters.
   - **Proposed Solution:** Build `HOME_LOCATION` from optional env vars such as `HOME_CITY`, `HOME_LAT`, and `HOME_LON`, falling back to the current defaults when the vars are absent.
   - **Acceptance Criteria:** Agents can be redeployed without changing Python code by overriding env vars, and the README lists the new variables.
   - **Plan:** Wrap the current dictionary in a factory that checks `os.getenv`, keeps the existing defaults, and updates the doc block near the configuration comment.
   - **Alternatives:** Accept a config file or ConfigMap for locations; env vars keep the DaemonSet spec minimal.

## Medium Effort
1. [IN PROGRESS] Surface network throughput per node in the UI
   - **Problem:** The README’s “Features” list still has [ ] for “Real-time network speed metrics,” and neither the agent nor the aggregator currently reports upload/download counters—only cpu/memory/disk. The frontend likewise lacks any place to display throughput.
   - **Proposed Solution:** Have the agent use `psutil.net_io_counters()` (per node) to calculate delta bytes over `REPORT_INTERVAL`, send those metrics in the payload, expose them via a new Pydantic field (e.g., `network_send_bytes_per_sec`), and update `StatsPanel`/`ClusterMap` to render the numbers.
   - **Acceptance Criteria:** Aggregator’s `/api/nodes` response includes per-node throughput, the frontend shows upload/download stats in the stats panel or popups, and the README checkbox becomes checked with a short note about how it works.
   - **Plan:** Extend `NodeData`/`NodeStatus` with throughput fields, aggregate the stats in `get_cluster_stats`, update the React `Node` type, and add a small UI component showing the values (with tests covering the new API contract).
   - **Alternatives:** Push the throughput calculation into the aggregator by diffing previously stored counters; that would be heavier and duplicate state across nodes, so measuring at the agent keeps it localized.

2. Garbage‑collect stale connections and nodes in the aggregator
   - **Problem:** `connections_data` grows indefinitely because entries are only added in `receive_node_data`, and `nodes_data` never prunes offline nodes. Long-lived deployments will accumulate stale entries and inflate `/api/stats` (`total_connections`) even when nodes disappear.
   - **Proposed Solution:** Introduce a cleanup pass (either on each request or in a background task) that removes nodes and connections that haven’t been updated within `NODE_TIMEOUT` plus a grace period.
   - **Acceptance Criteria:** After simulating a node silently disappearing, `/api/nodes` reports one fewer node, `/api/connections` omits its connections, and `/api/stats` recalculates totals accordingly.
   - **Plan:** Add a helper that iterates over `nodes_data`/`connections_data`, compares `received_at`, and drops old entries before the API responses are built. Consider caching the cleanup timestamp so it only runs once per query to limit CPU in busy deployments.
   - **Alternatives:** Use a scheduled background `asyncio` task; we can start with an inline cleanup to keep dependencies minimal.

## High Effort
1. Introduce historical storage for node metrics
   - **Problem:** The aggregator only keeps the latest snapshot (`nodes_data`/`connections_data` in memory), so there’s no way to surface historical trends, and a restart loses all visibility.
   - **Proposed Solution:** Persist incoming node snapshots to a lightweight time-series store (SQLite, Prometheus push gateway, or even append-only JSON) and add endpoints that can retrieve metrics over time for charting.
   - **Acceptance Criteria:** Aggregator keeps at least a rolling 24‑hour window (configurable) of node snapshots, `/api/stats` can return average/min/max in that window, and the frontend adds a “History” view that can consume that endpoint.
   - **Plan:** Define a storage abstraction (`HistoryStore`) that can write/read from disk, record each payload at `receive_node_data`, expose new FastAPI routes (e.g., `/api/history`), and update the frontend to visualize the data (e.g., sparkline in `StatsPanel`).
   - **Alternatives:** Push historical storage to an external time-series database (Influx/Prometheus) and have the aggregator forward metrics instead of persisting locally. Starting with disk-based persistence keeps the repo self-contained.
