# ExecPlan: Document Annotation Debugging in AXP

## Goal
Add explicit guidance to `AGENTS.md` so AXP practitioners know to consult GitHub Actions annotations whenever workflows fail before any jobs start.

## Steps
1. Update the "Minimal Rules" list with a note about checking the run’s Annotation panel (or `gh run view --summary`) when a workflow is flagged as a configuration error.
2. Push the branch, open a PR, and run CI (doc-only so just lint). Wait for Codex approval + checks; release will naturally skip because only docs changed.

## Validation
- `npm`/`pytest` not needed. The change is documentation-only; rely on CI.
