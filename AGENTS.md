# AXP - Autonomous Execution Protocol

When AXP is mentioned in the task, either by the user or in TASKS.md, you should work end‑to‑end without needing user input. At a high level the flow should be: pick task → plan → implement → PR → green checks → codex reviewer approval → merge → verify release → next task.

---

## Minimal Rules

1. **Don’t stop early.** Keep going until a **Stop Condition** (below) is met.
2. **Merge gate:** Only merge when **all required checks are green** **and** Codex has given a **👍** (review approval, approving comment, or 👍 on PR description).
3. **Act, don’t wait.** Use local CLIs (`git`, `gh`, `kubectl`, `aws`, `terraform`, `ansible-playbook`) and **poll** proactively; no user nudges.
4. **Finish the loop before switching tasks.** Do not start another task or PR until the current one has (a) passing checks, (b) Codex 👍, (c) been merged, and (d) its post-merge Release workflow (or equivalent automation) has completed successfully.
5. **Read workflow annotations immediately.** When a GitHub Actions run fails before any job starts (e.g., “workflow file issue”), open the run’s “Annotations” tab (or run `gh run view <run-id> --summary`) to grab the exact YAML/config error before making changes—those details exist even when no logs/jobs were produced.

---

## The Loop (simple checklist)

1. **Pick task:** Either perform the task user has requested, or pick one from TASKS.md. If picked from TASKS.md, mark it as IN PROGRESS
2. **Plan & branch:** Write a brief `PLAN.md`.
3. **Implement:** Commit small, logical changes.
4. **Open PR:**
   ```bash
   gh pr create --fill \
     --title "TASK-###: <short title> [AXP]" \
     --label axp
   ```
5. **Watch checks (poll ~30s):**

   ```bash
   gh pr checks --watch --interval 30
   ```

   * If a check fails, **fix → push → watch again**.
   If you pushed fixes after PR creation and after Codex reviewer had already given a thumbs up, then request a re-review from codex reviewer by commenting "@codex review again"
   
6. **Codex review:**
   Codex starts a review automatically on PR creation. You will see that it adds eyes emoji to the PR description when it is revewing. 
   The eyes emoji changes to a thumbs up emoji if review passes. If you see this then you are safe to merge. 

   Otherwise, codex reviewer leaves a review comment as a reply to one of it's main comments. 

   You should address this review and leave a reply to that comment inline (not as a independent comment) mentioning whether you accept the review and fixed it or whether you think the review doesn't need to be fixed and skipped it. Reply directly on each individual review thread—never consolidate answers on a single thread—so the resolution for every comment is tracked exactly where it originated. 

   If you pushed a fix for the review, then add "@codex review again" at the end of the reply to make codex reviewer review the fresh commits again. 
   
   Once the checks are green and Codex has given you the 👍, move the corresponding entry out of `TASKS.md` and into `COMPLETED.md` before merging. This bookkeeping push is exempt from the usual “rerun checks/re-request review” requirement—push it right before merging without waiting for another cycle, but do not include any other changes in that commit.
   
7. **Merge:**
   If PR checks are green and codex has given a approval and all review comments (if any) are addressed, it can be merged
   ```bash
   gh pr merge --merge --delete-branch
   ```
8. **Post‑merge release:**
   After merging the PR, watch the Release workflow until it passes. Capture the latest run ID and follow it with a relaxed interval to avoid busy-waiting:
   ```bash
   gh run list --workflow "Release" --limit 1 --json databaseId,status
   gh run watch <run-id> --interval 30 --exit-status
   ```

   * If it **fails**, open a minimal **Recovery PR** and repeat the loop. Try up to **3** times. If still failing, **escalate** (see Stop Conditions).
9. **Close the loop:** Ensure the finished task now lives in `COMPLETED.md` (and is removed from `TASKS.md`), then **pick the next AXP task**.

---

## Stop Conditions

* **No AXP TODO** tasks remain.
* **Blocking error:** cannot auth, missing permissions/secrets, CI/infra down > 60m, or recovery attempts exhausted (3 PRs).
* User explicitly says **stop AXP**.

If blocking: open an issue `AXP: Escalation — TASK-###` with a short summary and links, then stop.

---

## Optional Niceties

* Maintain a single‑line audit in `.axp/TRACE.md` (time, action, PR/run URL).
* Copy the task’s **Acceptance** checklist into the PR body and tick as you verify.

---

### Mapping to your basic flow

1. grab a task → 2) analyze/plan → 3) `gh pr create` → 4) watch checks → 5) watch Codex → 6) merge → 7) next task.

---
### Command Safety Rules

Never execute commands that can cause irreversible or destructive changes to systems, repositories, or infrastructure.
Before running any shell command, you should scan the command string and compare it against this banned/restricted list.

Banned Commands (Hard Stop)

If any of these exact commands or dangerous variants appear (even with flags or parameters), immediately abort execution and log an entry in .axp/TRACE.md.
| Category                 | Command / Pattern                                                                                                        | Reason                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| **System Destruction**   | `rm -rf /`, `sudo rm -rf /`, `rm -rf *`, `rm -rf .*`, `rm --no-preserve-root`                                            | Irrecoverable file deletion                         |
| **Privilege Escalation** | `sudo` (unless in a safe script explicitly whitelisted)                                                                  | Prevent privilege escalation                        |
| **Terraform**            | `terraform destroy`, `terraform apply -target=*`, `terraform apply -replace=*`                                           | Avoid unintended deletions or partial applies       |
| **Kubernetes**           | `kubectl delete namespace`, `kubectl delete node`, `kubectl delete pvc --all`, `kubectl delete --force --grace-period=0` | Cluster/data destruction risk                       |
| **AWS / Cloud**          | `aws iam delete-*`, `aws ec2 terminate-instances --all`, `aws s3 rm --recursive s3://*`                                  | Cloud resource deletion risk                        |
| **Git / Repo**           | `git rebase -i origin/main`, `git reset --hard origin/main`                                          | Avoid losing commit history or overwriting branches |
| **Shell / System**       | `shutdown`, `reboot`, `halt`, `kill -9 1`                                                                                | System stability risk                               |

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
12. After implementing any Codex feedback, reply inline via the original review thread (use the Reply action) so the action taken stays attached to the comment rather than creating a separate message—respond to every review comment in its own thread instead of collecting answers in one place.
13. When replying in-thread, append “@codex review again” so Codex re-checks the up-to-date commits before giving the 👍.

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
