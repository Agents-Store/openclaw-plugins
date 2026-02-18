import type { ExaClient } from "../clients/exa";
import type { FirecrawlClient } from "../clients/firecrawl";
import type { PerplexityClient } from "../clients/perplexity";
import { parallelServices } from "../utils/parallel";
import { mergeResults, rankByRelevance, type SearchResult } from "../utils/dedup";
import { formatSearchResults, formatErrors } from "../utils/formatters";

export const DATE_SEARCH_DEF = {
  name: "date_search",
  description:
    "Search the web with strict date range filtering. All three services (Exa, Firecrawl, Perplexity) are queried in parallel with date constraints. Use for finding content published within a specific time period.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      dateFrom: {
        type: "string",
        description: "Start date in ISO format (YYYY-MM-DD), e.g. '2024-01-01'",
      },
      dateTo: {
        type: "string",
        description: "End date in ISO format (YYYY-MM-DD), e.g. '2024-12-31'",
      },
      domains: {
        type: "array",
        items: { type: "string" },
        description: "Restrict to specific domains",
      },
      numResults: {
        type: "number",
        description: "Number of results per service (default: 30)",
      },
    },
    required: ["query", "dateFrom", "dateTo"],
  },
};

/**
 * Convert ISO dates to Firecrawl tbs format: cdr:1,cd_min:MM/DD/YYYY,cd_max:MM/DD/YYYY
 */
function toFirecrawlTbs(dateFrom: string, dateTo: string): string {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const fmtDate = (d: Date) =>
    `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  return `cdr:1,cd_min:${fmtDate(from)},cd_max:${fmtDate(to)}`;
}

/**
 * Determine Perplexity recency filter based on date range.
 */
function toPerplexityRecency(dateFrom: string): "day" | "week" | "month" | "year" | undefined {
  const from = new Date(dateFrom);
  const now = new Date();
  const diffDays = (now.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays <= 1) return "day";
  if (diffDays <= 7) return "week";
  if (diffDays <= 30) return "month";
  if (diffDays <= 365) return "year";
  return undefined; // No filter for very old dates
}

export function createDateSearch(
  exa: ExaClient,
  firecrawl: FirecrawlClient,
  perplexity: PerplexityClient,
  defaultNumResults: number
) {
  return async (_id: string, params: {
    query: string;
    dateFrom: string;
    dateTo: string;
    domains?: string[];
    numResults?: number;
  }) => {
    const numResults = params.numResults ?? defaultNumResults;

    const results = await parallelServices({
      exa: async () => {
        const res = await exa.search(params.query, {
          numResults,
          startPublishedDate: params.dateFrom,
          endPublishedDate: params.dateTo,
          includeDomains: params.domains,
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
          tbs: toFirecrawlTbs(params.dateFrom, params.dateTo),
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
        const recency = toPerplexityRecency(params.dateFrom);
        const res = await perplexity.search(
          `${params.query} (published between ${params.dateFrom} and ${params.dateTo})`,
          {
            searchDomainFilter: params.domains,
            searchRecencyFilter: recency,
          }
        );
        const searchResults: SearchResult[] = res.citations.map((c) => ({
          url: c.url,
          title: c.title || "",
          snippet: c.snippet || "",
          source: "perplexity" as const,
        }));

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
    });

    const allResults: SearchResult[] = [];
    if (results.exa) allResults.push(...results.exa);
    if (results.firecrawl) allResults.push(...results.firecrawl);
    if (results.perplexity) allResults.push(...results.perplexity);

    const merged = rankByRelevance(mergeResults(allResults));
    const header = `## Date-filtered Search: ${params.dateFrom} to ${params.dateTo}\n\n`;
    const output = header + formatSearchResults(merged, { showContent: false }) + formatErrors(results.errors);

    return { content: [{ type: "text", text: output }] };
  };
}
