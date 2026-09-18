const PATTERNS: { id: string; re: RegExp }[] = [
  { id: "aws_akia", re: /AKIA[0-9A-Z]{16}/g },
  {
    id: "private_key",
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  { id: "github_pat", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { id: "github_finegrained", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { id: "slack", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: "discord", re: /\b[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{26,}\b/g },
  { id: "typesafe_env", re: /\bTYPESAFE_API_KEY\s*[=:]\s*\S+/g },
];

export const DEFAULT_SECRET_REGEXES = [
  "AKIA[0-9A-Z]{16}",
  "-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----",
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const { re } of PATTERNS) {
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}

export function findSecretHits(
  path: string,
  text: string,
  regexes: readonly string[],
): { path: string; pattern_id: string }[] {
  const hits: { path: string; pattern_id: string }[] = [];
  for (const source of regexes) {
    let re: RegExp;
    try {
      re = new RegExp(source, "g");
    } catch {
      continue;
    }
    if (re.test(text)) {
      hits.push({ path, pattern_id: source });
    }
  }
  return hits;
}
