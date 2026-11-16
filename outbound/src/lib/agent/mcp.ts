import "server-only";
import { lookup } from "node:dns/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

/**
 * A small MCP client for remote servers. The app runs on Vercel, so only remote (HTTP) servers work,
 * never programs installed on a laptop. Tool results are data and are handled as such by the caller.
 */

import { assertSafeUrl, isPrivateAddress, toolHash, type ToolDef } from "./mcp-safe";

export { assertSafeUrl, toolHash };
export type McpTool = ToolDef;

async function connect(url: string, token: string | null): Promise<Client> {
  const u = assertSafeUrl(url);
  // A public name must not point at a private address (checked again on every connection).
  if (process.env.ALLOW_LOCAL_MCP !== "1") {
    const addrs = await lookup(u.hostname, { all: true }).catch(() => []);
    if (!addrs.length || addrs.some((x) => isPrivateAddress(x.address))) throw new Error("That server's address could not be verified as public");
  }
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const make = () => new Client({ name: "spendflo-outbound", version: "1.0.0" }, { capabilities: {} });
  try {
    const c = make();
    await c.connect(new StreamableHTTPClientTransport(u, { requestInit: { headers } }));
    return c;
  } catch (first) {
    try {
      const c = make();
      await c.connect(new SSEClientTransport(u, { requestInit: { headers }, eventSourceInit: { fetch: (input, init) => fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string> | undefined), ...headers } }) } }));
      return c;
    } catch {
      throw first;
    }
  }
}

async function withClient<T>(url: string, token: string | null, fn: (c: Client) => Promise<T>, timeoutMs = 45000): Promise<T> {
  const c = await connect(url, token);
  const timer = setTimeout(() => void c.close().catch(() => {}), timeoutMs);
  try {
    return await fn(c);
  } finally {
    clearTimeout(timer);
    await c.close().catch(() => {});
  }
}

export async function listMcpTools(url: string, token: string | null): Promise<McpTool[]> {
  return withClient(url, token, async (c) => {
    const out: McpTool[] = [];
    let cursor: string | undefined;
    do {
      const r = await c.listTools(cursor ? { cursor } : undefined);
      for (const t of r.tools) out.push({ name: t.name, description: t.description ?? "", inputSchema: (t.inputSchema ?? { type: "object" }) as Record<string, unknown> });
      cursor = r.nextCursor;
    } while (cursor && out.length < 500);
    return out;
  });
}

export async function callMcpTool(url: string, token: string | null, name: string, args: Record<string, unknown>): Promise<{ isError: boolean; content: unknown }> {
  return withClient(url, token, async (c) => {
    const r = await c.callTool({ name, arguments: args });
    const content = (r.content as Array<{ type: string; text?: string }> | undefined)?.map((p) => (p.type === "text" ? p.text ?? "" : `[${p.type}]`)).join("\n") ?? "";
    let parsed: unknown = content;
    try { parsed = JSON.parse(content); } catch { /* plain text */ }
    return { isError: !!r.isError, content: r.structuredContent ?? parsed };
  }, 120000);
}
