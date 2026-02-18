import type { ExaClient } from "../clients/exa";
import type { FirecrawlClient } from "../clients/firecrawl";
import type { PerplexityClient } from "../clients/perplexity";
import { parallelServices, type Logger } from "../utils/parallel";
import { mergeResults, rankByRelevance, type SearchResult } from "../utils/dedup";
import { formatSearchResults, formatErrors, formatServiceStatus } from "../utils/formatters";

export const DEEP_SEARCH_DEF = {
  name: "deep_search",
  description:
    "Powerful multi-service web search using Exa.ai, Firecrawl, and Perplexity in parallel. Returns deduplicated, ranked results from all three services. Use this for general web searches that need comprehensive coverage.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      numResults: {
        type: "number",
        description: "Number of results per service (default: 20, max: 50)",
      },
      domains: {
        type: "array",
        items: { type: "string" },
        description: "Restrict search to these domains only (e.g. ['arxiv.org', 'github.com'])",
      },
      excludeDomains: {
        type: "array",
        items: { type: "string" },
        description: "Exclude these domains from results",
      },
      category: {
        type: "string",
        enum: ["news", "research paper", "company", "tweet", "personal site"],
        description: "Filter by content category (Exa-specific, applied where supported)",
      },
    },
    required: ["query"],
  },
};

export function createDeepSearch(
  exa: ExaClient,
  firecrawl: FirecrawlClient,
  perplexity: PerplexityClient,
  defaultNumResults: number,
  logger?: Logger
) {
  return async (_id: string, params: {
    query: string;
    numResults?: number;
    domains?: string[];
    excludeDomains?: string[];
    category?: string;
  }) => {
    const numResults = Math.min(params.numResults ?? defaultNumResults, 50);

    logger?.info?.(`[deep_search] query="${params.query}" numResults=${numResults}`);

    const results = await parallelServices({
      exa: async () => {
        const res = await exa.search(params.query, {
          numResults,
          includeDomains: params.domains,
          excludeDomains: params.excludeDomains,
          category: params.category as any,
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
        const domainQuery = params.domains?.length
          ? `${params.domains.map((d) => `site:${d}`).join(" OR ")} ${params.query}`
          : params.query;

        const res = await firecrawl.search(domainQuery, {
          limit: numResults,
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
        const res = await perplexity.search(params.query, {
          searchDomainFilter: params.domains,
        });
        const searchResults: SearchResult[] = res.citations.map((c) => ({
          url: c.url,
          title: c.title || "",
          snippet: c.snippet || "",
          source: "perplexity" as const,
        }));

        // Add the Perplexity synthesis as a special result if available
        if (res.text) {
          searchResults.unshift({
            url: "perplexity://synthesis",
            title: "Perplexity AI Summary",
            snippet: res.text.slice(0, 500),
            content: res.text,
            source: "perplexity",
          });
        }

        return searchResults;
      },
    }, logger);

    // Collect all results from services that succeeded
    const allResults: SearchResult[] = [];
    if (results.exa) allResults.push(...results.exa);
    if (results.firecrawl) allResults.push(...results.firecrawl);
    if (results.perplexity) allResults.push(...results.perplexity);

    const merged = rankByRelevance(mergeResults(allResults));
    const status = formatServiceStatus({
      exa: results.exa !== null,
      firecrawl: results.firecrawl !== null,
      perplexity: results.perplexity !== null,
    });
    const output = status + formatSearchResults(merged, { showContent: false }) + formatErrors(results.errors);

    return { content: [{ type: "text", text: output }] };
  };
}
