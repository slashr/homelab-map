# ExecPlan: UX Improvements & Globe Fixes

## Goal
1. Fix globe sizing to fill entire available space outside sidebar
2. Add close button to node info card
3. Add multiple ways to deselect nodes (close button, Escape key, click background)
4. Implement collapsible sidebar for mobile devices
5. Improve mobile responsiveness and text truncation

## Problems
1. Globe is not occupying full space - appears cropped
2. No way to close/deselect a node once selected
3. Sidebar takes too much space on mobile devices
4. Long node names can overflow on small screens

## Solution

### 1. Fix Globe Sizing
- Add ResizeObserver to track container size changes
- Pass explicit width/height to Globe component based on container dimensions
- Update CSS to ensure globe fills available space

### 2. Node Selection/Deselection
- Add close (×) button to node info card header
- Add Escape key handler to deselect nodes
- Allow clicking map background to deselect
- Prevent deselection when clicking on the info card itself

### 3. Mobile Sidebar
- Implement collapsible drawer pattern for mobile (≤768px)
- Add hamburger menu button in header (mobile only)
- Add overlay backdrop when sidebar is open
- Auto-close sidebar when selecting a node on mobile
- Sidebar always visible on desktop

### 4. Mobile Optimizations
- Reduce header padding on mobile
- Adjust title font size for small screens
- Use fixed positioning for node info card on mobile
- Add text truncation for long node names in sidebar
- Improve touch targets

## Changes
- `frontend/src/components/ClusterMap.tsx`: Add resize handling, close button, deselection handlers
- `frontend/src/components/ClusterMap.css`: Update sizing, add close button styles, mobile fixes
- `frontend/src/App.tsx`: Add sidebar state management, mobile toggle button
- `frontend/src/App.css`: Add sidebar overlay, mobile header styles
- `frontend/src/components/StatsPanel.tsx`: Add close button, mobile auto-close
- `frontend/src/components/StatsPanel.css`: Add mobile drawer styles, close button styles

## Validation
- Test locally with `npm start` and browser
- Verify globe fills entire area outside sidebar
- Test close button, Escape key, and background click deselection
- Test mobile sidebar toggle and auto-close
- Test in both light and dark modes
- Verify responsive behavior on different screen sizes
