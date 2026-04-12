import { ClassifiedResource, Resource } from "../types/resource";

/**
 * Transforms an internal ClassifiedResource into a destination-ready Resource.
 *
 * Strips automation-only fields: confidence, reasoning
 * Injects the provided imagePath as the image field
 * Preserves all content fields and optional destination fields if present
 */
export function transformForDestination(
  candidate: ClassifiedResource,
  imagePath: string
): Resource {
  if (!imagePath || !imagePath.trim()) {
    throw new Error("imagePath is required and must be a non-empty string.");
  }

  const result: Resource = {
    title: candidate.title,
    description: candidate.description,
    website: candidate.website,
    source: candidate.source,
    image: imagePath.trim(),
    tags: candidate.tags,
    priority: candidate.priority,
  };

  if (candidate.date !== undefined) {
    result.date = candidate.date;
  }

  if (candidate.tileNumber !== undefined) {
    result.tileNumber = candidate.tileNumber;
  }

  if (candidate.learningPathTitle !== undefined) {
    result.learningPathTitle = candidate.learningPathTitle;
  }

  if (candidate.learningPathDescription !== undefined) {
    result.learningPathDescription = candidate.learningPathDescription;
  }

  if (candidate.meta !== undefined) {
    result.meta = candidate.meta;
  }

  return result;
}
