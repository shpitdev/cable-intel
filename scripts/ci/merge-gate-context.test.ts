import { expect, test } from "bun:test";
import { resolveMergeGateContext } from "./merge-gate-context";

const pr = { number: 42, state: "open", head: { sha: "current-head" } };
const repo = { owner: "owner", repo: "repo" };

function githubFor(pullRequests: (typeof pr)[]) {
  return {
    rest: {
      repos: {
        listPullRequestsAssociatedWithCommit: async () => ({
          data: pullRequests,
        }),
      },
    },
  };
}

test("uses the PR head for pull_request events", async () => {
  expect(
    await resolveMergeGateContext(
      { repo, payload: { pull_request: pr } },
      githubFor([])
    )
  ).toEqual({ pullRequest: pr, headSha: "current-head" });
});

test("deployment_status events must evaluate the deployed PR head", async () => {
  expect(
    await resolveMergeGateContext(
      {
        repo,
        payload: {
          deployment: { sha: "current-head" },
          deployment_status: { state: "success" },
        },
      },
      githubFor([pr])
    )
  ).toEqual({ pullRequest: pr, headSha: "current-head" });
});

test("an old deployment cannot evaluate a newer PR head", async () => {
  expect(
    await resolveMergeGateContext(
      { repo, payload: { deployment: { sha: "old-head" } } },
      githubFor([pr])
    )
  ).toBeNull();
});

test("a malformed deployment event fails instead of passing the gate", async () => {
  await expect(
    resolveMergeGateContext({ repo, payload: {} }, githubFor([]))
  ).rejects.toThrow("missing its commit SHA");
});
