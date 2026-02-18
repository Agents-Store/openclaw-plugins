import type { ExaClient } from "../clients/exa";
import type { FirecrawlClient } from "../clients/firecrawl";
import type { PerplexityClient } from "../clients/perplexity";
import { parallelServices } from "../utils/parallel";
import { mergeResults, rankByRelevance, deduplicateUrls, type SearchResult } from "../utils/dedup";
import { formatSearchResults, formatErrors } from "../utils/formatters";

export const DEEP_RESEARCH_DEF = {
  name: "deep_research",
  description:
    "Multi-step deep research on a topic. Step 1: parallel search across all 3 services. Step 2: Perplexity deep-research for comprehensive analysis. Step 3: expanded search on discovered sub-topics. Returns a thorough research report with all sources. Use for in-depth topic exploration.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "Topic to research" },
      depth: {
        type: "string",
        enum: ["standard", "deep", "exhaustive"],
        description: "Research depth: standard (1 round), deep (2 rounds, default), exhaustive (3 rounds with sub-topic expansion)",
      },
      focusAreas: {
        type: "array",
        items: { type: "string" },
        description: "Specific aspects to focus on (e.g. ['pricing', 'technical architecture', 'competitors'])",
      },
      language: {
        type: "string",
        description: "Language for results (ISO code, e.g. 'en', 'ru', 'uk')",
      },
    },
    required: ["topic"],
  },
};

export function createDeepResearch(
  exa: ExaClient,
  firecrawl: FirecrawlClient,
  perplexity: PerplexityClient,
  defaultLanguage: string
) {
  return async (_id: string, params: {
    topic: string;
    depth?: string;
    focusAreas?: string[];
    language?: string;
  }) => {
    const depth = params.depth ?? "deep";
    const language = params.language ?? defaultLanguage;
    const allResults: SearchResult[] = [];
    const allErrors: string[] = [];
    const sections: string[] = [];

    // --- Step 1: Initial parallel search ---
    const numResults = depth === "exhaustive" ? 40 : depth === "deep" ? 30 : 20;
    const maxSteps = depth === "exhaustive" ? 8 : depth === "deep" ? 5 : 3;

    const step1 = await parallelServices({
      exa: async () => {
        const res = await exa.search(params.topic, {
          numResults,
          type: "auto",
          text: true,
          highlights: true,
        });
        return res.results.map((r): SearchResult => ({
          url: r.url,
          title: r.title,
          snippet: r.highlights?.join(" ") || r.text?.slice(0, 300) || "",
          content: r.text,
          publishedDate: r.publishedDate,
          source: "exa",
          score: r.score,
        }));
      },

      firecrawl: async () => {
        const res = await firecrawl.search(params.topic, {
          limit: numResults,
          scrapeOptions: { formats: ["markdown", "summary"] },
        });
        return (res.data || []).map((r): SearchResult => ({
          url: r.url,
          title: r.title || "",
          snippet: r.description || r.markdown?.slice(0, 300) || "",
          content: r.markdown,
          source: "firecrawl",
        }));
      },

      perplexity: async () => {
        const focusInstruction = params.focusAreas?.length
          ? ` Focus on: ${params.focusAreas.join(", ")}.`
          : "";

        const res = await perplexity.deepResearch(
          `Comprehensive research on: ${params.topic}.${focusInstruction}`,
          { maxSteps, language }
        );

        const searchResults: SearchResult[] = res.citations.map((c) => ({
          url: c.url,
          title: c.title || "",
          snippet: c.snippet || "",
          source: "perplexity" as const,
        }));

        // Store the deep research synthesis
        if (res.text) {
          sections.push(`## Perplexity Deep Research Analysis\n\n${res.text}`);
        }

        return searchResults;
      },
    });

    if (step1.exa) allResults.push(...step1.exa);
    if (step1.firecrawl) allResults.push(...step1.firecrawl);
    if (step1.perplexity) allResults.push(...step1.perplexity);
    allErrors.push(...step1.errors);

    // --- Step 2: Expanded search on focus areas (deep/exhaustive) ---
    if ((depth === "deep" || depth === "exhaustive") && params.focusAreas?.length) {
      const focusPromises = params.focusAreas.slice(0, 5).map(async (area) => {
        const subResults = await parallelServices({
          exa: async () => {
            const res = await exa.search(`${params.topic} ${area}`, {
              numResults: 15,
              text: true,
              highlights: true,
            });
            return res.results.map((r): SearchResult => ({
              url: r.url,
              title: r.title,
              snippet: r.highlights?.join(" ") || r.text?.slice(0, 300) || "",
              content: r.text,
              publishedDate: r.publishedDate,
              source: "exa",
            }));
          },
          firecrawl: async () => {
            const res = await firecrawl.search(`${params.topic} ${area}`, {
              limit: 15,
              scrapeOptions: { formats: ["markdown"] },
            });
            return (res.data || []).map((r): SearchResult => ({
              url: r.url,
              title: r.title || "",
              snippet: r.description || r.markdown?.slice(0, 300) || "",
              content: r.markdown,
              source: "firecrawl",
            }));
          },
          perplexity: async () => {
            const res = await perplexity.search(
              `${params.topic}: detailed analysis of ${area}`,
              { language }
            );
            if (res.text) {
              sections.push(`## Focus: ${area}\n\n${res.text}`);
            }
            return res.citations.map((c): SearchResult => ({
              url: c.url,
              title: c.title || "",
              snippet: c.snippet || "",
              source: "perplexity",
            }));
          },
        });

        if (subResults.exa) allResults.push(...subResults.exa);
        if (subResults.firecrawl) allResults.push(...subResults.firecrawl);
        if (subResults.perplexity) allResults.push(...subResults.perplexity);
        allErrors.push(...subResults.errors);
      });

      await Promise.all(focusPromises);
    }

    // --- Step 3: Exhaustive - additional query variations ---
    if (depth === "exhaustive") {
      const variations = [
        `${params.topic} analysis`,
        `${params.topic} comparison review`,
        `${params.topic} latest trends`,
      ];

      const varPromises = variations.map(async (v) => {
        const [exaRes, fcRes] = await Promise.all([
          exa.search(v, { numResults: 10, text: true }).catch(() => null),
          firecrawl.search(v, { limit: 10 }).catch(() => null),
        ]);

        if (exaRes) {
          allResults.push(
            ...exaRes.results.map((r): SearchResult => ({
              url: r.url,
              title: r.title,
              snippet: r.text?.slice(0, 300) || "",
              publishedDate: r.publishedDate,
              source: "exa",
            }))
          );
        }
        if (fcRes) {
          allResults.push(
            ...(fcRes.data || []).map((r): SearchResult => ({
              url: r.url,
              title: r.title || "",
              snippet: r.description || "",
              source: "firecrawl",
            }))
          );
        }
      });

      await Promise.all(varPromises);
    }

    // --- Compile output ---
    const merged = rankByRelevance(mergeResults(allResults));

    const output = [
      `# Deep Research: ${params.topic}\n`,
      `**Depth:** ${depth} | **Total unique sources:** ${merged.length} | **Focus areas:** ${params.focusAreas?.join(", ") || "general"}\n`,
      ...sections,
      `\n---\n`,
      formatSearchResults(merged, { showContent: false, maxResults: 100 }),
      formatErrors(allErrors),
    ].join("\n");

    return { content: [{ type: "text", text: output }] };
  };
}
