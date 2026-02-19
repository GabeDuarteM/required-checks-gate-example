// @ts-check

/**
 * Evaluates required checks for a PR by checking workflow run conclusions.
 *
 * Rules:
 * - If a workflow RUNS and COMPLETES: its conclusion must be success/skipped/neutral
 * - If a workflow doesn't run at all (path filtering): treated as passed
 * - If a workflow is still in progress: status is pending
 * - If ANY required workflow FAILS: Required Checks status fails
 *
 * @param {object} params
 * @param {import('@octokit/rest').Octokit} params.github
 * @param {import('@actions/github').context} params.context
 * @param {typeof import('node:fs')} params.fs
 */
module.exports = async ({ github, context, fs }) => {
  // Determine PR context
  let prNumber, headSha;
  if (context.eventName === 'pull_request') {
    const pr = context.payload.pull_request;
    if (!pr) throw new Error('pull_request payload is missing');
    prNumber = pr.number;
    headSha = pr.head.sha;
  } else {
    // workflow_run event
    const prs = context.payload.workflow_run.pull_requests;
    if (!prs || prs.length === 0) {
      console.log('No PR associated with this workflow run, skipping');
      return;
    }
    prNumber = prs[0].number;
    headSha = context.payload.workflow_run.head_sha;
  }

  console.log(`Evaluating PR #${prNumber}, commit ${headSha}`);

  // Load config
  const configPath = '.github/required-checks-config.json';
  /** @type {string[]} */
  let requiredWorkflows;
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    requiredWorkflows = JSON.parse(configContent).required_workflows;
  } catch (error) {
    throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
  }

  // Get all workflow runs for this commit (with pagination)
  /** @type {Array<{name?: string | null, status: string | null, conclusion: string | null, created_at: string}>} */
  let allWorkflowRuns = [];
  try {
    for await (const response of github.paginate.iterator(
      github.rest.actions.listWorkflowRunsForRepo,
      {
        owner: context.repo.owner,
        repo: context.repo.repo,
        head_sha: headSha,
        per_page: 100
      }
    )) {
      allWorkflowRuns.push(...response.data);
    }
  } catch (error) {
    throw new Error(`Failed to fetch workflow runs: ${error.message}`);
  }

  // Group workflow runs by name
  /** @type {Record<string, typeof allWorkflowRuns>} */
  const workflowRunsByName = {};
  for (const wr of allWorkflowRuns) {
    const name = wr.name ?? '';
    (workflowRunsByName[name] = workflowRunsByName[name] || []).push(wr);
  }

  console.log('Workflow runs found:', Object.entries(workflowRunsByName).map(
    ([name, runs]) => `${name}: ${runs.map(r => `${r.status}/${r.conclusion}`).join(', ')}`
  ));

  // Evaluate each required workflow
  let hasInProgress = false;
  const failedWorkflows = [];
  const passedWorkflows = [];
  const skippedWorkflows = [];

  for (const workflowName of requiredWorkflows) {
    const runs = workflowRunsByName[workflowName];

    if (!runs || runs.length === 0) {
      console.log(`Workflow "${workflowName}" did not run (path filtering), treating as passed`);
      skippedWorkflows.push(workflowName);
      continue;
    }

    // If any run is still in progress, we need to wait
    if (runs.some(wr => wr.status !== 'completed')) {
      console.log(`Workflow "${workflowName}" is still in progress`);
      hasInProgress = true;
      continue;
    }

    // All runs completed — check the most recent one's conclusion
    const latest = runs.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

    if (latest.conclusion === 'success' || latest.conclusion === 'skipped' || latest.conclusion === 'neutral') {
      console.log(`Workflow "${workflowName}" passed (${latest.conclusion})`);
      passedWorkflows.push(workflowName);
    } else {
      console.log(`Workflow "${workflowName}" failed (${latest.conclusion})`);
      failedWorkflows.push(workflowName);
    }
  }

  // Determine final status
  /** @type {"error" | "pending" | "success" | "failure"} */
  let state;
  let description;
  if (failedWorkflows.length > 0) {
    state = 'failure';
    description = `Failed: ${failedWorkflows.join(', ')}`;
  } else if (hasInProgress) {
    state = 'pending';
    description = 'Waiting for workflows to complete';
  } else {
    state = 'success';
    const summary = [];
    if (passedWorkflows.length > 0) summary.push(`${passedWorkflows.length} passed`);
    if (skippedWorkflows.length > 0) summary.push(`${skippedWorkflows.length} skipped`);
    description = summary.length > 0 ? summary.join(', ') : 'All checks passed';
  }

  console.log(`Setting status: ${state} - ${description}`);

  try {
    await github.rest.repos.createCommitStatus({
      owner: context.repo.owner,
      repo: context.repo.repo,
      sha: headSha,
      state: state,
      target_url: `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
      description: description.substring(0, 140),
      context: 'Required Checks'
    });
  } catch (error) {
    throw new Error(`Failed to set commit status: ${error.message}`);
  }
};
