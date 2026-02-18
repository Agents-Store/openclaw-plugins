import type { MergedResult } from "./dedup";

/**
 * Format merged search results as markdown.
 */
export function formatSearchResults(
  results: MergedResult[],
  options?: { showContent?: boolean; maxResults?: number }
): string {
  const max = options?.maxResults ?? results.length;
  const items = results.slice(0, max);

  if (items.length === 0) {
    return "No results found.";
  }

  const lines: string[] = [
    `## Search Results (${items.length} unique from ${countSources(items)} services)\n`,
  ];

  for (let i = 0; i < items.length; i++) {
    const r = items[i];
    const sourcesBadge = r.sources.map((s) => `\`${s}\``).join(" ");
    const datePart = r.publishedDate ? ` | ${r.publishedDate.slice(0, 10)}` : "";

    lines.push(`### ${i + 1}. [${r.title}](${r.url})`);
    lines.push(`Sources: ${sourcesBadge}${datePart}\n`);

    if (r.snippet) {
      lines.push(`> ${r.snippet.slice(0, 500)}\n`);
    }

    if (options?.showContent && r.content) {
      lines.push(`<details><summary>Full content</summary>\n\n${r.content.slice(0, 5000)}\n\n</details>\n`);
    }
  }

  return lines.join("\n");
}

/**
 * Format a research summary with sources list.
 */
export function formatSummary(
  summary: string,
  sources: { url: string; title: string }[]
): string {
  const lines: string[] = [
    `## Research Summary\n`,
    summary,
    `\n---\n## Sources (${sources.length})\n`,
  ];

  for (let i = 0; i < sources.length; i++) {
    lines.push(`${i + 1}. [${sources[i].title || sources[i].url}](${sources[i].url})`);
  }

  return lines.join("\n");
}

/**
 * Format a comparison table from structured data.
 */
export function formatComparison(
  items: Record<string, any>[],
  criteria: string[]
): string {
  if (items.length === 0) return "No items to compare.";

  const cols = criteria.length > 0 ? criteria : Object.keys(items[0]).filter((k) => k !== "url" && k !== "source");

  const lines: string[] = [
    `## Comparison (${items.length} offers)\n`,
    `| # | ${cols.join(" | ")} | Source |`,
    `|---|${cols.map(() => "---").join("|")}|---|`,
  ];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const values = cols.map((c) => String(item[c] ?? "-").slice(0, 100));
    const source = item.url ? `[link](${item.url})` : "-";
    lines.push(`| ${i + 1} | ${values.join(" | ")} | ${source} |`);
  }

  return lines.join("\n");
}

/**
 * Format errors from parallel execution — shown prominently at the TOP, not hidden.
 */
export function formatErrors(errors: string[]): string {
  if (errors.length === 0) return "";

  const lines: string[] = [
    `\n---`,
    `**WARNING: ${errors.length} service(s) failed:**\n`,
  ];

  for (const err of errors) {
    lines.push(`- ${err}`);
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Format service status header — shows which services contributed to results.
 */
export function formatServiceStatus(services: {
  exa: boolean;
  firecrawl: boolean;
  perplexity: boolean;
}): string {
  const mark = (ok: boolean) => ok ? "OK" : "FAILED";
  return `**Services:** Exa: ${mark(services.exa)} | Firecrawl: ${mark(services.firecrawl)} | Perplexity: ${mark(services.perplexity)}\n`;
}

function countSources(results: MergedResult[]): number {
  const all = new Set<string>();
  for (const r of results) {
    for (const s of r.sources) all.add(s);
  }
  return all.size;
}
