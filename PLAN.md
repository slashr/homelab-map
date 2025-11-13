# ExecPlan: Fix Globe Squishing Issue

## Goal
Fix the 3D globe visualization so it maintains a proper 1:1 aspect ratio and doesn't appear squished when the container has non-square dimensions.

## Problem
The globe canvas was using independent width and height constraints (`min(900px, 100%)` for both), which caused the globe to be squished when the container had a non-square aspect ratio.

## Solution
Update the CSS to:
1. Set width to `min(900px, 100%)`
2. Use `aspect-ratio: 1 / 1` to enforce a square shape
3. Add `max-height: 100%` to prevent overflow
4. Remove explicit height constraint to let aspect-ratio control it

## Changes
- `frontend/src/components/ClusterMap.css`: Update `.cluster-map canvas` styles to maintain aspect ratio

## Validation
- Verify the globe appears as a proper sphere (not squished) in the browser
- Test in both light and dark modes
- Ensure the globe scales properly when resizing the window
