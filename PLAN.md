# ExecPlan: Surface Network Throughput Per Node

## Purpose and Outcome

Users want to see live upload/download speeds for each node so they can confirm bandwidth usage without SSHing into machines. This plan describes how to collect per-interval byte counters in the agent, expose them through the aggregator API, and render them in the frontend (both at the cluster level and per node). When finished, `/api/nodes` and `/api/stats` will report transmit/receive bytes per second, the React UI will show those values in the stats panel and node cards, and the README feature checklist will mark “Real-time network speed metrics” as complete with a short explainer.

## System Background

The agent (`agent/agent.py`) loops forever, collecting system metrics with `psutil` before POSTing JSON to the aggregator every `REPORT_INTERVAL` seconds. Today it captures CPU, memory, disk, and basic network interface names but no throughput numbers. The aggregator (`aggregator/main.py`) stores each POSTed payload, exposes it via `/api/nodes`, and summarizes totals in `/api/stats` using the `NodeData` and `NodeStatus` Pydantic models plus an async FastAPI router. The frontend (`frontend/src`) polls those endpoints through Axios and renders the results in `StatsPanel` and `ClusterMap` using TypeScript definitions in `types.ts`. The README “Features” section currently shows an unchecked box for network speed metrics, signaling this gap to operators.

## Implementation Plan

1. **Agent throughput measurement:**
   - Add module-level helpers that call `psutil.net_io_counters()` each loop, maintain the previous counter snapshot, and return bytes-per-second for transmit and receive using the elapsed wall-clock seconds (use an epsilon guard to avoid division by zero). Store the last snapshot and timestamp in globals so the computation survives across iterations.
   - Update `get_node_info` (or the main loop before POSTing) to include two numeric fields in `node_data`: `network_tx_bytes_per_sec` and `network_rx_bytes_per_sec`. Initialize them to zero on the first sample. Leave the rest of the payload unchanged so backward compatibility is preserved.

2. **Aggregator data models and stats:**
   - Extend `NodeData` and `NodeStatus` with optional `network_tx_bytes_per_sec` and `network_rx_bytes_per_sec` floats. Ensure `get_all_nodes` copies these fields into the response payload when present.
   - Modify `get_cluster_stats` to accumulate the per-node tx/rx values for online nodes and emit new keys (e.g., `avg_network_tx_bytes_per_sec`, `avg_network_rx_bytes_per_sec`). Keep defaults at zero when no online nodes exist. Update the aggregator tests in `aggregator/tests/test_main.py` to cover the new schema (both for `/api/nodes` mapping and `/api/stats` averages).

3. **Frontend changes:**
   - Update `frontend/src/types.ts` to reflect the new node and stats fields.
   - Enhance `StatsPanel` to show cluster-wide upload/download speeds (rendered as MB/s with two decimals) inside the resource section, and show per-node values in the nodes list or a new throughput subsection so operators can compare machines quickly. Add simple helper functions for formatting bytes per second.
   - Update `ClusterMap` popups to display each node’s throughput so map users see the data without visiting the stats panel. Keep styling consistent with the existing UI themes.

4. **Documentation and polish:**
   - Mark the README feature checkbox for “Real-time network speed metrics” as checked and add a sentence in the Features section noting that throughput now comes from psutil deltas.
   - Mention the new metric fields briefly in README (either in a short bullet or inline with Features) so consumers of the API understand the shapes.

## Validation

Run the aggregator pytest suite (inside `aggregator/venv`) to exercise the new schema logic:

    cd aggregator
    source venv/bin/activate
    pytest

Then run the frontend TypeScript checks via the existing React scripts to ensure types compile:

    cd frontend
    npm install
    npm run build

Also perform a quick manual agent dry run by setting `REPORT_INTERVAL=1` with fake HOME variables and executing `python agent.py` for two iterations while tailing the logs to confirm the tx/rx fields appear; bail out with Ctrl+C afterward. Document the manual observation in the PR notes.

## Progress

- [x] Agent calculates and sends tx/rx bytes per second
- [x] Aggregator models and stats expose the new fields with test coverage
- [x] Frontend renders cluster-level and per-node throughput
- [x] README/feature docs updated plus local pytest/build/manual verification completed

## Change Log

- 2025-11-09 – Initial plan drafted for implementing end-to-end network throughput metrics.
- 2025-11-09 – Progress updated after implementing agent, aggregator, frontend, documentation, and test/build verification.
