import * as fs from "fs";
import * as path from "path";
import { Resource, ClassifiedResource } from "../types/resource";

interface DestinationRepoConfig {
  templatePath: string;
  localCheckoutPath: string;
}

function loadConfig(): DestinationRepoConfig {
  const configPath = path.join(process.cwd(), "config", "destination-repo.json");
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

export interface AppendResult {
  templateFilePath: string;
  countBefore: number;
  countAfter: number;
  appended: Resource;
}

/**
 * Canonical key order matching the destination repo object style.
 */
const CANONICAL_KEY_ORDER: ReadonlyArray<keyof Resource> = [
  "title",
  "description",
  "website",
  "source",
  "image",
  "tags",
  "date",
  "priority",
  "tileNumber",
  "learningPathTitle",
  "learningPathDescription",
  "meta",
];

function orderedResource(resource: Resource): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of CANONICAL_KEY_ORDER) {
    const value = (resource as Record<string, unknown>)[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function detectArrayItemIndent(raw: string): string {
  const match = raw.match(/\n(\s+)\{/);
  return match ? match[1] : "  ";
}

/**
 * Surgically appends one resource to a JSON array string without
 * re-serializing existing content. Keeps the diff to only the new lines.
 */
function surgicalAppend(raw: string, resource: Resource): string {
  const itemIndent = detectArrayItemIndent(raw);
  const serialized = JSON.stringify(orderedResource(resource), null, itemIndent);
  const indented = serialized
    .split("\n")
    .map((line) => itemIndent + line)
    .join("\n");
  const trimmed = raw.trimEnd();
  if (!trimmed.endsWith("]")) {
    throw new Error(
      "templates.json does not end with ']' — cannot safely append. Check file format."
    );
  }
  const trailingNewline = raw.endsWith("\n") ? "\n" : "";
  const withoutClose = trimmed.slice(0, -1).trimEnd();
  return `${withoutClose},\n${indented}\n]${trailingNewline}`;
}

export function appendToTemplates(candidate: Resource | ClassifiedResource): AppendResult {
  const { localCheckoutPath, templatePath } = loadConfig();

  if (!localCheckoutPath) {
    throw new Error(
      '"localCheckoutPath" is not set in config/destination-repo.json.\n' +
      "Set it to the absolute path of your local postgres-hub checkout."
    );
  }

  const templateFilePath = path.join(localCheckoutPath, templatePath);

  if (!fs.existsSync(templateFilePath)) {
    throw new Error(`templates.json not found at: ${templateFilePath}`);
  }

  const raw = fs.readFileSync(templateFilePath, "utf-8");

  let existing: Resource[];
  try {
    existing = JSON.parse(raw);
  } catch (e) {
    throw new Error(`templates.json is not valid JSON before mutation: ${(e as Error).message}`);
  }
  if (!Array.isArray(existing)) {
    throw new Error("templates.json root is not an array");
  }

  const countBefore = existing.length;
  const updated = surgicalAppend(raw, candidate as Resource);

  let countAfter: number;
  try {
    const roundTrip = JSON.parse(updated);
    if (!Array.isArray(roundTrip)) throw new Error("Result is not an array");
    countAfter = roundTrip.length;
    if (countAfter !== countBefore + 1) {
      throw new Error(`Expected ${countBefore + 1} items, got ${countAfter}`);
    }
  } catch (e) {
    throw new Error(`Pre-write validation failed: ${(e as Error).message}`);
  }

  fs.writeFileSync(templateFilePath, updated, "utf-8");

  try {
    const verify = JSON.parse(fs.readFileSync(templateFilePath, "utf-8"));
    if (!Array.isArray(verify) || verify.length !== countAfter) {
      throw new Error("Post-write count mismatch");
    }
  } catch (e) {
    throw new Error(`Post-write validation failed: ${(e as Error).message}`);
  }

  return { templateFilePath, countBefore, countAfter, appended: candidate as Resource };
}