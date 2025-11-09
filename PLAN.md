# ExecPlan: Accelerate CI Builds with Caching & Smart Service Selection

## Goal
Release workflow wastes time rebuilding every service image even when a PR only touches one folder. We will teach CI to (a) detect which services changed and skip untouched builds, and (b) reuse BuildKit cache across runs so repeated builds stay fast. Success means the Release workflow conditionally builds agent/aggregator/frontend images and imports/exports a shared cache so later runs hit warm layers.

## Steps
1. **Baseline & detection design** – Audit `.github/workflows` (especially `build-and-publish.yml` and `release.yml`) plus helper scripts to understand current build commands, image tags, and available inputs. Decide whether to use matrix jobs or a helper script for change detection.
2. **Implement change filters** – Use `dorny/paths-filter` inside `release.yml` to compare the merged commit to its base and emit booleans for `agent`, `aggregator`, and `frontend`. Convert those booleans into a JSON list that downstream jobs can pass to the reusable build workflow so untouched services are skipped automatically.
3. **Add BuildKit cache plumbing** – Enable BuildKit (`DOCKER_BUILDKIT=1`) and use `docker buildx build` (or `docker/build-push-action`) with `cache-from`/`cache-to` pointing at the GitHub Actions cache or GHCR. Ensure cache keys incorporate the service name so layers do not collide.
4. **Docs & verification** – Document the new behavior in `README.md` (or `SETUP.md`) under the CI/deployment section so contributors know why builds may be skipped. Run `act`/dry-run locally if feasible; otherwise rely on `gh workflow run --dry-run` or shell logic linting.

## Validation
- `act` or shell unit tests for the change-detection helper (if script is Python/Node) to confirm the correct services flag flips for varied paths.
- `shellcheck`/`yamllint` on modified scripts (if applicable).
- After pushing, rely on the Release workflow itself to confirm only the touched services build; capture logs in the PR description.

## Progress
- [x] Service detection wired into the Release workflow via `dorny/paths-filter`
- [x] Build jobs respect the filtered service list
- [x] BuildKit cache configured for every Docker build step
- [x] Docs updated to explain skip logic and caching
