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

  // API keys: config takes priority, env variables as fallback
  const exaApiKey = config.exaApiKey || process.env.EXA_API_KEY || "";
  const firecrawlApiKey = config.firecrawlApiKey || process.env.FIRECRAWL_API_KEY || "";
  const perplexityApiKey = config.perplexityApiKey || process.env.PERPLEXITY_API_KEY || "";
  const defaultNumResults = config.defaultNumResults ?? 20;
  const defaultLanguage = config.defaultLanguage ?? "en";
  const debugMode = config.debugMode ?? false;

  // Build logger — in debug mode, debug() logs via api.logger.info; otherwise only warn/error
  const logger = {
    debug: (...args: any[]) => {
      if (debugMode) api.logger?.info?.(...args);
    },
    info: (...args: any[]) => api.logger?.info?.(...args),
    warn: (...args: any[]) => api.logger?.warn?.(...args),
    error: (...args: any[]) => api.logger?.error?.(...args),
  };

  // Validate API keys
  const missing: string[] = [];
  if (!exaApiKey) missing.push("exaApiKey (or env EXA_API_KEY)");
  if (!firecrawlApiKey) missing.push("firecrawlApiKey (or env FIRECRAWL_API_KEY)");
  if (!perplexityApiKey) missing.push("perplexityApiKey (or env PERPLEXITY_API_KEY)");

  if (missing.length > 0) {
    logger.warn(
      `[deep-research] Missing API keys: ${missing.join(", ")}. Configure in Control UI, openclaw.json, or environment variables.`
    );
  }

  // Initialize clients with logger
  const exa = new ExaClient(exaApiKey || "", logger);
  const firecrawl = new FirecrawlClient(firecrawlApiKey || "", logger);
  const perplexity = new PerplexityClient(perplexityApiKey || "", logger);

  // --- Register 8 tools ---

  api.registerTool({
    ...DEEP_SEARCH_DEF,
    execute: createDeepSearch(exa, firecrawl, perplexity, defaultNumResults, logger),
  });

  api.registerTool({
    ...DEEP_RESEARCH_DEF,
    execute: createDeepResearch(exa, firecrawl, perplexity, defaultLanguage, logger),
  });

  api.registerTool({
    ...MASS_SUMMARY_DEF,
    execute: createMassSummary(exa, firecrawl, perplexity, logger),
  });

  api.registerTool({
    ...DATE_SEARCH_DEF,
    execute: createDateSearch(exa, firecrawl, perplexity, defaultNumResults, logger),
  });

  api.registerTool({
    ...COMPARE_OFFERS_DEF,
    execute: createCompareOffers(exa, firecrawl, perplexity, logger),
  });

  api.registerTool({
    ...SCRAPE_EXTRACT_DEF,
    execute: createScrapeAndExtract(exa, firecrawl, perplexity, logger),
  });

  api.registerTool({
    ...SITE_SEARCH_DEF,
    execute: createSiteSearch(exa, firecrawl, perplexity, defaultNumResults, logger),
  });

  api.registerTool({
    ...FIND_SIMILAR_DEF,
    execute: createFindSimilar(exa, firecrawl, perplexity, defaultNumResults, logger),
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
    name: "drstatus",
    description: "Check Deep Research plugin status and API key configuration",
    acceptsArgs: false,
    requireAuth: true,
    handler: () => {
      const keySource = (cfgVal: string, envName: string) => {
        if (cfgVal && config[cfgVal === exaApiKey ? "exaApiKey" : cfgVal === firecrawlApiKey ? "firecrawlApiKey" : "perplexityApiKey"])
          return "config";
        if (process.env[envName]) return "env";
        return null;
      };

      const exaOk = !!exaApiKey;
      const fcOk = !!firecrawlApiKey;
      const ppOk = !!perplexityApiKey;
      const allOk = exaOk && fcOk && ppOk;

      const status = (ok: boolean, src: string | null) =>
        ok ? `configured (${src})` : "MISSING";

      return {
        text: [
          `Deep Research Plugin v0.1.3`,
          ``,
          `API Keys:`,
          `  Exa.ai:     ${status(exaOk, keySource(exaApiKey, "EXA_API_KEY"))}`,
          `  Firecrawl:  ${status(fcOk, keySource(firecrawlApiKey, "FIRECRAWL_API_KEY"))}`,
          `  Perplexity: ${status(ppOk, keySource(perplexityApiKey, "PERPLEXITY_API_KEY"))}`,
          ``,
          `Settings:`,
          `  Default results/service: ${defaultNumResults}`,
          `  Default language: ${defaultLanguage}`,
          `  Debug mode: ${debugMode ? "ON" : "OFF"}`,
          ``,
          allOk
            ? "All services ready. 8 search tools available."
            : "WARNING: Missing keys. Set in Control UI, openclaw.json, or env vars (EXA_API_KEY, FIRECRAWL_API_KEY, PERPLEXITY_API_KEY).",
          ``,
          `Available tools: deep_search, deep_research, mass_summary, date_search, compare_offers, scrape_and_extract, site_search, find_similar`,
          ``,
          `Diagnostics: Run /drdebug to test API connectivity`,
        ].join("\n"),
      };
    },
  });

  api.registerCommand({
    name: "drdebug",
    description: "Test API connectivity for all 3 services (Exa, Firecrawl, Perplexity)",
    acceptsArgs: false,
    requireAuth: true,
    handler: async () => {
      const lines: string[] = [
        `Deep Research — Diagnostic Test`,
        `================================`,
        ``,
      ];

      // Test Exa
      lines.push(`[Exa.ai]`);
      if (!exaApiKey) {
        lines.push(`  SKIP — no API key configured\n`);
      } else {
        try {
          const start = Date.now();
          const res = await exa.search("test", { numResults: 1, type: "fast" });
          const ms = Date.now() - start;
          lines.push(`  OK — ${res.results.length} result(s) in ${ms}ms`);
          lines.push(`  Key: ${exaApiKey.slice(0, 6)}...${exaApiKey.slice(-4)}\n`);
        } catch (e: any) {
          lines.push(`  FAILED — ${e.message}\n`);
        }
      }

      // Test Firecrawl
      lines.push(`[Firecrawl]`);
      if (!firecrawlApiKey) {
        lines.push(`  SKIP — no API key configured\n`);
      } else {
        try {
          const start = Date.now();
          const res = await firecrawl.search("test", { limit: 1 });
          const ms = Date.now() - start;
          lines.push(`  OK — ${res.data?.length ?? 0} result(s) in ${ms}ms`);
          lines.push(`  Key: ${firecrawlApiKey.slice(0, 6)}...${firecrawlApiKey.slice(-4)}\n`);
        } catch (e: any) {
          lines.push(`  FAILED — ${e.message}\n`);
        }
      }

      // Test Perplexity
      lines.push(`[Perplexity]`);
      if (!perplexityApiKey) {
        lines.push(`  SKIP — no API key configured\n`);
      } else {
        try {
          const start = Date.now();
          const res = await perplexity.fastSearch("test");
          const ms = Date.now() - start;
          lines.push(`  OK — ${res.text.length} chars, ${res.citations.length} citations in ${ms}ms`);
          lines.push(`  Key: ${perplexityApiKey.slice(0, 6)}...${perplexityApiKey.slice(-4)}\n`);
        } catch (e: any) {
          lines.push(`  FAILED — ${e.message}\n`);
        }
      }

      lines.push(`---`);
      lines.push(`Debug mode: ${debugMode ? "ON — verbose logging to gateway logs" : "OFF — set \"debugMode\": true in config to enable"}`);

      return { text: lines.join("\n") };
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
      debugMode,
    });
  });

  logger.info(
    `[deep-research] Plugin loaded. Services: Exa=${!!exaApiKey}, Firecrawl=${!!firecrawlApiKey}, Perplexity=${!!perplexityApiKey}. Debug=${debugMode}. 8 tools registered.`
  );
}
