import * as core from "@actions/core";
import * as github from "@actions/github";
import { renderComment, statusLine } from "./comment.js";
import { dossierFromGit } from "./dossier.js";
import { upsertCheckRun } from "./github/checks.js";
import { upsertStickyComment } from "./github/comment.js";
import { isMockMode } from "./jev/client.js";
import { loadPolicy } from "./policy/load.js";
import { runPipeline, shouldPostComment } from "./pipeline.js";
import type { CommentMode, FailOn } from "./types.js";

function asFailOn(v: string): FailOn {
  if (v === "never" || v === "any-finding" || v === "gate") return v;
  return "gate";
}

function asComment(v: string): CommentMode {
  if (v === "always" || v === "never" || v === "sticky") return v;
  return "sticky";
}

function isForkPullRequest(): boolean {
  const pr = github.context.payload.pull_request;
  if (!pr) return false;
  const head = pr.head?.repo?.full_name as string | undefined;
  const base = pr.base?.repo?.full_name as string | undefined;
  return Boolean(head && base && head !== base);
}

async function run(): Promise<void> {
  const apiKey = core.getInput("typesafe-api-key") || process.env.TYPESAFE_API_KEY || "";
  const config = core.getInput("config") || ".jev.yml";
  const failOn = asFailOn(core.getInput("fail-on") || "gate");
  const commentMode = asComment(core.getInput("comment") || "sticky");
  const model = core.getInput("model") || "jev-latest";
  const token = core.getInput("github-token") || process.env.GITHUB_TOKEN || "";
  const cwd = process.cwd();
  const pr = github.context.payload.pull_request;
  const fork = isForkPullRequest();
  const mock = isMockMode();

  if (!apiKey && !mock) {
    if (fork) {
      const status = statusLine({ kind: "fork-skip", fails: false, findingsFailCount: 0 });
      const body = renderComment({ status, model: "—", truncated: false });
      core.info(status);
      if (token && pr) {
        const octokit = github.getOctokit(token);
        const check = await upsertCheckRun({
          octokit,
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          headSha: pr.head.sha,
          conclusion: "neutral",
          summary: status,
          text: body,
        });
        if (!check.ok) core.info(`check run skipped: ${check.error}`);
      }
      return;
    }
    core.setFailed("TYPESAFE_API_KEY is missing on a same-repo PR (workflow misconfigured).");
    return;
  }

  const baseSha: string = pr?.base?.sha ?? "";
  const headSha: string = pr?.head?.sha ?? github.context.sha;
  const loaded = loadPolicy({ cwd, configPath: config, baseSha: baseSha || undefined });
  if (!loaded.ok) {
    const status = statusLine({
      kind: "config-error",
      fails: true,
      findingsFailCount: 0,
      error: loaded.message,
    });
    const body = renderComment({ status, truncated: false });
    if (token && pr) {
      const octokit = github.getOctokit(token);
      await upsertCheckRun({
        octokit,
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        headSha,
        conclusion: "failure",
        summary: status,
        text: body,
      });
      if (commentMode !== "never") {
        await upsertStickyComment({
          octokit,
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          issueNumber: pr.number,
          body,
        });
      }
    }
    core.setFailed(loaded.message);
    return;
  }

  const dossier = dossierFromGit({
    cwd,
    base: baseSha || "HEAD^",
    head: headSha || "HEAD",
    policy: loaded.policy,
    title: pr?.title ?? github.context.payload.commits?.[0]?.message ?? "",
    body: pr?.body ?? "",
    author_association: pr?.author_association ?? "NONE",
  });

  const result = await runPipeline({
    policy: loaded.policy,
    dossier,
    failOn,
    comment: commentMode,
    apiKey: apiKey || undefined,
    model,
    mock,
  });

  if (result.dossierPath) core.info(`dossier written to ${result.dossierPath}`);
  core.info(result.statusLine);

  if (token && pr) {
    const octokit = github.getOctokit(token);
    const check = await upsertCheckRun({
      octokit,
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      headSha,
      conclusion: result.conclusion,
      summary: result.statusLine,
      text: result.commentBody,
    });
    if (!check.ok) core.info(`check run skipped: ${check.error}`);
    if (shouldPostComment(commentMode, result)) {
      try {
        await upsertStickyComment({
          octokit,
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          issueNumber: pr.number,
          body: result.commentBody,
        });
      } catch (err) {
        core.info(`comment skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  core.setOutput("conclusion", result.conclusion);
  core.setOutput("status", result.statusLine);

  if (result.kind === "degraded" || result.kind === "fork-skip") return;
  if (result.conclusion === "failure" || result.kind === "setup-error") {
    core.setFailed(result.statusLine);
  }
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
