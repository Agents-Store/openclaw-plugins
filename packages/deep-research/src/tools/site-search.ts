import type { ExaClient } from "../clients/exa";
import type { FirecrawlClient } from "../clients/firecrawl";
import type { PerplexityClient } from "../clients/perplexity";
import { parallelServices } from "../utils/parallel";
import { mergeResults, rankByRelevance, type SearchResult } from "../utils/dedup";
import { formatSearchResults, formatErrors } from "../utils/formatters";

export const SITE_SEARCH_DEF = {
  name: "site_search",
  description:
    "Search within specific domains/websites only. Uses all three services (Exa, Firecrawl, Perplexity) in parallel with domain restrictions. Firecrawl also maps the site to discover relevant pages. Use when you need content from particular websites.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      domains: {
        type: "array",
        items: { type: "string" },
        description: "Domains to search within (e.g. ['reddit.com', 'stackoverflow.com'])",
      },
      numResults: {
        type: "number",
        description: "Number of results per service (default: 20)",
      },
      mapSites: {
        type: "boolean",
        description: "Also discover/map URLs on these sites for broader coverage (default: false)",
      },
    },
    required: ["query", "domains"],
  },
};

export function createSiteSearch(
  exa: ExaClient,
  firecrawl: FirecrawlClient,
  perplexity: PerplexityClient,
  defaultNumResults: number
) {
  return async (_id: string, params: {
    query: string;
    domains: string[];
    numResults?: number;
    mapSites?: boolean;
  }) => {
    const numResults = params.numResults ?? defaultNumResults;

    const results = await parallelServices({
      exa: async () => {
        const res = await exa.search(params.query, {
          numResults,
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
        const siteQuery = `${params.domains.map((d) => `site:${d}`).join(" OR ")} ${params.query}`;
        const searchResults: SearchResult[] = [];

        // Search with site: operators
        const searchRes = await firecrawl.search(siteQuery, {
          limit: numResults,
          scrapeOptions: { formats: ["markdown"] },
        });

        for (const r of searchRes.data || []) {
          searchResults.push({
            url: r.url,
            title: r.title || "",
            snippet: r.description || r.markdown?.slice(0, 300) || "",
            content: r.markdown,
            source: "firecrawl",
          });
        }

        // Optionally map sites for broader discovery
        if (params.mapSites) {
          const mapPromises = params.domains.slice(0, 3).map((d) =>
            firecrawl.map(`https://${d}`, { search: params.query, limit: 20 }).catch(() => null)
          );
          const mapResults = await Promise.all(mapPromises);

          for (const mapRes of mapResults) {
            if (!mapRes?.links) continue;
            for (const link of mapRes.links) {
              searchResults.push({
                url: link.url,
                title: link.title || "",
                snippet: link.description || "",
                source: "firecrawl",
              });
            }
          }
        }

        return searchResults;
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
    const header = `## Site Search: ${params.domains.join(", ")}\n\n`;
    const output = header + formatSearchResults(merged) + formatErrors(results.errors);

    return { content: [{ type: "text", text: output }] };
  };
}
