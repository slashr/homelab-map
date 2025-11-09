# ExecPlan: Release Workflow Change-Detection Fix

## Goal
The `Release` workflow fails immediately because `build-and-push` references `needs.changes` even though no `changes` job exists in the workflow. We need to add a lightweight `changes` job (using `dorny/paths-filter`) whose outputs can be consumed downstream, restoring a valid job graph so Release runs and post-merge automation succeed again.

## Steps
1. **Add dedicated `changes` job** – Create a top-level job that checks out the repo (with sufficient history) and runs `dorny/paths-filter` for `agent`, `aggregator`, and `frontend`. Normalize its outputs so manual dispatch still forces all services.
2. **Wire outputs into existing jobs** – Make `prepare-release` depend on `changes`, update the service-matrix step to read from `needs.changes` outputs, and ensure gating logic uses that data without referencing undefined steps.
3. **Verify + document** – Sanity check the YAML (lint via `yamllint`/`act` not required but run `gh workflow view`? we can rely on CI). Push branch, run CI, open PR, wait for Codex & release to confirm fix.

## Validation
- Rely on GitHub Actions: once the PR merges, the Release workflow on `main` must succeed (no “workflow file issue”). Observe that the job list now includes `changes`, `prepare-release`, etc.
- Optionally trigger a manual workflow_dispatch if permission allows; otherwise trust the push-trigger after merge.

## Progress
- [ ] `changes` job added and emits service flags
- [ ] `prepare-release` consumes outputs without invalid references
- [ ] Release run observed healthy post-merge
