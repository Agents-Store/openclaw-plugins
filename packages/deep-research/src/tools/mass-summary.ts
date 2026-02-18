import type { ExaClient } from "../clients/exa";
import type { FirecrawlClient } from "../clients/firecrawl";
import type { PerplexityClient } from "../clients/perplexity";
import { parallelServices, batchProcess } from "../utils/parallel";
import { deduplicateUrls, type SearchResult } from "../utils/dedup";
import { formatSummary, formatErrors } from "../utils/formatters";

export const MASS_SUMMARY_DEF = {
  name: "mass_summary",
  description:
    "Collect 100+ sources on a topic and create a comprehensive summary. Uses all three services in parallel for maximum URL collection, then batch-scrapes content and synthesizes via Perplexity deep-research. Use for creating thorough overviews from a large number of articles.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "Topic to collect and summarize" },
      minSources: {
        type: "number",
        description: "Minimum number of unique sources to collect (default: 100)",
      },
      maxSources: {
        type: "number",
        description: "Maximum number of sources (default: 150)",
      },
      domains: {
        type: "array",
        items: { type: "string" },
        description: "Prefer these domains for sources",
      },
      dateFrom: { type: "string", description: "Only include sources from this date (ISO YYYY-MM-DD)" },
      dateTo: { type: "string", description: "Only include sources until this date (ISO YYYY-MM-DD)" },
    },
    required: ["topic"],
  },
};

export function createMassSummary(
  exa: ExaClient,
  firecrawl: FirecrawlClient,
  perplexity: PerplexityClient
) {
  return async (_id: string, params: {
    topic: string;
    minSources?: number;
    maxSources?: number;
    domains?: string[];
    dateFrom?: string;
    dateTo?: string;
  }) => {
    const minSources = params.minSources ?? 100;
    const maxSources = params.maxSources ?? 150;
    const allErrors: string[] = [];

    // --- Step 1: Mass URL collection with query variations ---
    const queryVariations = [
      params.topic,
      `${params.topic} analysis`,
      `${params.topic} review`,
      `${params.topic} guide`,
      `${params.topic} overview`,
    ];

    // Parallel collection from all services with multiple query variations
    const collectionResults = await parallelServices({
      exa: async () => {
        const promises = queryVariations.slice(0, 4).map((q) =>
          exa.search(q, {
            numResults: 40,
            includeDomains: params.domains,
            startPublishedDate: params.dateFrom,
            endPublishedDate: params.dateTo,
            text: { maxCharacters: 1500 },
          }).catch(() => ({ results: [] }))
        );
        const results = await Promise.all(promises);
        return results.flatMap((r) => r.results);
      },

      firecrawl: async () => {
        const promises = queryVariations.slice(0, 4).map((q) => {
          const domainQ = params.domains?.length
            ? `${params.domains.map((d) => `site:${d}`).join(" OR ")} ${q}`
            : q;
          return firecrawl.search(domainQ, {
            limit: 40,
            scrapeOptions: { formats: ["summary"] },
          }).catch(() => ({ data: [] }));
        });
        const results = await Promise.all(promises);
        return results.flatMap((r) => r.data || []);
      },

      perplexity: async () => {
        // Use Perplexity pro-search to get high-quality citations
        const res = await perplexity.search(
          `Comprehensive overview of "${params.topic}" with as many relevant sources as possible`,
          { preset: "pro-search" }
        );
        return { text: res.text, citations: res.citations };
      },
    });

    allErrors.push(...collectionResults.errors);

    // Collect all URLs
    const urlsWithTitles: { url: string; title: string; snippet: string }[] = [];

    if (collectionResults.exa) {
      for (const r of collectionResults.exa) {
        urlsWithTitles.push({
          url: r.url,
          title: r.title,
          snippet: r.text?.slice(0, 300) || "",
        });
      }
    }

    if (collectionResults.firecrawl) {
      for (const r of collectionResults.firecrawl) {
        urlsWithTitles.push({
          url: r.url,
          title: r.title || "",
          snippet: r.description || (r as any).summary?.slice(0, 300) || "",
        });
      }
    }

    if (collectionResults.perplexity?.citations) {
      for (const c of collectionResults.perplexity.citations) {
        urlsWithTitles.push({
          url: c.url,
          title: c.title || "",
          snippet: c.snippet || "",
        });
      }
    }

    // Deduplicate
    const uniqueUrls = deduplicateUrls(urlsWithTitles.map((u) => u.url));
    const trimmedUrls = uniqueUrls.slice(0, maxSources);

    // --- Step 2: Batch content extraction for sources we don't have content for ---
    const contentSnippets: string[] = [];

    // Get content via Exa getContents in batches of 10
    const contentBatches = [];
    for (let i = 0; i < Math.min(trimmedUrls.length, 60); i += 10) {
      contentBatches.push(trimmedUrls.slice(i, i + 10));
    }

    const exaContents = await batchProcess(contentBatches, 3, async (batch) => {
      return exa.getContents(batch, {
        text: { maxCharacters: 2000 },
        summary: true,
      }).catch(() => null);
    });

    for (const batchResult of exaContents) {
      if (!batchResult) continue;
      for (const r of batchResult.results) {
        const summary = r.summary || r.text?.slice(0, 500);
        if (summary) contentSnippets.push(`[${r.title}](${r.url}): ${summary}`);
      }
    }

    // Also collect snippets from initial results
    for (const u of urlsWithTitles) {
      if (u.snippet && !contentSnippets.some((s) => s.includes(u.url))) {
        contentSnippets.push(`[${u.title}](${u.url}): ${u.snippet}`);
      }
    }

    // --- Step 3: Synthesize via Perplexity ---
    const perplexitySynthesis = collectionResults.perplexity?.text || "";

    // Build the final summary prompt with collected content
    const contentForSummary = contentSnippets.slice(0, 120).join("\n\n");
    let finalSummary: string;

    try {
      const synthesis = await perplexity.deepResearch(
        `Create a comprehensive, well-structured summary of the topic "${params.topic}" based on these ${contentSnippets.length} sources. Include key findings, trends, and insights.\n\nSources:\n${contentForSummary.slice(0, 30000)}`,
        { maxSteps: 5 }
      );
      finalSummary = synthesis.text;
    } catch {
      // Fallback to Perplexity's initial synthesis
      finalSummary = perplexitySynthesis || `Summary based on ${trimmedUrls.length} collected sources about "${params.topic}".`;
    }

    // --- Compile output ---
    const sources = trimmedUrls.map((url) => {
      const match = urlsWithTitles.find((u) => u.url === url);
      return { url, title: match?.title || url };
    });

    const output = [
      `# Mass Summary: ${params.topic}\n`,
      `**Sources collected:** ${trimmedUrls.length} (target: ${minSources}-${maxSources})\n`,
      formatSummary(finalSummary, sources),
      formatErrors(allErrors),
    ].join("\n");

    return { content: [{ type: "text", text: output }] };
  };
}
