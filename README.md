# Auto-merge Gate Example

An example of workflows using gating to allow enabling automerge.

## Problem

GitHub's native auto-merge requires all required status checks to pass. However, when workflows or checks are conditionally skipped:

- If a workflow or check is **skipped** (due to path filters, branch filters, `if:` conditions, etc.), it may remain "pending" forever
- This blocks auto-merge even when the skipped checks are irrelevant to the PR

## Solution

This repo demonstrates a **gate workflow** that:

1. Monitors when CI workflows complete
2. Evaluates which checks actually ran vs. were skipped
3. Sets a single `auto-merge-gate` status that can be used as the required check
4. Treats skipped workflows/checks as "passed" (they're not relevant to this PR)

## Workflows

| Workflow | Triggers On | Checks |
|----------|-------------|--------|
| Test Frontend | `app/**`, `public/**`, `package.json` | Lint, TypeScript, Build, conditional tests |
| Test Backend | `backend/**` | Lint, Build, conditional tests |
| Auto-merge Gate | PR events + when above workflows complete | Evaluates all checks, sets gate status |

## How It Works

```
PR opened (changes app/page.tsx only)
    │
    ├─► Test Frontend runs ──────► completes ──► triggers Auto-merge Gate
    │                                                    │
    ├─► Test Backend SKIPPED (no backend changes)        │
    │                                                    ▼
    └─► Auto-merge Gate sets "pending" ◄─────── Re-evaluates:
                                                 - Frontend checks: passed ✓
                                                 - Backend workflow: skipped ✓
                                                 - Sets status: SUCCESS
```

## Configuration

Edit `.github/auto-merge-config.json` to define which checks are required per workflow:

```json
{
  "workflows": {
    "Test Frontend": {
      "required_checks": ["Lint", "TypeScript Check", "Build"]
    },
    "Test Backend": {
      "required_checks": ["Lint", "Build"]
    }
  }
}
```

## Setup

1. Add `auto-merge-gate` as a required status check in branch protection rules
2. PR authors can enable auto-merge on their PRs
3. The gate workflow evaluates checks and allows merge when appropriate

## Limitations

- The `workflow_run` trigger only works if the gate workflow file exists on the default branch (so the initial PR adding the gate workflow won't trigger it).
- Must merge the gate workflow to `main` first before it can respond to other workflow completions
