# Homelab Map – Contributor Notes

This document captures the conventions that show up repeatedly across the repo so future
changes feel cohesive.

## Quick Commands (CI Parity)
- Aggregator tests (matches CI’s `PYTHONPATH` setup):
  - From repo root:
    - `python -m pip install -r aggregator/requirements.txt`
    - `PYTHONPATH="$PWD" python -m pytest aggregator/tests -v`
- Frontend checks:
  - `cd frontend`
  - `npm install`
  - `npm run lint`
  - `npm run type-check`
  - `npm run build`
  - `npm test -- --watchAll=false`

## Repository-wide
- This project is split into three services (`agent/`, `aggregator/`, `frontend/`) plus helper
  scripts. Keep service-specific configuration in its folder and update the related
  documentation (`README.md`, `SETUP.md`, or the service-level Dockerfile) when behaviour
  changes.
- Use descriptive logging—each service already initialises a module-level logger. Prefer
  structured log messages over `print` statements.
- When a change affects an API contract or data shape, update every consumer: the agent’s
  payload builder (`agent/agent.py`), the aggregator’s Pydantic models (`aggregator/main.py`),
  and the frontend TypeScript interfaces (`frontend/src/types.ts`).
- Shell helpers in `scripts/` are `bash` scripts intended to be run from the repository root.
  Guard external commands (`docker`, `kubectl`, etc.) with clear error messages like the
  existing scripts.
- Docker image builds are orchestrated through the provided `Makefile` and `scripts/*.sh`
  helpers. Prefer extending those instead of introducing parallel workflows.

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
- Map UI lives in `src/components/` alongside a `.css` file per component. Continue the
  co-located styling approach, and scope new styles with descriptive class names rather than
  global element selectors.
- Network calls use `axios` with URLs derived from `REACT_APP_AGGREGATOR_URL`. Reuse the shared
  polling in `src/App.tsx` or pass data down via props—avoid adding new polling loops in
  deeply nested components.
- Respect the dark/light theme toggle by toggling the `dark-mode` / `light-mode` root classes.
  When adding UI, provide compatible styles for both themes.
- Map implementations:
  - Globe view: `frontend/src/components/ClusterMap.tsx` (`react-globe.gl`)
  - Flat view: `frontend/src/components/FlatMap.tsx` (`d3-geo` + SVG)
  - Deck overlay: `frontend/src/components/DeckGLMap.tsx` (`deck.gl`)
  Keep interactions stable across refreshes (don’t re-center/re-zoom on every poll tick) and
  prefer memoized callbacks/state updates so telemetry refreshes don’t re-trigger camera moves.

## Scripts (`scripts/`)
- Scripts are meant to be run from the repository root and start with `set -e`. Use emoji-rich
  status messages to match the existing tone, and ensure any long-running command prints enough
  context (what is being built/deployed) before executing.
