# ExecPlan: Injectable Agent Home Location

## Purpose and Outcome

Operators currently edit `agent/agent.py` to change `HOME_LOCATION`, which means rebuilding the image for every cluster. This plan shows how to make the agent read `HOME_CITY`, `HOME_LAT`, and `HOME_LON` environment variables so that helm charts, DaemonSets, or docker-compose files can override the home marker without modifying Python code. After executing the plan, agents started with these env vars will emit the correct city and coordinates, the defaults remain Berlin/Germany for untouched deployments, and the README explains how to configure the new knobs.

## System Background

The agent service defined in `agent/agent.py` runs inside a Kubernetes DaemonSet. It sets `HOME_LOCATION` to a hard-coded dictionary and then expands that dictionary when it builds the `NODE_LOCATIONS` mapping for on-prem Raspberry Pi nodes. The `NODE_LOCATIONS` data is copied into every payload so the aggregator/front-end can plot on-prem machines near the user’s home. Because the environment already provides other runtime settings (`AGGREGATOR_URL`, `REPORT_INTERVAL`), making the home location configurable via env vars keeps the deployment story consistent. Documentation for operator setup currently tells users to edit `agent/agent.py`, so it must be updated alongside the code change.

## Implementation Plan

Introduce helper functions near the configuration block in `agent/agent.py` to read three optional environment variables: `HOME_CITY` (string), `HOME_LAT` (float), and `HOME_LON` (float). Each helper should fall back to the existing Berlin defaults and log a warning when an invalid float is provided so operators notice typos. Replace the static `HOME_LOCATION` literal with a call to the new helper so `NODE_LOCATIONS` automatically inherits any overrides at module import.

Because the node mapping copies `HOME_LOCATION` for several keys, no other parts of the agent need to change. However, the README’s “Setup” section must be rewritten to explain that users can export the three env vars (with an example command snippet) instead of editing Python files. Also extend the “Configuration” section that currently lists `NODE_TIMEOUT_SECONDS` so that the new variables are documented in one place.

## Validation

Run a lightweight sanity check by executing the module in dry-run mode: start a Python REPL, import `agent.agent`, and confirm that `HOME_LOCATION` values match the overrides when `HOME_CITY`, `HOME_LAT`, and `HOME_LON` are set in the environment before import. Document this manual verification in the PR description since the agent package lacks automated tests.

## Progress

- [x] Env-driven `HOME_LOCATION` helper implemented in `agent/agent.py`
- [x] README setup and configuration sections updated to describe the env vars
- [x] Manual verification performed (e.g., `HOME_LAT=40.71 python -c 'import agent.agent; print(agent.agent.HOME_LOCATION)'`)

## Change Log

- 2025-11-09 – Plan created to guide the agent home-location environment variable work.
- 2025-11-09 – Progress updated after implementing the helper, documentation, and manual verification.
