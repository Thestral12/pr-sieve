import type { getOctokit } from "@actions/github";
import { COMMENT_MARKER } from "../types.js";

type Octokit = ReturnType<typeof getOctokit>;

export async function upsertStickyComment(opts: {
  octokit: Octokit;
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}): Promise<void> {
  const { octokit, owner, repo, issueNumber, body } = opts;
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });
  const existing = comments.find((c) => (c.body ?? "").includes(COMMENT_MARKER));
  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    return;
  }
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
}
