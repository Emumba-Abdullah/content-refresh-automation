# Content Refresh Automation

Automated pipeline that discovers, evaluates, and proposes new learning resources for the [Azure-Samples/postgres-hub](https://github.com/Azure-Samples/postgres-hub) destination repository.

The system continuously monitors Microsoft Learn for PostgreSQL-related content, classifies it with an LLM, and opens pull requests in the destination repo — one resource at a time — so that a human reviewer controls every merge.

---

## How it works

```
Microsoft Learn
      │
      ▼
  fetch + scrape          src/fetchers/
      │
      ▼
  clean candidates        src/process/cleanCandidates.ts
      │   drop broken URLs, title-rule drops, URL-pattern drops
      ▼
  select candidates       src/process/selectCandidates.ts
      │   keyword score → HIGH / MID / LOW tiers
      │   hard-drop on infra/ops signals
      ▼
  LLM classify            src/classify/classifyResource.ts
      │   GPT-4.1-mini assigns tags, priority, date, description
      │   confidence + reasoning stored for audit
      ▼
  post-classification     src/process/postClassificationReview.ts
  review                  config/post-classification-review.json
      │   deterministic domain + URL-pattern drops on LLM output
      ▼
  output/final-candidates.json
      │
      ▼
  filter new candidates   src/process/filterNewCandidates.ts
      │   compare against destination templates.json
      │   compare against open PRs + previously-rejected PRs
      ▼
  output/new-candidates.json
      │
      ▼
  create destination PRs  src/github/createDestinationPr.ts
      │   transform → strip LLM fields, inject image path
      │   build unique branch name (slug + UTC timestamp)
      │   commit to new branch via GitHub API
      │   open PR with machine-readable resource-url: marker
      │   label PR needs-review
      ▼
  Azure-Samples/postgres-hub  ← human reviews and merges
```

---

## Repositories

| Role                   | Repository                                   |
| ---------------------- | -------------------------------------------- |
| Automation (this repo) | `Emumba-Abdullah/content-refresh-automation` |
| Destination            | `Azure-Samples/postgres-hub`                 |

The automation repo **never pushes to its own `main`** and **never pushes directly to the destination `main`**. All destination changes arrive via pull requests that a human must merge.

---

## Triggering a run

A GitHub Actions workflow runs when an issue is opened in this repository with the exact title:

```
Content Refresh
```

Create the issue manually (or automate it with a cron job / `gh` CLI) to kick off the pipeline. The built-in `GITHUB_TOKEN` is restricted to read-only permissions; all destination writes use `DESTINATION_REPO_TOKEN`.

---

## Prerequisites

| Requirement                | Notes                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Node.js 20+                | Tested with Node 20 LTS                                                            |
| TypeScript / ts-node       | Installed via `npm ci`                                                             |
| OpenAI API key             | GPT-4.1-mini, temperature 0.1                                                      |
| GitHub PAT for destination | Needs `contents: write` and `pull_requests: write` on `Azure-Samples/postgres-hub` |

---

## Local setup

```bash
git clone https://github.com/Emumba-Abdullah/content-refresh-automation
cd content-refresh-automation
npm ci
```

Create a `.env` file in the project root:

```env
LLM_API_KEY=sk-...
DESTINATION_REPO_TOKEN=ghp_...
```

---

## Running locally step by step

Each step writes output files that the next step reads. Run them in order.

### Step 1 — Fetch and clean

```bash
npx ts-node src/test/runCleanCandidatesTest.ts
```

Fetches MS Learn PostgreSQL pages, scrapes titles and descriptions, applies `config/filter-rules.json` rules, and writes:

- `output/raw-candidates.json`
- `output/cleaned-candidates.json`
- `output/removed-candidates.json`

Environment variable overrides:

| Variable       | Default         | Effect                      |
| -------------- | --------------- | --------------------------- |
| `SCRAPE_LIMIT` | `0` (unlimited) | Cap number of pages fetched |
| `CONCURRENCY`  | `5`             | Parallel scrape workers     |

### Step 2 — Select by keyword score

```bash
npx ts-node src/test/runSelectionTest.ts
```

Scores each cleaned candidate against `HIGH_SIGNALS` (+2 each), `MID_SIGNALS` (+1 each), and `HARD_DROP_SIGNALS` (instant reject). Produces tiers **HIGH**, **MID**, **LOW**. Only HIGH and MID move forward.

Writes `output/selected-candidates.json`.

### Step 3 — LLM classify

```bash
npx ts-node src/test/runBatchClassificationTest.ts <count>
```

Classifies up to `<count>` HIGH-tier candidates using GPT-4.1-mini. For each resource the model assigns:

- `tags` — from `config/allowed-tags.json` (case-sensitive, validated)
- `priority` — `P0`, `P1`, or `P2`
- `date` — ISO `YYYY-MM-DD`
- `description` — concise, developer-facing
- `confidence` — 0–1 float (audit only, stripped before destination)
- `reasoning` — short justification (audit only, stripped before destination)

Writes `output/classified-valid.json` and `output/classified-failed.json`.

### Step 4 — Post-classification review

```bash
npx ts-node src/test/runPostClassificationReview.ts
```

Applies deterministic rules from `config/post-classification-review.json` as a final quality gate on LLM output:

- **`dropDomains`** — blocks non-doc domains (e.g. `azure.microsoft.com`, `stackoverflow.com`)
- **`dropUrlContains`** — blocks known junk URL patterns (generic indexes, infra/ops pages)

Writes `output/final-candidates.json` and `output/dropped-after-review.json`.

### Step 5 — Filter new candidates

```bash
npx ts-node src/test/runFilterNewCandidatesTest.ts
```

Compares `final-candidates.json` against the destination repo to produce only truly new candidates. The check order is:

| Priority | Check                                                   | Action                        |
| -------- | ------------------------------------------------------- | ----------------------------- |
| 1        | Exact normalized URL already in `templates.json`        | skip — `already-in-templates` |
| 2        | Canonical key match (same article, different URL shape) | skip — `already-in-templates` |
| 3        | Open PR with matching `resource-url:` marker            | skip — `already-open-pr`      |
| 4        | Closed PR labeled `resource-rejected`                   | skip — `previously-rejected`  |
| —        | None of the above                                       | eligible for PR creation      |

Canonical key matching handles Microsoft Learn URL restructurings where the same article appears under a new subdirectory. For example:

```
Destination : learn.microsoft.com/azure/postgresql/flexible-server/<slug>
Candidate   : learn.microsoft.com/en-us/azure/postgresql/azure-ai/<slug>
                                                         ^^^^^^^^^
                                                    different subdir
```

Both resolve to canonical key `azure/postgresql/<slug>` so duplicates are caught.

Writes `output/new-candidates.json` and `output/skipped-existing.json`.

### Step 6 — Create destination PRs

```bash
npx ts-node src/pipeline/runPipeline.ts
```

For each new candidate (up to `PR_LIMIT`, default `1`):

1. Transforms the candidate — strips `confidence` and `reasoning`, injects `PR_IMAGE_PATH`
2. Builds a unique branch name: `content-refresh/<slug>-<YYYYMMDDHHmm>` (UTC)
3. Fetches current `main` SHA from the destination repo via GitHub API
4. Fetches current `static/templates.json` content + blob SHA
5. Appends the new resource to the JSON array
6. Creates the branch
7. Commits the updated `templates.json` to the branch
8. Opens a pull request into `main`
9. Labels the PR `needs-review`

The PR body always contains:

```
resource-url: https://learn.microsoft.com/azure/postgresql/...
```

This machine-readable marker is how future runs detect the resource as "already has open PR" or "previously rejected" without scanning the PR title.

Writes `output/pr-creation-results.json`.

---

## Environment variables

| Variable                 | Required | Default                 | Description                                |
| ------------------------ | -------- | ----------------------- | ------------------------------------------ |
| `LLM_API_KEY`            | Yes      | —                       | OpenAI API key                             |
| `DESTINATION_REPO_TOKEN` | Yes      | —                       | GitHub PAT for destination repo writes     |
| `PR_LIMIT`               | No       | `1`                     | Max PRs created per pipeline run           |
| `PR_IMAGE_PATH`          | No       | `./img/placeholder.png` | Image path injected into each new resource |
| `SCRAPE_LIMIT`           | No       | `0` (unlimited)         | Limit pages fetched during scrape          |
| `CONCURRENCY`            | No       | `5`                     | Parallel scrape workers                    |

---

## Configuration files

### `config/destination-repo.json`

Destination repo coordinates.

```json
{
  "owner": "Azure-Samples",
  "repo": "postgres-hub",
  "baseBranch": "main",
  "templatePath": "static/templates.json",
  "rejectedLabel": "resource-rejected",
  "localCheckoutPath": "C:\\Users\\...\\postgres-hub"
}
```

| Key                 | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `owner` / `repo`    | GitHub destination repository                         |
| `baseBranch`        | Branch PRs target. Never pushed to directly.          |
| `templatePath`      | Path inside destination repo to the resource list     |
| `rejectedLabel`     | Label that marks a PR as permanently rejected         |
| `localCheckoutPath` | Local path for dev-only append tests (not used in CI) |

### `config/allowed-tags.json`

Exhaustive list of valid tag strings. The LLM is constrained to this list. Tags are case-sensitive.

### `config/filter-rules.json`

Deterministic pre-classification rules:

- `dropTitleContains` — title substring blocklist
- `dropUrlContains` — URL substring blocklist
- `requireNonEmptyDescription` — drop if description is blank after scrape

### `config/post-classification-review.json`

Post-classification rules applied after LLM output:

- `dropDomains` — block non-Learn domains that slipped through
- `dropUrlContains` — block known junk URL patterns (index pages, infra/ops)

### `config/leaning-paths.json`

Learning path category definitions:

```json
{
  "categories": [
    "developing-core-applications",
    "building-genai-apps",
    "building-ai-agents"
  ]
}
```

### `config/settings.json`

Global pipeline settings:

```json
{
  "minTags": 1,
  "maxTags": 12,
  "oneResourcePerPR": true,
  "imageGenerationEnabled": false
}
```

---

## Project structure

```
content-refresh-automation/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── content-refresh.yml        # Issue template that triggers the workflow
│   └── workflows/
│       └── content-refresh.yml        # GitHub Actions workflow
│
├── config/
│   ├── allowed-tags.json              # Valid LLM output tag vocabulary
│   ├── destination-repo.json          # Destination repo coordinates
│   ├── filter-rules.json              # Pre-classification drop rules
│   ├── leaning-paths.json             # Learning path category list
│   ├── post-classification-review.json # Post-LLM drop rules
│   └── settings.json                  # Global pipeline settings
│
├── prompts/
│   └── classifyResourcePrompt.ts      # LLM prompt builder
│
├── src/
│   ├── classify/
│   │   └── classifyResource.ts        # LLM classification call (GPT-4.1-mini)
│   │
│   ├── fetchers/                      # HTTP fetch + HTML scrape utilities
│   │
│   ├── github/
│   │   ├── buildBranchName.ts         # slug + UTC timestamp branch name
│   │   ├── buildPrBody.ts             # PR markdown body with resource-url: marker
│   │   ├── createDestinationPr.ts     # Full remote PR flow (no local disk writes)
│   │   ├── findExistingResourceState.ts # Open PR + rejected PR detection
│   │   └── loadDestinationTemplates.ts  # Fetch templates.json via GitHub API
│   │
│   ├── pipeline/
│   │   └── runPipeline.ts             # End-to-end runner: filter → create PRs
│   │
│   ├── process/
│   │   ├── appendToTemplates.ts       # Local surgical append (dev testing only)
│   │   ├── appendTransformedCandidate.ts # transform + local append (dev testing only)
│   │   ├── cleanCandidates.ts         # URL/title/description filtering
│   │   ├── filterNewCandidates.ts     # 4-check deduplication against destination
│   │   ├── postClassificationReview.ts # Domain + URL-pattern gate on LLM output
│   │   ├── selectCandidates.ts        # Keyword score → HIGH/MID/LOW
│   │   └── transformForDestination.ts  # Strip LLM fields, inject image path
│   │
│   ├── test/                          # Runnable step scripts (local dev + CI)
│   │
│   ├── types/
│   │   └── resource.ts                # CandidateResource, Resource, ClassifiedResource
│   │
│   ├── utils/
│   │   ├── canonicalKey.ts            # URL → stable identity key (handles restructurings)
│   │   ├── learningPath.ts
│   │   ├── normalizeUrl.ts            # Strip locale prefix, lowercase
│   │   └── resourceValidator.ts       # Required field validation
│   │
│   └── validate/
│
├── output/                            # Generated at runtime, gitignored
│   ├── raw-candidates.json
│   ├── cleaned-candidates.json
│   ├── selected-candidates.json
│   ├── classified-valid.json
│   ├── classified-failed.json
│   ├── dropped-after-review.json
│   ├── final-candidates.json
│   ├── new-candidates.json
│   ├── skipped-existing.json
│   └── pr-creation-results.json
│
├── .env                               # Local secrets (never committed)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Data types

```typescript
// Raw scraped page
type CandidateResource = {
  title: string;
  description: string;
  website: string;
  source: string;
  date?: string;
};

// Destination-ready resource (written to templates.json)
type Resource = {
  title: string;
  description: string;
  website: string;
  source: string;
  image?: string;
  tags: string[];
  date?: string;
  priority: "P0" | "P1" | "P2";
  tileNumber?: number;
  learningPathTitle?: string;
  learningPathDescription?: string;
  meta?: { author?: string; date?: string; duration?: string };
};

// LLM output — Resource + audit fields (never written to destination)
type ClassifiedResource = Resource & {
  confidence: number; // 0–1
  reasoning: string;
};
```

---

## Skip logic reference

Every candidate that already exists in the destination in some form is skipped rather than creating a duplicate PR. The three skip states are mutually exclusive and ordered:

| Reason                 | Meaning                                                                                           | PR created? |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ----------- |
| `already-in-templates` | URL or canonical key found in destination `templates.json` — content is already accepted and live | No          |
| `already-open-pr`      | A PR with a matching `resource-url:` line is currently open                                       | No          |
| `previously-rejected`  | A closed PR with a matching `resource-url:` line carries the `resource-rejected` label            | No          |
| _(none)_               | Truly new — not in templates, no open PR, not rejected                                            | **Yes**     |

`already-in-templates` is not rejection. It means the content was already accepted and published. `previously-rejected` means it was explicitly rejected by a human reviewer. These two states are intentionally distinct.

---

## Branch naming

Every branch is unique across runs:

```
content-refresh/<slug>-<YYYYMMDDHHmm>
```

Example:

```
content-refresh/generative-ai-azure-overview-202604131430
```

The UTC timestamp ensures that if a branch was previously created and deleted for the same resource, the next run will not collide with it.

---

## PR body format

```markdown
## New Resource: <title>

| Field    | Value                     |
| -------- | ------------------------- |
| Priority | P0                        |
| Date     | 2026-04-13                |
| Tags     | genai, rag, documentation |

**URL:** https://learn.microsoft.com/...

**Description:**
<one-paragraph description>

---

<!-- machine-readable: do not edit this line -->

resource-url: https://learn.microsoft.com/azure/postgresql/...
```

The `resource-url:` line is mandatory and must not be edited. It is the key used by `findExistingResourceState.ts` to match this PR on all future pipeline runs.

---

## Security notes

- `GITHUB_TOKEN` permissions are restricted to `contents: read` and `issues: read`. The automation workflow cannot push or merge anything to its own repository.
- All destination repo writes (branch creation, commits, PR creation) use `DESTINATION_REPO_TOKEN` — a separate secret scoped specifically to `Azure-Samples/postgres-hub`.
- No secrets are printed in logs.
- The destination `main` branch is never pushed to directly; every change must pass through a PR and a human approval.

---

## GitHub Actions secrets required

| Secret                   | Where it's used                                   |
| ------------------------ | ------------------------------------------------- |
| `LLM_API_KEY`            | OpenAI API calls during classification            |
| `DESTINATION_REPO_TOKEN` | GitHub API writes to `Azure-Samples/postgres-hub` |
