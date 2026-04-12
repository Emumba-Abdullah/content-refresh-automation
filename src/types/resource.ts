export type Priority = "P0" | "P1" | "P2";

export type CandidateResource = {
  title: string;
  description: string;
  website: string;
  source: string;
  date?: string;
};

export type Resource = {
  title: string;
  description: string;
  website: string;
  source: string;
  image?: string;
  tags: string[];
  date?: string;
  priority: Priority;
  tileNumber?: number;
  learningPathTitle?: string;
  learningPathDescription?: string;
  meta?: {
    author?: string;
    date?: string;
    duration?: string;
  };
};

export type ClassifiedResource = Resource & {
  confidence: number;
  reasoning: string;
};