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
