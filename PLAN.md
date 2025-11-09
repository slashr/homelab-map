# ExecPlan: Sidebar Width + Dependency Security

## Goal
Restore the Stats panel/sidebar to its intended width (it currently collapses to a sliver) and eliminate the outstanding `npm audit` vulnerabilities by upgrading or overriding the affected packages. Ship both fixes together per the request.

## Steps
1. **Diagnose sidebar shrink**
   - Review `StatsPanel.css` and layout (`App.css`) to see why the flex item can collapse.
   - Adjust the sidebar styles (e.g., enforce `flex: 0 0 width`, add min-width) and verify media queries still behave.

2. **Address npm vulnerabilities**
   - Inspect `npm audit` output (mostly transitives from `react-scripts`).
   - Use `package.json` overrides (or targeted dependency bumps) to pull in patched versions (`@svgr/*`, `svgo`, `postcss`, `resolve-url-loader`, `webpack-dev-server`, etc.).
   - Run `npm install` to update the lockfile and confirm `npm audit` reports zero vulnerabilities.

3. **Validation**
   - `npm run build` to ensure CRA still compiles with the overrides.
   - Note any audit/build logs for the PR.

## Validation
- `cd frontend && npm install`
- `cd frontend && npm run build`
- `cd frontend && npm audit`

## AXP Review-Reply Guidance

### Goal
Ensure the Codex review guidance in `AGENTS.md` explicitly forbids consolidating replies—every thread must be answered in place—so future AXP runs never miss a review conversation.

### Steps
1. Re-read the Codex review paragraph in `AGENTS.md` to understand the current wording about replying inline.
2. Update that paragraph so it instructs: “Reply directly on each codex review thread; do not answer all of them in a single thread.”
3. Apply the same clarification inside the FAW checklist near the step about replying inline.
4. Review the entire file to confirm the new phrasing is clear and consistent, then save the updated guidance.

### Validation
- Confirm `AGENTS.md` now has the explicit per-thread reply instruction in both the general Codex review section and the FAW checklist.
