import fs from "node:fs";
import path from "node:path";
import { Resource } from "../types/resource";
import { getLearningPathTags } from "../utils/learningPath";

type ValidationResult = {
  valid: boolean;
  errors: string[];
};

function readJsonFile<T>(relativePath: string): T {
  const fullPath = path.resolve(process.cwd(), relativePath);
  const content = fs.readFileSync(fullPath, "utf-8");
  return JSON.parse(content) as T;
}

type AllowedTagsConfig = {
  allowedTags: string[];
};

type SettingsConfig = {
  minTags: number;
  maxTags: number;
  oneResourcePerPR: boolean;
  imageGenerationEnabled: boolean;
};

const allowedTagsConfig = readJsonFile<AllowedTagsConfig>(
  "config/allowed-tags.json"
);

const settingsConfig = readJsonFile<SettingsConfig>(
  "config/settings.json"
);

export function validateResource(resource: Resource): ValidationResult {
  const errors: string[] = [];

  if (!resource.title?.trim()) errors.push("Missing title.");
  if (!resource.description?.trim()) errors.push("Missing description.");
  if (!resource.website?.trim()) errors.push("Missing website.");
  if (!resource.source?.trim()) errors.push("Missing source.");
  if (!resource.priority) errors.push("Missing priority.");

  const validPriorities = ["P0", "P1", "P2"];
  if (resource.priority && !validPriorities.includes(resource.priority)) {
    errors.push(`Invalid priority: ${resource.priority}`);
  }

  if (!Array.isArray(resource.tags)) {
    errors.push("Tags must be an array.");
  } else {
    const uniqueTags = new Set(resource.tags);

    if (uniqueTags.size !== resource.tags.length) {
      errors.push("Duplicate tags are not allowed.");
    }

    if (resource.tags.length < settingsConfig.minTags) {
      errors.push(
        `At least ${settingsConfig.minTags} tag(s) required.`
      );
    }

    if (resource.tags.length > settingsConfig.maxTags) {
      errors.push(
        `No more than ${settingsConfig.maxTags} tags allowed.`
      );
    }

    for (const tag of resource.tags) {
      if (!allowedTagsConfig.allowedTags.includes(tag)) {
        errors.push(`Invalid tag: ${tag}`);
      }
    }

    const learningPathMatches = getLearningPathTags(resource.tags);

    if (learningPathMatches.length > 1) {
      errors.push(
        "A resource cannot belong to more than one learning path category."
      );
    }

    const isLearningPath = learningPathMatches.length === 1;

    if (isLearningPath) {
      if (!resource.learningPathTitle?.trim()) {
        errors.push(
          "Learning path resource must include learningPathTitle."
        );
      }

      if (!resource.learningPathDescription?.trim()) {
        errors.push(
          "Learning path resource must include learningPathDescription."
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}