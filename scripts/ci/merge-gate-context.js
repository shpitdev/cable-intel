/** Resolve only the current PR head; deployments carry their SHA at the event root. */
export async function resolveMergeGateContext(context, github) {
  const pullRequest = context.payload.pull_request;
  if (pullRequest) {
    return { pullRequest, headSha: pullRequest.head.sha };
  }

  const headSha = context.payload.deployment?.sha;
  if (!headSha) {
    throw new Error("Deployment event is missing its commit SHA.");
  }
  const { data: associated } =
    await github.rest.repos.listPullRequestsAssociatedWithCommit({
      ...context.repo,
      commit_sha: headSha,
    });
  const currentPullRequest = associated.find(
    (candidate) => candidate.state === "open" && candidate.head.sha === headSha
  );
  return currentPullRequest
    ? { pullRequest: currentPullRequest, headSha }
    : null;
}
