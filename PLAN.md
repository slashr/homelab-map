# ExecPlan: Update AXP Task-Completion Flow

## Goal
Per new guidance, finished tasks should move from `TASKS.md` into `COMPLETED.md` instead of being labeled `[DONE]` inline. We’ll codify that in `AGENTS.md`, clean up the task lists, and preserve the historical entries in `COMPLETED.md`.

## Steps
1. **Document workflow change** – Edit `AGENTS.md` so step 9 (and any related text) instructs agents to physically move completed tasks to `COMPLETED.md` rather than tagging `[DONE]`.
2. **Restructure task tracking** – Remove the already-finished tasks from `TASKS.md`, leaving only active items (renumber/adjust section copy as needed) and append the removed entries to `COMPLETED.md` with their original problem/solution details.
3. **Polish & verify** – Double-check both files for clarity/formatting, ensure there’s no lingering `[DONE]` language, then commit and prep the PR.

## Validation
- Docs-only change; rely on CI (actionlint/tests) for structure.
