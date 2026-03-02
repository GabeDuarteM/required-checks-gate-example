# Required Checks Gate Example

An example of workflows using a gate to evaluate required checks, allowing features like auto-merge to work correctly with conditional workflows.
Check the [PRs](https://github.com/GabeDuarteM/merge-gate-example/pulls) to see it in action!

## Problem

GitHub's branch protection can require specific status checks to pass. However, when workflows or checks are conditionally skipped:

- If a workflow or check is **skipped** (due to path filters, branch filters, `if:` conditions, etc.), it may remain "pending" forever
- This blocks merging (and auto-merge) even when the skipped checks are irrelevant to the PR

## Solution

This repo demonstrates a **gate workflow** that:

1. Monitors when CI workflows complete
2. Evaluates whether each required workflow ran and passed
3. Sets a single `Required Checks` status that can be used as the required check
4. Treats workflows that didn't run (due to conditional execution) as "passed" (they're not relevant to this PR)

## Workflows

| Workflow | Triggers On |
|----------|-------------|
| Test Frontend | `app/**`, `public/**`, `package.json` |
| Test Backend | `backend/**` |
| Required Checks Gate | PR events + when above workflows complete |

## How It Works

```
PR opened (changes app/page.tsx only)
    │
    ├─► Test Frontend runs ──────► completes ──► triggers Required Checks Gate
    │                                                    │
    ├─► Test Backend SKIPPED (no backend changes)        │
    │                                                    ▼
    └─► Required Checks Gate sets "pending" ◄── Re-evaluates:
                                                 - Test Frontend: passed ✓
                                                 - Test Backend: didn't run ✓
                                                 - Sets status: SUCCESS
```

## Configuration

Edit `.github/required-checks-config.json` to define which workflows are required:

```json
{
  "required_workflows": [
    "Test Frontend",
    "Test Backend"
  ]
}
```

## Setup

1. Add `Required Checks` as a required status check in branch protection rules
2. PR authors can enable auto-merge on their PRs (optional)
3. The gate workflow evaluates checks and allows merge when appropriate

## Limitations

- The `workflow_run` trigger only works if the gate workflow file exists on the default branch (so the initial PR adding the gate workflow won't trigger it).
- Must merge the gate workflow to `main` first before it can respond to other workflow completions

## Change
