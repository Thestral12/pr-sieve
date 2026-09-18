import { anyPathMatches, everyPathMatches } from "./glob.js";
import type { Dossier, Rule, Skipped } from "./types.js";
import { MAX_JEV_QUESTIONS } from "./types.js";

export type Planned = {
  send: Rule[];
  skipped: Skipped[];
  considered: Rule[];
};

/** JS has no `(?i)` inline flag; the handoff example uses `(?i)refactor`. */
export function compileTitleRe(source: string): RegExp {
  let flags = "";
  let body = source;
  const inline = /^\(\?([gimsuy]+)\)/;
  const m = body.match(inline);
  if (m) {
    flags += m[1] ?? "";
    body = body.slice(m[0].length);
  }
  return new RegExp(body, flags);
}

export function planQuestions(rules: readonly Rule[], dossier: Dossier): Planned {
  const changed = dossier.files.map((f) => f.path);
  const skipped: Skipped[] = [];
  const considered: Rule[] = [];
  const eligible: Rule[] = [];

  for (const rule of rules) {
    if (rule.on === "ignore") continue;
    considered.push(rule);

    if (rule.title_matches) {
      let re: RegExp;
      try {
        re = compileTitleRe(rule.title_matches);
      } catch {
        skipped.push({ id: rule.id, reason: "title" });
        continue;
      }
      if (!re.test(dossier.title)) {
        skipped.push({ id: rule.id, reason: "title" });
        continue;
      }
    }

    if (rule.paths && rule.paths.length > 0 && !anyPathMatches(changed, rule.paths)) {
      skipped.push({ id: rule.id, reason: "paths" });
      continue;
    }

    if (rule.not_paths && rule.not_paths.length > 0 && everyPathMatches(changed, rule.not_paths)) {
      skipped.push({ id: rule.id, reason: "not_paths" });
      continue;
    }

    eligible.push(rule);
  }

  const send = eligible.slice(0, MAX_JEV_QUESTIONS);
  for (const extra of eligible.slice(MAX_JEV_QUESTIONS)) {
    skipped.push({ id: extra.id, reason: "cap" });
  }

  return { send, skipped, considered };
}
