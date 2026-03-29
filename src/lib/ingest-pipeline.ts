import {
  generateMissingEmbeddings,
  type EmbeddingResult,
} from "./embedding-ingester";
import { ingestAllFeeds, ingestFeedDataOnly } from "./feed-ingester";
import {
  generateMissingSubjectTags,
  type SubjectEnrichmentResult,
} from "./subject-enricher";
import type { IngestResult } from "./types";

export type IngestPipelineMode = "feed" | "full";

type PipelineStepResult<T> = T & {
  error?: string;
};

export interface IngestPipelineResult {
  feedResults: IngestResult[];
  subjectResult: PipelineStepResult<SubjectEnrichmentResult> | null;
  embeddingResult: PipelineStepResult<EmbeddingResult> | null;
  timestamp: string;
}

function buildStepErrorResult<T extends Record<string, number>>(
  base: T,
  error: unknown,
): PipelineStepResult<T> {
  return {
    ...base,
    error: error instanceof Error ? error.message : "Unknown error",
  };
}

export async function runIngestPipeline(
  mode: IngestPipelineMode = "feed",
): Promise<IngestPipelineResult> {
  const feedResults =
    mode === "full" ? await ingestAllFeeds() : await ingestFeedDataOnly();

  let subjectResult: PipelineStepResult<SubjectEnrichmentResult> | null = null;
  let embeddingResult: PipelineStepResult<EmbeddingResult> | null = null;

  if (process.env.GEMINI_API_KEY) {
    try {
      subjectResult = await generateMissingSubjectTags();
    } catch (subjectError) {
      console.error(
        "[ingest-pipeline] Subject enrichment failed:",
        subjectError,
      );
      subjectResult = buildStepErrorResult(
        {
          processed: 0,
          errors: 0,
          embedded: 0,
          durationMs: 0,
        },
        subjectError,
      );
    }

    try {
      embeddingResult = await generateMissingEmbeddings();
    } catch (embeddingError) {
      console.error(
        "[ingest-pipeline] Embedding generation failed:",
        embeddingError,
      );
      embeddingResult = buildStepErrorResult(
        {
          processed: 0,
          errors: 0,
          durationMs: 0,
        },
        embeddingError,
      );
    }
  }

  return {
    feedResults,
    subjectResult,
    embeddingResult,
    timestamp: new Date().toISOString(),
  };
}

if (require.main === module) {
  const modeArg = process.argv[2];
  const mode: IngestPipelineMode = modeArg === "full" ? "full" : "feed";

  runIngestPipeline(mode)
    .then((result) => {
      console.log("[ingest-pipeline] Done:", JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error("[ingest-pipeline] Fatal error:", error);
      process.exit(1);
    });
}
