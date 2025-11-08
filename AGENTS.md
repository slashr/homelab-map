# Homelab Map – Contributor Notes

This document captures the conventions that show up repeatedly across the repo so future
changes feel cohesive.

## Repository-wide
- This project is split into three services (`agent/`, `aggregator/`, `frontend/`) plus helper
  scripts. Keep service-specific configuration in its folder and update the related
  documentation (`README.md`, `SETUP.md`, or the service-level Dockerfile) when behaviour
  changes.
- Use descriptive logging—each service already initialises a module-level logger. Prefer
  structured log messages over `print` statements.
- When a change affects an API contract or data shape, update every consumer: the agent’s
  payload builder, the aggregator’s Pydantic models, and the frontend TypeScript interfaces.
- Shell helpers in `scripts/` assume GNU utilities. Keep them POSIX-friendly and guard
  external commands with clear error messages like the existing build script.
- Docker image builds are orchestrated through the provided `Makefile` and `scripts/*.sh`
  helpers. Prefer extending those instead of introducing parallel workflows.

## Fully Automated Workflow (FAW)
These steps apply only when a task explicitly calls out the “FAW” (Fully Automated Workflow). For any other work, continue to follow the standard flow you already know:
1. Pick up a task, implement the change locally, and open a PR for review.
2. Ensure every required check on the PR completes successfully; if a check fails, push fixes until it passes.
3. Wait for the automated Codex reviewer to approve by either leaving a 👍 comment/review or reacting with 👍 on the PR description.
4. If Codex leaves review feedback instead of a 👍, address the comments and push the fixes.
5. Tag `@codex` for re-review whenever you push new commits after the initial PR, whether to fix checks or respond to Codex feedback.
6. Repeat the fix → re-review loop until Codex responds with a 👍 (comment, review, or description reaction) or an explicit all-clear.
7. Merge only after Codex has approved with a 👍 and all required checks are green.
8. After merging, watch the follow-up automation (e.g., the Release workflow) until it finishes and respond to any failures.
9. If a post-merge run fails, immediately investigate the error and open a new PR that fixes it. You may trigger this recovery flow up to three times (three consecutive merged PRs followed by failing automation runs). After the third failure, stop retrying and escalate instead of opening more PRs under FAW.
10. Once the post-merge automation succeeds, pick the next pending item from `TASKS.md` (if present) and start work on it while keeping the FAW rules in mind.
11. Before asking for the thumbs-up or merging, explicitly read Codex’s latest review/comments to make sure any suggestions are captured–don’t rely solely on reactions.

## Python services (`agent/`, `aggregator/`)
- Follow the existing module layout: top-level docstring, imports grouped stdlib → third-party,
  module-level constants, then functions. Keep 4-space indentation and include type hints on
  public interfaces.
- Both services rely on FastAPI/Pydantic models. When adding new request/response fields,
  declare them on the relevant `BaseModel` subclass and ensure defaults mirror the inbound
  agent data.
- The aggregator stores state in the in-memory `nodes_data` / `connections_data` dicts.
  Normalise data before storage and keep all timestamps in UTC seconds since epoch. Any
  derived fields (e.g. human readable `last_seen`) should be calculated on read, not write.
- The agent collects metrics with `psutil`, `subprocess`, and the Kubernetes Python client.
  Keep network and subprocess calls bounded with timeouts (see `requests.post(..., timeout=10)`
  and `subprocess.run(..., timeout=10)` for the prevailing pattern).
- If you add providers or home locations, update `CLOUD_LOCATIONS` / `NODE_LOCATIONS` so the
  map annotations remain consistent.
- Remember to sync dependencies in `requirements.txt` when introducing new imports.

## Frontend (`frontend/`)
- The React app is written in TypeScript with functional components and hooks. New data types
  belong in `src/types.ts`, and components should receive typed props instead of using `any`.
- Map-related UI lives in `src/components/` alongside a `.css` file per component. Continue the
  co-located styling approach, and scope new styles with descriptive class names rather than
  global element selectors.
- Network calls use `axios` with URLs derived from `REACT_APP_AGGREGATOR_URL`. Reuse the shared
  polling helper in `App.tsx` or pass data down via props—avoid duplicating fetch logic inside
  deeply nested components.
- Respect the dark/light theme toggle by toggling the `dark-mode` / `light-mode` root classes.
  When adding UI, provide compatible styles for both themes.
- Leaflet markers rely on custom HTML markers and clustered layers. When adding map features,
  ensure they play nicely with `MarkerClusterGroup` and avoid forcing the map to re-fit bounds
  on every refresh (see the `FitBounds` hook for the established pattern).

## Scripts (`scripts/`)
- Scripts are meant to be run from the repository root and start with `set -e`. Use emoji-rich
  status messages to match the existing tone, and ensure any long-running command prints enough
  context (what is being built/deployed) before executing.
