# ExecPlan: Configurable Aggregator Node Timeout

## Purpose and Outcome

Operators need to tweak how long the aggregator waits before marking nodes offline so that slow-reporting clusters are not flapping between warning and offline. This plan teaches someone new to the repo how to make the node timeout configurable through an environment variable while preserving the current 120-second default. After following the plan, the aggregator will respect the requested timeout in both `/api/nodes` and `/api/stats`, tests will prove the behavior for default and custom values, and the README will document the new configuration knob so others can discover it.

## System Background

The FastAPI aggregator in `aggregator/main.py` maintains in-memory dictionaries `nodes_data` and `connections_data` that power the `/api/nodes`, `/api/nodes/{name}`, `/api/connections`, and `/api/stats` endpoints. At module import it defines `NODE_TIMEOUT = 120` and compares elapsed seconds against that constant to assign statuses in `get_all_nodes` and to decide whether a node counts as online inside `get_cluster_stats`. Tests live in `aggregator/tests/test_main.py` and already use `pytest` fixtures plus `monkeypatch` to simulate timestamps. Documentation for operator actions lives in the repository-level `README.md`.

## Implementation Plan

Introduce a helper near the existing constant that reads an environment variable named `NODE_TIMEOUT_SECONDS`. The helper must accept only positive integers, fall back to the 120-second default for missing or invalid values, and log a warning when falling back so operators see misconfigurations in the aggregator logs. Expose three module-level constants: the env var name, the default seconds, and the resolved `NODE_TIMEOUT`. Reference `NODE_TIMEOUT` everywhere it already appears. The helper will be unit-tested directly to cover both default and overridden behavior without reloading the module.

Update `aggregator/tests/test_main.py` with a new test that verifies `_load_node_timeout` returns the default when the environment is unset and a custom value when `monkeypatch` has supplied an override. Use `monkeypatch.setenv` and `monkeypatch.delenv` to avoid leaking environment changes between tests. Keep the existing asynchronous tests unchanged other than any needed imports.

Document the new environment variable in `README.md` where the aggregator setup instructions describe configuration so operators see it during deployment. Mention the default and give a short example showing how to export the variable before launching the service.

## Validation

Run the aggregator test suite from the repository root with

    cd aggregator
    pytest

to ensure the new helper tests pass alongside the existing async tests. Because the change only affects the Python service, no frontend or agent commands are needed. Optionally run `make test` if a repo-wide test harness exists; otherwise, `pytest` inside the aggregator suffices as proof.

## Progress

- [x] Helper and environment variable implemented in `aggregator/main.py`
- [x] Tests added for default and custom timeout behavior
- [x] README updated with `NODE_TIMEOUT_SECONDS` documentation
- [x] Local pytest run succeeds

## Change Log

- 2025-11-09 – Initial plan drafted for making the aggregator timeout configurable so operators can tune warning/offline thresholds.
- 2025-11-09 – Progress section updated after implementing the helper, tests, documentation, and running the aggregator pytest suite.
