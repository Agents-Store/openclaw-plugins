import { ExaClient } from "./clients/exa";
import { FirecrawlClient } from "./clients/firecrawl";
import { PerplexityClient } from "./clients/perplexity";

import { DEEP_SEARCH_DEF, createDeepSearch } from "./tools/deep-search";
import { DEEP_RESEARCH_DEF, createDeepResearch } from "./tools/deep-research";
import { MASS_SUMMARY_DEF, createMassSummary } from "./tools/mass-summary";
import { DATE_SEARCH_DEF, createDateSearch } from "./tools/date-search";
import { COMPARE_OFFERS_DEF, createCompareOffers } from "./tools/compare-offers";
import { SCRAPE_EXTRACT_DEF, createScrapeAndExtract } from "./tools/scrape-extract";
import { SITE_SEARCH_DEF, createSiteSearch } from "./tools/site-search";
import { FIND_SIMILAR_DEF, createFindSimilar } from "./tools/find-similar";

export default function register(api: any) {
  const config = api.config?.plugins?.entries?.["deep-research"]?.config ?? {};

  const exaApiKey = config.exaApiKey;
  const firecrawlApiKey = config.firecrawlApiKey;
  const perplexityApiKey = config.perplexityApiKey;
  const defaultNumResults = config.defaultNumResults ?? 20;
  const defaultLanguage = config.defaultLanguage ?? "en";

  // Validate API keys
  const missing: string[] = [];
  if (!exaApiKey) missing.push("exaApiKey");
  if (!firecrawlApiKey) missing.push("firecrawlApiKey");
  if (!perplexityApiKey) missing.push("perplexityApiKey");

  if (missing.length > 0) {
    api.logger?.warn?.(
      `[deep-research] Missing API keys: ${missing.join(", ")}. Configure them in plugin settings.`
    );
  }

  // Initialize clients
  const exa = new ExaClient(exaApiKey || "");
  const firecrawl = new FirecrawlClient(firecrawlApiKey || "");
  const perplexity = new PerplexityClient(perplexityApiKey || "");

  // --- Register 8 tools ---

  api.registerTool({
    ...DEEP_SEARCH_DEF,
    execute: createDeepSearch(exa, firecrawl, perplexity, defaultNumResults),
  });

  api.registerTool({
    ...DEEP_RESEARCH_DEF,
    execute: createDeepResearch(exa, firecrawl, perplexity, defaultLanguage),
  });

  api.registerTool({
    ...MASS_SUMMARY_DEF,
    execute: createMassSummary(exa, firecrawl, perplexity),
  });

  api.registerTool({
    ...DATE_SEARCH_DEF,
    execute: createDateSearch(exa, firecrawl, perplexity, defaultNumResults),
  });

  api.registerTool({
    ...COMPARE_OFFERS_DEF,
    execute: createCompareOffers(exa, firecrawl, perplexity),
  });

  api.registerTool({
    ...SCRAPE_EXTRACT_DEF,
    execute: createScrapeAndExtract(exa, firecrawl, perplexity),
  });

  api.registerTool({
    ...SITE_SEARCH_DEF,
    execute: createSiteSearch(exa, firecrawl, perplexity, defaultNumResults),
  });

  api.registerTool({
    ...FIND_SIMILAR_DEF,
    execute: createFindSimilar(exa, firecrawl, perplexity, defaultNumResults),
  });

  // --- Slash commands ---

  api.registerCommand({
    name: "research",
    description: "Start a deep research on a topic (pass topic as argument)",
    acceptsArgs: true,
    requireAuth: true,
    handler: (ctx: any) => {
      if (!ctx.args?.trim()) {
        return { text: "Usage: /research <topic>\nExample: /research AI regulation in Europe" };
      }
      return {
        text: `Starting deep research on: "${ctx.args}"\n\nThe AI will now use the deep_research tool to explore this topic using Exa.ai, Firecrawl, and Perplexity in parallel.`,
      };
    },
  });

  api.registerCommand({
    name: "research-status",
    description: "Check Deep Research plugin status and API key configuration",
    acceptsArgs: false,
    requireAuth: true,
    handler: () => {
      const exaOk = !!exaApiKey;
      const fcOk = !!firecrawlApiKey;
      const ppOk = !!perplexityApiKey;
      const allOk = exaOk && fcOk && ppOk;

      return {
        text: [
          `Deep Research Plugin Status`,
          ``,
          `API Keys:`,
          `  Exa.ai:     ${exaOk ? "configured" : "MISSING"}`,
          `  Firecrawl:  ${fcOk ? "configured" : "MISSING"}`,
          `  Perplexity: ${ppOk ? "configured" : "MISSING"}`,
          ``,
          `Settings:`,
          `  Default results/service: ${defaultNumResults}`,
          `  Default language: ${defaultLanguage}`,
          ``,
          allOk
            ? "All services ready. 8 search tools available."
            : "WARNING: Some API keys are missing. Configure them in plugin settings.",
          ``,
          `Available tools: deep_search, deep_research, mass_summary, date_search, compare_offers, scrape_and_extract, site_search, find_similar`,
        ].join("\n"),
      };
    },
  });

  // --- Gateway RPC method ---

  api.registerGatewayMethod("deep-research.status", ({ respond }: any) => {
    respond(true, {
      status: "ok",
      services: {
        exa: !!exaApiKey,
        firecrawl: !!firecrawlApiKey,
        perplexity: !!perplexityApiKey,
      },
      tools: 8,
      defaultNumResults,
      defaultLanguage,
    });
  });

  api.logger?.info?.(
    `[deep-research] Plugin loaded. Services: Exa=${!!exaApiKey}, Firecrawl=${!!firecrawlApiKey}, Perplexity=${!!perplexityApiKey}. 8 tools registered.`
  );
}
