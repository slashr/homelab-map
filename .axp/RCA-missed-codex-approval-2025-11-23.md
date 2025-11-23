# RCA: Missed Codex Approval - November 23, 2025

## Problem
Codex approval was missed on PR #68, causing delay in merging. The approval was present but not detected by the monitoring script.

## Root Cause Analysis

### What Happened
- PR #68 was created and all checks passed
- Codex bot (`chatgpt-codex-connector[bot]`) added a 👍 reaction at `2025-11-23T13:37:28Z`
- Monitoring script was checking PR body text for emojis using `contains("👍")`
- Reactions are stored separately from PR body text in GitHub's API
- Script never detected the approval because it was looking in the wrong place

### Technical Details
- **Incorrect check**: `gh pr view 68 --json body --jq '.body | contains("👍")'`
- **Correct check**: `gh api repos/slashr/homelab-map/issues/68/reactions --jq '[.[] | select(.user.login == "chatgpt-codex-connector[bot]") | select(.content == "+1")] | length'`
- **Reaction format**: GitHub stores reactions separately via `/issues/{issue_number}/reactions` endpoint
- **Reaction content**: `"+1"` (not the emoji character `👍`)

### Why It Happened
1. AXP instructions in `AGENTS.md` said to check PR body for emojis
2. Instructions were ambiguous about where the thumbs up appears
3. No explicit guidance to use reactions API endpoint
4. Assumed emojis would be in body text, not as separate reactions

## Solution
Updated `AGENTS.md` section 6 (Codex review) to:
1. Explicitly state that Codex approval is a **reaction**, not body text
2. Provide correct API command to check reactions
3. Add warning about NOT checking body text for emojis
4. Include example commands for checking approval

## Prevention
- Always use reactions API: `gh api repos/$OWNER/$REPO/issues/$PR/reactions`
- Filter for `chatgpt-codex-connector[bot]` user
- Check for `content: "+1"` (thumbs up reaction)
- Never check PR body text for approval emojis

## Impact
- PR #68 was merged successfully after manual detection
- No functional impact, only timing delay
- AXP instructions now updated to prevent recurrence

