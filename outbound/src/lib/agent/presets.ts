/** Starting permission for each tool an integration offers (pure). An admin still reviews every tool before it is used. */

export type Level = "read" | "approve" | "blocked";
export type Suggestion = { level: Level; credits: number };

const READ = /^(get|list|report|search|find|lookup|read|fetch|describe|count|whoami|account_brief|journey_funnel|journey_step_events|render_recipe)(_|$)/i;

export function suggestLevel(preset: string | null, tool: string): Suggestion {
  if (preset === "tapistro") {
    if (/^preview_(source|persona|aiAgent)$/i.test(tool)) return { level: "approve", credits: 10 };
    if (READ.test(tool)) return { level: "read", credits: 0 };
    return { level: "blocked", credits: 0 };
  }
  return READ.test(tool) ? { level: "read", credits: 0 } : { level: "blocked", credits: 0 };
}

export const PRESETS = [
  { key: "tapistro", label: "Tapistro", hint: "Find people, enrich and validate. Reads are allowed once you review them; previews need approval and cost credits." },
  { key: "custom", label: "Custom MCP server", hint: "Any remote MCP server. Every tool starts blocked until you review it." },
] as const;
