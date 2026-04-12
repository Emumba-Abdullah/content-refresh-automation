const LEARNING_PATH_TAGS = [
  "developing-core-applications",
  "building-genai-apps",
  "building-ai-agents",
] as const;

export type LearningPathCategory = (typeof LEARNING_PATH_TAGS)[number];

export function getLearningPathTags(tags: string[]): LearningPathCategory[] {
  return tags.filter((tag): tag is LearningPathCategory =>
    LEARNING_PATH_TAGS.includes(tag as LearningPathCategory)
  );
}

export function getSingleLearningPathCategory(
  tags: string[]
): LearningPathCategory | null {
  const matches = getLearningPathTags(tags);
  return matches.length === 1 ? matches[0] : null;
}

export function isLearningPathResource(tags: string[]): boolean {
  return getLearningPathTags(tags).length === 1;
}