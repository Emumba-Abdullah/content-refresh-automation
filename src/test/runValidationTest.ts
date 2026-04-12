import { validateResource } from "../validate/resourceValidator";
import { normalizeUrl } from "../utils/normalizeUrl";
import { getLearningPathTags, getSingleLearningPathCategory } from "../utils/learningPath";
import { Resource } from "../types/resource";

const samples: Resource[] = [
  {
    title: "Valid Independent Resource",
    description: "A normal documentation resource.",
    website: "https://learn.microsoft.com/azure/postgresql/flexible-server/overview?utm_source=test",
    source: "https://learn.microsoft.com/azure/postgresql/flexible-server/overview?utm_source=test",
    tags: ["documentation", "flexibleserver", "fundamentals", "overview"],
    priority: "P0",
    date: "2025-10-04",
  },
  {
    title: "Valid Learning Path Resource",
    description: "A learning path resource for building GenAI apps.",
    website: "https://learn.microsoft.com/azure/postgresql/flexible-server/how-to-use-pgvector/",
    source: "https://learn.microsoft.com/azure/postgresql/flexible-server/how-to-use-pgvector/",
    tags: [
      "documentation",
      "vector-search",
      "genai",
      "rag",
      "building-genai-apps",
    ],
    priority: "P0",
    date: "2025-09-04",
    learningPathTitle: "Enable and Use pgvector for Native Vector Search",
    learningPathDescription:
      "The pgvector extension brings vector similarity search to PostgreSQL.",
    tileNumber: 2,
  },
  {
    title: "Invalid Multiple Learning Paths",
    description: "This should fail because it belongs to two learning path categories.",
    website: "https://example.com/resource",
    source: "https://example.com/resource",
    tags: [
      "documentation",
      "developing-core-applications",
      "building-genai-apps",
    ],
    priority: "P1",
    learningPathTitle: "Bad Learning Path Data",
    learningPathDescription: "Should fail.",
  },
  {
    title: "Invalid Duplicate and Bad Tag",
    description: "This should fail because of duplicate and invalid tags.",
    website: "https://example.com/another-resource",
    source: "https://example.com/another-resource",
    tags: ["documentation", "documentation", "not-a-real-tag"],
    priority: "P2",
  },
];

for (const sample of samples) {
  console.log("\n====================================");
  console.log(`TITLE: ${sample.title}`);

  console.log("Normalized Website:", normalizeUrl(sample.website));
  console.log("Normalized Source:", normalizeUrl(sample.source));

  const learningPathTags = getLearningPathTags(sample.tags);
  console.log("Learning Path Tags:", learningPathTags);
  console.log(
    "Single Learning Path Category:",
    getSingleLearningPathCategory(sample.tags)
  );

  const result = validateResource(sample);

  if (result.valid) {
    console.log("Validation: PASS");
  } else {
    console.log("Validation: FAIL");
    console.log("Errors:");
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
  }
}