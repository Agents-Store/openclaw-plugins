import type { ExaClient } from "../clients/exa";
import type { FirecrawlClient } from "../clients/firecrawl";
import type { PerplexityClient } from "../clients/perplexity";
import { parallelServices } from "../utils/parallel";
import { formatErrors } from "../utils/formatters";

export const SCRAPE_EXTRACT_DEF = {
  name: "scrape_and_extract",
  description:
    "Deep scrape specific URLs and extract content using all three services. Exa provides text and summaries, Firecrawl scrapes full markdown and structured data, Perplexity analyzes the content. Use when you have specific URLs to analyze in depth.",
  parameters: {
    type: "object",
    properties: {
      urls: {
        type: "array",
        items: { type: "string" },
        description: "URLs to scrape and extract from (max 20)",
      },
      extractPrompt: {
        type: "string",
        description: "What to extract from the pages (e.g. 'Extract all pricing information and feature lists')",
      },
      extractSchema: {
        type: "object",
        description: "Optional JSON Schema for structured extraction via Firecrawl",
      },
      formats: {
        type: "array",
        items: { type: "string", enum: ["markdown", "summary", "html", "links"] },
        description: "Content formats to request (default: ['markdown', 'summary'])",
      },
    },
    required: ["urls"],
  },
};

export function createScrapeAndExtract(
  exa: ExaClient,
  firecrawl: FirecrawlClient,
  perplexity: PerplexityClient
) {
  return async (_id: string, params: {
    urls: string[];
    extractPrompt?: string;
    extractSchema?: Record<string, any>;
    formats?: string[];
  }) => {
    const urls = params.urls.slice(0, 20);
    const formats = (params.formats ?? ["markdown", "summary"]) as any[];
    const allErrors: string[] = [];

    const results = await parallelServices({
      exa: async () => {
        const res = await exa.getContents(urls, {
          text: true,
          highlights: true,
          summary: params.extractPrompt ? { query: params.extractPrompt } : true,
        });
        return res.results;
      },

      firecrawl: async () => {
        // Scrape each URL in parallel
        const scrapePromises = urls.map((url) =>
          firecrawl.scrape(url, { formats }).catch(() => null)
        );
        const scrapeResults = await Promise.all(scrapePromises);

        // Also do structured extraction if prompt is provided
        let extractResult: Record<string, any> | null = null;
        if (params.extractPrompt) {
          try {
            const extracted = await firecrawl.extract(urls, {
              prompt: params.extractPrompt,
              schema: params.extractSchema,
            });
            if (extracted.success) {
              extractResult = extracted.data;
            }
          } catch {
            // Extraction failed, continue with scrape results
          }
        }

        return {
          scrapes: scrapeResults.map((r, i) => ({
            url: urls[i],
            data: r?.data ?? null,
          })),
          extraction: extractResult,
        };
      },

      perplexity: async () => {
        const prompt = params.extractPrompt
          ? `Analyze these URLs and ${params.extractPrompt}: ${urls.join(", ")}`
          : `Analyze and summarize the content of these pages: ${urls.join(", ")}`;

        const res = await perplexity.search(prompt, { preset: "pro-search" });
        return res;
      },
    });

    allErrors.push(...results.errors);

    // --- Compile output ---
    const output: string[] = [
      `# Scrape & Extract: ${urls.length} URLs\n`,
    ];

    // Exa results
    if (results.exa) {
      output.push(`## Content (Exa)\n`);
      for (const r of results.exa) {
        output.push(`### [${r.title}](${r.url})\n`);
        if (r.summary) output.push(`**Summary:** ${r.summary}\n`);
        if (r.highlights?.length) {
          output.push(`**Key highlights:**`);
          for (const h of r.highlights) output.push(`- ${h}`);
          output.push("");
        }
        if (r.text) {
          output.push(`<details><summary>Full text</summary>\n\n${r.text.slice(0, 5000)}\n\n</details>\n`);
        }
      }
    }

    // Firecrawl results
    if (results.firecrawl) {
      output.push(`## Content (Firecrawl)\n`);
      for (const { url, data } of results.firecrawl.scrapes) {
        if (!data) continue;
        output.push(`### [${data.metadata?.title || url}](${url})\n`);
        if (data.summary) output.push(`**Summary:** ${data.summary}\n`);
        if (data.markdown) {
          output.push(`<details><summary>Markdown content</summary>\n\n${data.markdown.slice(0, 5000)}\n\n</details>\n`);
        }
      }

      if (results.firecrawl.extraction) {
        output.push(`## Structured Extraction\n`);
        output.push("```json");
        output.push(JSON.stringify(results.firecrawl.extraction, null, 2).slice(0, 10000));
        output.push("```\n");
      }
    }

    // Perplexity analysis
    if (results.perplexity?.text) {
      output.push(`## Analysis (Perplexity)\n\n${results.perplexity.text}\n`);
    }

    output.push(formatErrors(allErrors));

    return { content: [{ type: "text", text: output.join("\n") }] };
  };
}
