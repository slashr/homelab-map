# ExecPlan: Globe Rotation Constraints & Animated Arc Tooltips

## Goal
1. Restrict globe rotation to mostly horizontal (left-right) with minimal vertical tilting for better UX
2. Animate network connection lines (arcs) and add hover tooltips showing connection information

## Problem
- Globe currently allows free rotation in all directions, which can be disorienting
- Connection arcs are static (no animation) and don't show information on hover
- Users can't easily see connection details without selecting nodes

## Solution

### 1. Restrict Globe Rotation
- Access OrbitControls from react-globe.gl's controls()
- Set `minPolarAngle` and `maxPolarAngle` to constrain vertical rotation
- Allow slight tilting (e.g., 10-15 degrees from horizontal) but prevent full vertical rotation
- Keep horizontal rotation (azimuth) unrestricted

### 2. Animate Connection Arcs
- Enable arc animation by setting `arcDashAnimateTime` to a non-zero value (e.g., 2000ms)
- Keep `arcDashLength` and `arcDashGap` configured for visible animation
- Ensure animation works in both light and dark modes

### 3. Add Arc Hover Tooltips
- Use react-globe.gl's `onArcHover` callback to detect hover events
- Create a tooltip component that displays:
  - Source node → Target node
  - Latency in ms
  - Connection status/quality based on latency
- Position tooltip near the cursor or arc midpoint
- Style tooltip to match existing dark/light theme

## Changes
- `frontend/src/components/ClusterMap.tsx`:
  - Update controls setup to restrict polar angle (vertical rotation)
  - Enable arc animation via `arcDashAnimateTime`
  - Add `onArcHover` handler and tooltip state
  - Create tooltip component for arc information
- `frontend/src/components/ClusterMap.css`:
  - Add styles for arc tooltip (positioning, theming, animations)

## Validation
- Verify globe only rotates horizontally with minimal vertical tilting
- Confirm arcs animate smoothly
- Test hover tooltips appear on arc hover and show correct information
- Ensure tooltips work in both light and dark modes
- Test on different screen sizes
