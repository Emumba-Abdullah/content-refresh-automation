export function buildClassificationPrompt(input: {
  title: string;
  description: string;
  website: string;
  allowedTags: string[];
  learningPathCategories: string[];
}) {
  return `
You are classifying a PostgreSQL learning resource for a curated developer hub.

Your job is to return STRICT JSON only.

## Resource
Title: ${input.title}
Description: ${input.description}
Website: ${input.website}

## Allowed Tags
${JSON.stringify(input.allowedTags, null, 2)}

## Learning Path Categories
${JSON.stringify(input.learningPathCategories, null, 2)}

## CRITICAL CONSTRAINTS

### 1. TAG VALIDITY
- Tags MUST exactly match one of the strings in the Allowed Tags list (case-sensitive)
- Do NOT invent tags
- Do NOT change casing (e.g. "postgreSQL", "PostgreSQL", "postgres" are all INVALID)
- If a tag is not in the allowed list, DO NOT use it
- If unsure, reduce your tag count instead of guessing

### 2. LEARNING PATH CONTRACT
- Learning path categories are: ${input.learningPathCategories.join(", ")}
- If you assign ANY of the above as a tag, you MUST ALSO include:
  - learningPathTitle  (short descriptive title for the learning path tile)
  - learningPathDescription  (1-2 sentence description of the learning path)
- If you are not confident enough to write both fields, DO NOT assign a learning path category tag
- Never assign more than one learning path category tag

### 3. TAG LIMITS
- Minimum 1 tag, maximum 12 tags
- Prefer fewer, high-signal tags over many weak ones

### 4. PRIORITY GUIDANCE
- P0 = highly valuable, broadly useful, strong fit for the curated hub
- P1 = useful and relevant, but narrower or more specialized
- P2 = valid but lower-value, niche, or less central

### 5. OUTPUT STRICTNESS
- Return ONLY valid JSON — no text, no comments, no markdown outside the JSON object
- confidence must be a number between 0 and 1
- reasoning must be short and concrete (one sentence)

## Output format

{
  "tags": ["tag1", "tag2"],
  "priority": "P0",
  "confidence": 0.92,
  "reasoning": "Short explanation",
  "learningPathTitle": "only if a learning path category tag is assigned",
  "learningPathDescription": "only if a learning path category tag is assigned"
}
`.trim();
}

