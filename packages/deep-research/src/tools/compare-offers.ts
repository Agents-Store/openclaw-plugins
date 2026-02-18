import type { ExaClient } from "../clients/exa";
import type { FirecrawlClient } from "../clients/firecrawl";
import type { PerplexityClient } from "../clients/perplexity";
import { parallelServices } from "../utils/parallel";
import { mergeResults, rankByRelevance, type SearchResult } from "../utils/dedup";
import { formatComparison, formatErrors } from "../utils/formatters";

export const COMPARE_OFFERS_DEF = {
  name: "compare_offers",
  description:
    "Find and compare offers, products, or services from the web. Searches across all three services, then uses Firecrawl structured extraction to pull out pricing, features, and ratings. Perplexity provides analysis and recommendations. Use for comparing products, rentals, vacation deals, services, etc.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "What to search for (e.g. 'apartment rental in Barcelona', 'best noise-cancelling headphones 2024')",
      },
      criteria: {
        type: "array",
        items: { type: "string" },
        description: "Comparison criteria (e.g. ['price', 'location', 'rating', 'features']). Auto-detected if not provided.",
      },
      numOffers: {
        type: "number",
        description: "Number of offers to find (default: 30)",
      },
      domains: {
        type: "array",
        items: { type: "string" },
        description: "Preferred domains to search (e.g. ['booking.com', 'airbnb.com'])",
      },
    },
    required: ["query"],
  },
};

export function createCompareOffers(
  exa: ExaClient,
  firecrawl: FirecrawlClient,
  perplexity: PerplexityClient
) {
  return async (_id: string, params: {
    query: string;
    criteria?: string[];
    numOffers?: number;
    domains?: string[];
  }) => {
    const numOffers = params.numOffers ?? 30;
    const criteria = params.criteria ?? ["name", "price", "rating", "key_features"];
    const allErrors: string[] = [];

    // --- Step 1: Search for offers across all services ---
    const searchResults = await parallelServices({
      exa: async () => {
        const res = await exa.search(params.query, {
          numResults: numOffers,
          includeDomains: params.domains,
          category: "company",
          text: true,
          highlights: true,
        });
        return res.results.map((r): SearchResult => ({
          url: r.url,
          title: r.title,
          snippet: r.highlights?.join(" ") || r.text?.slice(0, 300) || "",
          content: r.text,
          source: "exa",
          score: r.score,
        }));
      },

      firecrawl: async () => {
        const domainQ = params.domains?.length
          ? `${params.domains.map((d) => `site:${d}`).join(" OR ")} ${params.query}`
          : params.query;
        const res = await firecrawl.search(domainQ, {
          limit: numOffers,
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
          `Best ${params.query} - compare prices, features, ratings. List specific offers with details.`,
          { preset: "pro-search" }
        );
        return {
          text: res.text,
          citations: res.citations.map((c): SearchResult => ({
            url: c.url,
            title: c.title || "",
            snippet: c.snippet || "",
            source: "perplexity" as const,
          })),
        };
      },
    });

    allErrors.push(...searchResults.errors);

    const allSearchResults: SearchResult[] = [];
    if (searchResults.exa) allSearchResults.push(...searchResults.exa);
    if (searchResults.firecrawl) allSearchResults.push(...searchResults.firecrawl);
    if (searchResults.perplexity) allSearchResults.push(...searchResults.perplexity.citations);

    const merged = rankByRelevance(mergeResults(allSearchResults));

    // --- Step 2: Extract structured data via Firecrawl ---
    const topUrls = merged.slice(0, 20).map((r) => r.url).filter((u) => !u.startsWith("perplexity://"));

    let extractedData: Record<string, any>[] = [];

    if (topUrls.length > 0) {
      const extractionSchema = {
        type: "object",
        properties: Object.fromEntries(
          criteria.map((c) => [c, { type: "string" }])
        ),
      };

      try {
        const extracted = await firecrawl.extract(topUrls, {
          prompt: `Extract the following for each offer/product related to "${params.query}": ${criteria.join(", ")}. Return structured data.`,
          schema: extractionSchema,
        });

        if (extracted.success && extracted.data) {
          // Data can be a single object or array
          const items = Array.isArray(extracted.data) ? extracted.data : [extracted.data];
          extractedData = items.map((item, i) => ({
            ...item,
            url: topUrls[i] || "",
            source: "firecrawl-extract",
          }));
        }
      } catch (e) {
        allErrors.push(`[Extract] ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // --- Step 3: Perplexity analysis and recommendations ---
    let analysis = "";
    const perplexitySynthesis = searchResults.perplexity?.text;

    if (perplexitySynthesis) {
      analysis = perplexitySynthesis;
    }

    if (extractedData.length > 0) {
      try {
        const analysisRes = await perplexity.search(
          `Analyze and rank these ${extractedData.length} offers for "${params.query}". Data: ${JSON.stringify(extractedData).slice(0, 15000)}. Criteria: ${criteria.join(", ")}. Provide top recommendations with reasoning.`,
          { preset: "pro-search" }
        );
        if (analysisRes.text) {
          analysis = analysisRes.text;
        }
      } catch {
        // Keep the initial Perplexity synthesis as fallback
      }
    }

    // --- Compile output ---
    const output: string[] = [
      `# Offer Comparison: ${params.query}\n`,
      `**Offers found:** ${merged.length} | **Extracted data:** ${extractedData.length} items\n`,
    ];

    if (extractedData.length > 0) {
      output.push(formatComparison(extractedData, criteria));
    }

    if (analysis) {
      output.push(`\n## Analysis & Recommendations\n\n${analysis}`);
    }

    output.push(`\n## All Sources\n`);
    for (let i = 0; i < Math.min(merged.length, 50); i++) {
      const r = merged[i];
      output.push(`${i + 1}. [${r.title}](${r.url}) — ${r.sources.map((s) => `\`${s}\``).join(" ")}`);
    }

    output.push(formatErrors(allErrors));

    return { content: [{ type: "text", text: output.join("\n") }] };
  };
}
