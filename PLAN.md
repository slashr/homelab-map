# ExecPlan: Document Annotation Debugging in AXP

## Goal
Add explicit guidance to `AGENTS.md` so AXP practitioners know to consult GitHub Actions annotations whenever workflows fail before any jobs start.

## Steps
1. Update the "Minimal Rules" list with a note about checking the run’s Annotation panel (or `gh run view --summary`) when a workflow is flagged as a configuration error.
2. Add an `actionlint` job to `.github/workflows/ci.yml` so workflow syntax issues are caught in PR CI.
3. Push the branch, open a PR, and run CI. Wait for Codex approval + checks; release will naturally skip because only docs changed.

## Validation
- Rely on CI: new `actionlint` job + existing tests must pass.
