export type GateOn = "fail" | "comment" | "ignore";
export type FailOn = "gate" | "never" | "any-finding";
export type CommentMode = "sticky" | "always" | "never";
export type RuleType = "noul" | "choice" | "score";
export type PolicySource = "base" | "head" | "default";
export type DecidedBy = "jev" | "rules";
export type SkipReason = "paths" | "title" | "not_paths" | "cap";
export type CheckConclusion = "success" | "failure" | "neutral";

export type Rule = {
  id: string;
  on: GateOn;
  threshold: number;
  ask: string;
  paths?: string[];
  not_paths?: string[];
  title_matches?: string;
  type: RuleType;
  options?: Record<string, string>;
  levels?: string[];
  include_lockfiles?: boolean;
  criteria?: { true?: string; false?: string };
};

export type PreflightConfig = {
  max_files: number;
  max_diff_chars: number;
  secret_regexes: string[];
  test_path_globs: string[];
  changelog_paths: string[];
};

export type Policy = {
  version: 1;
  ignore_paths: string[];
  preflight: PreflightConfig;
  rules: Rule[];
};

export type LoadedPolicy = Policy & {
  source: PolicySource;
  sha?: string;
  path: string;
  warnings: string[];
};

export type SecretHit = { path: string; pattern_id: string };

export type DossierFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  binary?: boolean;
  lockfile?: boolean;
};

export type Dossier = {
  surface: "pr";
  title: string;
  body: string;
  author_association: string;
  files: DossierFile[];
  path_tags: string[];
  preflight: {
    secret_regex_hits: SecretHit[];
    has_test_file_change: boolean;
    has_changelog_change: boolean;
    file_count: number;
    truncated: boolean;
  };
  diff: string;
};

export type NoulAnswer = { type: "noul"; noul: number };
export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
};
export type ScoreAnswer = { type: "score"; score: number; confidence: number };
export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;
export type Answers = Record<string, Answer>;

export type Finding = {
  id: string;
  value: number;
  on: "fail" | "comment";
  decided_by: DecidedBy;
  reason: string;
  choice?: string;
  confidence?: number;
};

export type Skipped = { id: string; reason: SkipReason };

export type TableRow = {
  id: string;
  answer: string;
  gate: string;
  action: "fail" | "comment" | "—";
};

export type EngineResult = {
  findings: Finding[];
  skipped: Skipped[];
  rows: TableRow[];
  fails: boolean;
};

export type SieveKind =
  | "ok"
  | "degraded"
  | "fork-skip"
  | "config-error"
  | "setup-error";

export type SieveResult = {
  kind: SieveKind;
  conclusion: CheckConclusion;
  statusLine: string;
  commentBody: string;
  engine?: EngineResult;
  policy?: LoadedPolicy;
  dossier?: Dossier;
  model?: string;
  ms?: number;
  truncated?: boolean;
  error?: string;
  dossierPath?: string;
};

export const MIXED_CONFIDENCE = 0.55;
export const MAX_JEV_QUESTIONS = 12;
export const COMMENT_MARKER = "<!-- pr-sieve -->";
export const CHECK_NAME = "pr-sieve";
export const BODY_LIMIT = 1000;
export const PER_FILE_HUNK = 1500;
export const TOTAL_DIFF_CHARS = 12000;
