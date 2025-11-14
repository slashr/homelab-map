# ExecPlan: Fix Info Card Sizing for Globe vs Flat Map

## Problem Analysis

After browser inspection, I found:
- **Globe view**: Info card is 160px wide, covering too much of the 3D globe (parent: 1479px wide)
- **Flat map view**: Info card is also 160px wide, but user reports it's too small
- **Root cause**: Both views share the same CSS class `.node-info-card` with `width: clamp(140px, 10vw, 160px)`

## Solution

Create separate styles for each view:
1. **Globe view**: Smaller card - `clamp(100px, 8vw, 120px)` to reduce obstruction
2. **Flat map view**: Larger card - `clamp(180px, 15vw, 240px)` for better readability

## Implementation

1. Add modifier classes to differentiate views:
   - Globe: `node-info-card--globe`
   - Flat: `node-info-card--flat`

2. Update CSS with view-specific sizing:
   - `.node-info-card--globe`: Smaller width, adjusted font sizes
   - `.node-info-card--flat`: Larger width, more comfortable reading

3. Update component JSX to include modifier classes

## Changes
- `frontend/src/components/ClusterMap.tsx`: Add `node-info-card--globe` class
- `frontend/src/components/FlatMap.tsx`: Add `node-info-card--flat` class  
- `frontend/src/components/ClusterMap.css`: Add `.node-info-card--globe` styles with smaller sizing
- `frontend/src/components/FlatMap.css`: Add `.node-info-card--flat` styles with larger sizing

## Validation
- Test in browser: Globe view card should be smaller (~120px max)
- Test in browser: Flat map card should be larger (~240px max)
- Verify content is readable in both views
- Test in both light and dark modes
