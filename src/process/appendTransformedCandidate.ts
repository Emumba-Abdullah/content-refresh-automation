import { ClassifiedResource } from "../types/resource";
import { transformForDestination } from "./transformForDestination";
import { appendToTemplates, AppendResult } from "./appendToTemplates";

/**
 * Transforms a classified candidate into destination-ready shape
 * and appends it to the local destination repo's templates.json.
 *
 * Safe local mutation only — no git, no push, no GitHub API.
 */
export function appendTransformedCandidate(
  candidate: ClassifiedResource,
  imagePath: string
): AppendResult {
  const transformed = transformForDestination(candidate, imagePath);
  return appendToTemplates(transformed);
}
