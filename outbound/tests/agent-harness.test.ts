import { describe, expect, it } from "vitest";
import { forModel, redactText, redactValue } from "@/lib/agent/redact";
import { DEFAULT_AGENT_CONFIG, gate, parseAgentConfig, stateOf } from "@/lib/agent/config";

describe("redaction", () => {
  it("removes phone numbers and personal emails but keeps work emails and dates", () => {
    const t = redactText("Call +91 74166 55595 or (415) 555-0132, email jo@gmail.com or jo@zscaler.com, started 2026-11-16");
    expect(t).not.toContain("74166");
    expect(t).not.toContain("555-0132");
    expect(t).toContain("[personal email]");
    expect(t).toContain("jo@zscaler.com");
    expect(t).toContain("2026-11-16");
  });
  it("drops phone, personal email and secret fields wherever they are nested", () => {
    const v = redactValue({ name: "Amanda", phone: "+1 415 555 0132", persons: [{ title: "Dir", personalEmailsAsString: "a@yahoo.com", mobile: "1" }], api_key: "x", note: "key sk-ant-abcdefghijklmnopqrstuv" });
    expect(JSON.stringify(v)).not.toContain("415");
    expect(JSON.stringify(v)).not.toContain("yahoo");
    expect(JSON.stringify(v)).not.toContain("sk-ant");
    expect((v as { name: string }).name).toBe("Amanda");
  });
  it("cuts long results and says how to narrow them", () => {
    const out = forModel({ rows: Array.from({ length: 500 }, (_, i) => ({ i })) }, 200);
    expect(out.length).toBeLessThan(400);
    expect(out).toContain("truncated");
  });
});

describe("budget rules", () => {
  const cfg = DEFAULT_AGENT_CONFIG;
  it("starts at $50 of Claude and 500 Tapistro credits", () => {
    expect(cfg.claudeMonthlyUsd).toBe(50);
    expect(cfg.tapistroMonthlyCredits).toBe(500);
  });
  it("allows work under the caps and warns past 80 percent", () => {
    expect(gate(cfg, { usd: 5, credits: 50 }, { usd: 0, credits: 0 }, { usd: 0.1 })).toEqual({ ok: true, warn: null });
    const g = gate(cfg, { usd: 41, credits: 0 }, { usd: 0, credits: 0 }, { usd: 0.1 });
    expect(g.ok && g.warn).toContain("Claude budget");
  });
  it("refuses a step that would pass the monthly or per-request cap", () => {
    expect(gate(cfg, { usd: 49.95, credits: 0 }, { usd: 0, credits: 0 }, { usd: 0.1 }).ok).toBe(false);
    expect(gate(cfg, { usd: 0, credits: 495 }, { usd: 0, credits: 0 }, { credits: 10 }).ok).toBe(false);
    expect(gate(cfg, { usd: 0, credits: 0 }, { usd: 2.95, credits: 0 }, { usd: 0.1 }).ok).toBe(false);
    expect(gate(cfg, { usd: 0, credits: 0 }, { usd: 0, credits: 95 }, { credits: 10 }).ok).toBe(false);
  });
  it("the kill switch stops everything", () => {
    const g = gate({ ...cfg, enabled: false }, { usd: 0, credits: 0 }, { usd: 0, credits: 0 });
    expect(g.ok).toBe(false);
  });
  it("reads stored settings over the defaults and ignores bad values", () => {
    expect(parseAgentConfig({ claudeMonthlyUsd: 80 }).claudeMonthlyUsd).toBe(80);
    expect(parseAgentConfig({ claudeMonthlyUsd: -5 }).claudeMonthlyUsd).toBe(50);
    expect(stateOf(40, 50, 80)).toBe("warn");
    expect(stateOf(50, 50, 80)).toBe("stop");
    expect(stateOf(1, 50, 80)).toBe("ok");
  });
});

import { suggestLevel } from "@/lib/agent/presets";
describe("tool permission suggestions", () => {
  it("lets Tapistro reads through once reviewed, previews need approval, everything else is blocked", () => {
    expect(suggestLevel("tapistro", "report_persons")).toEqual({ level: "read", credits: 0 });
    expect(suggestLevel("tapistro", "account_brief").level).toBe("read");
    expect(suggestLevel("tapistro", "preview_source")).toEqual({ level: "approve", credits: 10 });
    for (const t of ["run_journey", "create_journey", "delete_source", "update_journey", "import_records"]) expect(suggestLevel("tapistro", t).level).toBe("blocked");
  });
  it("starts any other server with only plainly read-only tools open", () => {
    expect(suggestLevel(null, "search_files").level).toBe("read");
    expect(suggestLevel(null, "send_message").level).toBe("blocked");
  });
});

import { assertSafeUrl, isPrivateAddress, toolHash } from "@/lib/agent/mcp-safe";
describe("MCP safety", () => {
  const prod = { allowLocal: false };
  it("accepts a public https server and refuses everything else", () => {
    expect(assertSafeUrl("https://mcp.example.com/mcp", prod).hostname).toBe("mcp.example.com");
    for (const bad of ["http://mcp.example.com", "https://localhost/mcp", "https://127.0.0.1/mcp", "https://10.0.0.5/x", "https://192.168.1.2/x", "https://172.20.0.1/x", "https://169.254.169.254/latest", "https://intranet/mcp", "https://user:pw@mcp.example.com/mcp", "not a url"]) {
      expect(() => assertSafeUrl(bad, prod), bad).toThrow();
    }
  });
  it("allows local http only for tests", () => {
    expect(assertSafeUrl("http://127.0.0.1:54340/mcp", { allowLocal: true }).port).toBe("54340");
    expect(() => assertSafeUrl("http://127.0.0.1:54340/mcp", prod)).toThrow();
  });
  it("recognises private addresses, including IPv6-mapped ones", () => {
    expect(isPrivateAddress("::ffff:10.1.2.3")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });
  it("notices when a tool definition changes, ignoring key order", () => {
    const a = { name: "t", description: "d", inputSchema: { type: "object", properties: { a: { type: "string" }, b: { type: "number" } } } };
    const sameButReordered = { name: "t", description: "d", inputSchema: { properties: { b: { type: "number" }, a: { type: "string" } }, type: "object" } };
    expect(toolHash(a)).toBe(toolHash(sameButReordered));
    expect(toolHash(a)).not.toBe(toolHash({ ...a, description: "d, but now it deletes things" }));
    expect(toolHash(a)).not.toBe(toolHash({ ...a, inputSchema: { type: "object", properties: { a: { type: "string" } } } }));
  });
});
