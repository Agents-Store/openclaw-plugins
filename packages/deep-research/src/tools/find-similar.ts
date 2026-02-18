import type { ExaClient } from "../clients/exa";
import type { FirecrawlClient } from "../clients/firecrawl";
import type { PerplexityClient } from "../clients/perplexity";
import { parallelServices, type Logger } from "../utils/parallel";
import { mergeResults, rankByRelevance, type SearchResult } from "../utils/dedup";
import { formatSearchResults, formatErrors, formatServiceStatus } from "../utils/formatters";

export const FIND_SIMILAR_DEF = {
  name: "find_similar",
  description:
    "Find similar content to a given URL. Uses Exa's findSimilar API, Firecrawl to scrape and search by content summary, and Perplexity to find related pages. Use when you have a good reference page and want more like it.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Reference URL to find similar content for",
      },
      numResults: {
        type: "number",
        description: "Number of similar results to find (default: 20)",
      },
      excludeDomains: {
        type: "array",
        items: { type: "string" },
        description: "Exclude these domains from results",
      },
    },
    required: ["url"],
  },
};

export function createFindSimilar(
  exa: ExaClient,
  firecrawl: FirecrawlClient,
  perplexity: PerplexityClient,
  defaultNumResults: number,
  logger?: Logger
) {
  return async (_id: string, params: {
    url: string;
    numResults?: number;
    excludeDomains?: string[];
  }) => {
    const numResults = params.numResults ?? defaultNumResults;
    const allErrors: string[] = [];

    // --- Step 1: Get content of the reference URL ---
    const [exaContent, fcContent] = await Promise.all([
      exa.getContents([params.url], { text: true, summary: true }).catch(() => null),
      firecrawl.scrape(params.url, { formats: ["summary", "markdown"] }).catch(() => null),
    ]);

    const title = exaContent?.results?.[0]?.title || fcContent?.data?.metadata?.title || params.url;
    const summary =
      exaContent?.results?.[0]?.summary ||
      fcContent?.data?.summary ||
      exaContent?.results?.[0]?.text?.slice(0, 500) ||
      fcContent?.data?.markdown?.slice(0, 500) ||
      "";

    if (!summary) {
      allErrors.push("Could not extract content from reference URL for similarity search");
    }

    logger?.info?.(`[find_similar] url="${params.url}" summary=${summary.length} chars`);

    // --- Step 2: Search for similar content in parallel ---
    const results = await parallelServices({
      exa: async () => {
        const res = await exa.findSimilar(params.url, {
          numResults,
          excludeDomains: params.excludeDomains,
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
        if (!summary) return [];
        // Use summary as search query to find similar content
        const searchQuery = summary.slice(0, 200);
        const res = await firecrawl.search(searchQuery, {
          limit: numResults,
          scrapeOptions: { formats: ["markdown"] },
        });
        return (res.data || [])
          .filter((r) => r.url !== params.url)
          .map((r): SearchResult => ({
            url: r.url,
            title: r.title || "",
            snippet: r.description || r.markdown?.slice(0, 300) || "",
            content: r.markdown,
            source: "firecrawl",
          }));
      },

      perplexity: async () => {
        const searchQuery = summary
          ? `Find similar articles and resources to: "${title}". Content: ${summary.slice(0, 300)}`
          : `Find content similar to ${params.url}`;

        const res = await perplexity.search(searchQuery, { preset: "pro-search" });
        const searchResults: SearchResult[] = res.citations
          .filter((c) => c.url !== params.url)
          .map((c) => ({
            url: c.url,
            title: c.title || "",
            snippet: c.snippet || "",
            source: "perplexity" as const,
          }));

        if (res.text) {
          searchResults.unshift({
            url: "perplexity://synthesis",
            title: "Perplexity Analysis",
            snippet: res.text.slice(0, 500),
            content: res.text,
            source: "perplexity",
          });
        }

        return searchResults;
      },
    }, logger);

    allErrors.push(...results.errors);

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

    const output = [
      `# Find Similar: [${title}](${params.url})\n`,
      status,
      summary ? `> ${summary.slice(0, 300)}\n` : "",
      `**Similar results found:** ${merged.length}\n`,
      formatSearchResults(merged, { showContent: false }),
      formatErrors(allErrors),
    ].join("\n");

    return { content: [{ type: "text", text: output }] };
  };
}
