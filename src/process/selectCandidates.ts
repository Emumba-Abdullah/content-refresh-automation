import { CandidateResource } from "../types/resource";

export type SelectionTier = "HIGH" | "MID" | "LOW";

export type ScoredCandidate = {
  candidate: CandidateResource;
  score: number;
  tier: SelectionTier;
  matchedPositive: string[];
  matchedNegative: string[];
  hardDrop: string | null;
};

export type SelectionResult = {
  high: ScoredCandidate[];
  mid: ScoredCandidate[];
  low: ScoredCandidate[];
};

// +2 signals — strong learning/building content
const HIGH_SIGNALS: string[] = [
  "tutorial",
  "quickstart",
  "quick start",
  "what is",
  "getting started",
  "build",
  "create",
  "develop",
  "ai",
  "vector",
  "embedding",
  "agent",
  "langchain",
  "pgvector",
  "semantic search",
  "genai",
  "generative",
  "intelligent",
  "openai",
  "llm",
  "rag",
  "sample",
  "example",
  "workshop",
  "lab",
];

// +1 signals — useful but less focused
const MID_SIGNALS: string[] = [
  "overview",
  "concepts",
  "concept",
  "extension",
  "integration",
  "connect",
  "use",
  "enable",
  "configure",
  "how to",
  "how-to",
  "guide",
  "setup",
  "deploy",
  "app service",
  "azure functions",
  "django",
  "flask",
  "spring",
  "node",
  "python",
  "java",
  "dotnet",
  ".net",
  "javascript",
  "sdk",
];

// Hard rejection — infra-only intent, no positive signal can rescue these
// These match on title OR description. Matched item is always LOW regardless of score.
const HARD_DROP_SIGNALS: string[] = [
  "firewall",
  "tls",
  " ssl ",
  "authentication method",
  "scale compute",
  "scale storage",
  "scale up",
  "scale down",
  "scale out",
  "scale in",
  "scaling compute",
  "scaling storage",
  "backup",
  "restore",
  "point-in-time",
  "geo-redundant",
  "geo redundant",
  "high availability",
  "failover",
  "read replica",
  "replica",
  "server parameter",
  "query store",
  "pgaudit",
  "audit log",
  "log analytics",
  "diagnostic setting",
  "monitoring",
  "alert rule",
  "iops",
  "storage auto-grow",
  "maintenance window",
  "private link",
  "private endpoint",
  "virtual network",
  "vnet integration",
  "subnet delegation",
  "public access",
  "disable public",
  "enable public",
];

// -3 signals — ops manuals, not learning content
const LOW_SIGNALS: string[] = [
  "backup",
  "restore",
  "firewall",
  "tls",
  "ssl",
  "scaling",
  "scale up",
  "scale down",
  "scale out",
  "scale in",
  "monitoring",
  "logging",
  "log ",
  "logs",
  "alert",
  "metric",
  "private link",
  "private endpoint",
  "vnet",
  "virtual network",
  "network",
  "subnet",
  "ip address",
  "dns",
  "certificate",
  "rotation",
  "password",
  "credential",
  "identity",
  "rbac",
  "role",
  "permission",
  "migrate ",
  "migration",
  "import",
  "export",
  "dump",
  "read replica",
  "replica",
  "geo-redundant",
  "geo redundant",
  "high availability",
  "failover",
  "maintenance window",
  "storage auto-grow",
  "iops",
  "compute tier",
  "compute size",
  "pricing tier",
  "quota",
  "limit",
  "constraint",
];

function scoreText(text: string): {
  score: number;
  matchedPositive: string[];
  matchedNegative: string[];
  hardDrop: string | null;
} {
  const lower = text.toLowerCase();
  const matchedPositive: string[] = [];
  const matchedNegative: string[] = [];
  let score = 0;

  // Hard drop check — infra-only intent, bail out immediately
  for (const signal of HARD_DROP_SIGNALS) {
    if (lower.includes(signal)) {
      return { score: -999, matchedPositive: [], matchedNegative: [signal], hardDrop: signal };
    }
  }

  for (const signal of HIGH_SIGNALS) {
    if (lower.includes(signal)) {
      score += 2;
      matchedPositive.push(signal);
    }
  }

  for (const signal of MID_SIGNALS) {
    if (lower.includes(signal)) {
      score += 1;
      matchedPositive.push(signal);
    }
  }

  for (const signal of LOW_SIGNALS) {
    if (lower.includes(signal)) {
      score -= 3;
      matchedNegative.push(signal);
    }
  }

  return { score, matchedPositive, matchedNegative, hardDrop: null };
}

function classify(score: number): SelectionTier {
  if (score >= 2) return "HIGH";
  if (score >= 0) return "MID";
  return "LOW";
}

export function selectCandidates(
  candidates: CandidateResource[]
): SelectionResult {
  const high: ScoredCandidate[] = [];
  const mid: ScoredCandidate[] = [];
  const low: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    const combined = `${candidate.title} ${candidate.description}`;
    const { score, matchedPositive, matchedNegative, hardDrop } = scoreText(combined);
    const tier = classify(score);

    const scored: ScoredCandidate = {
      candidate,
      score,
      tier,
      matchedPositive: [...new Set(matchedPositive)],
      matchedNegative: [...new Set(matchedNegative)],
      hardDrop,
    };

    if (tier === "HIGH") high.push(scored);
    else if (tier === "MID") mid.push(scored);
    else low.push(scored);
  }

  // Sort each bucket by score descending
  const byScore = (a: ScoredCandidate, b: ScoredCandidate) => b.score - a.score;
  high.sort(byScore);
  mid.sort(byScore);
  low.sort(byScore);

  return { high, mid, low };
}
