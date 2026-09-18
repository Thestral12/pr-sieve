import type { getOctokit } from "@actions/github";
import { CHECK_NAME, type CheckConclusion } from "../types.js";

type Octokit = ReturnType<typeof getOctokit>;

export async function upsertCheckRun(opts: {
  octokit: Octokit;
  owner: string;
  repo: string;
  headSha: string;
  conclusion: CheckConclusion;
  summary: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await opts.octokit.rest.checks.create({
      owner: opts.owner,
      repo: opts.repo,
      name: CHECK_NAME,
      head_sha: opts.headSha,
      status: "completed",
      conclusion: opts.conclusion,
      output: {
        title: CHECK_NAME,
        summary: opts.summary,
        text: opts.text.slice(0, 65535),
      },
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
