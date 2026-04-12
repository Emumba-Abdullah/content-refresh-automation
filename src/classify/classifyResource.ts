import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { buildClassificationPrompt } from "../../prompts/classifyResourcePrompt";
import { CandidateResource, ClassifiedResource, Priority } from "../types/resource";

dotenv.config();

type AllowedTagsConfig = {
  allowedTags: string[];
};

type LearningPathsConfig = {
  categories: string[];
};

type LlmClassificationResponse = {
  tags: string[];
  priority: Priority;
  confidence: number;
  reasoning: string;
  learningPathTitle?: string;
  learningPathDescription?: string;
};

function readJsonFile<T>(relativePath: string): T {
  const fullPath = path.resolve(process.cwd(), relativePath);
  const content = fs.readFileSync(fullPath, "utf-8");
  return JSON.parse(content) as T;
}

const allowedTagsConfig = readJsonFile<AllowedTagsConfig>("config/allowed-tags.json");

// Note: filename has a typo ("leaning" not "learning") — kept as-is to match existing file
const learningPathsConfig = readJsonFile<LearningPathsConfig>("config/leaning-paths.json");

const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
});

export async function classifyResource(
  candidate: CandidateResource
): Promise<ClassifiedResource> {
  const prompt = buildClassificationPrompt({
    title: candidate.title,
    description: candidate.description,
    website: candidate.website,
    allowedTags: allowedTagsConfig.allowedTags,
    learningPathCategories: learningPathsConfig.categories,
  });

  const response = await client.chat.completions.create({
    model: process.env.LLM_MODEL ?? "gpt-4.1-mini",
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: "You are a strict JSON classification engine. Return only valid JSON, no markdown, no prose.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("LLM returned empty response.");
  }

  // Strip markdown code fences if the model wrapped its output
  const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

  let parsed: LlmClassificationResponse;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse LLM JSON response:\n${content}`);
  }

  return {
    title: candidate.title,
    description: candidate.description,
    website: candidate.website,
    source: candidate.source,
    date: candidate.date,
    tags: parsed.tags,
    priority: parsed.priority,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    ...(parsed.learningPathTitle ? { learningPathTitle: parsed.learningPathTitle } : {}),
    ...(parsed.learningPathDescription ? { learningPathDescription: parsed.learningPathDescription } : {}),
  };
}
