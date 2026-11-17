import { describe, expect, it } from "vitest";
import { looksScanned, stripHtml, textFromOoxml } from "@/lib/agent/extract";
import { redactCounted } from "@/lib/agent/redact";
import { inputCostUsd, tokensForChars } from "@/lib/claude/pricing";

describe("reading slides", () => {
  it("joins text runs into paragraphs and decodes entities", () => {
    const xml = '<p:sp><a:p><a:r><a:t>Contract </a:t></a:r><a:r><a:t>review &amp; markup</a:t></a:r></a:p><a:p><a:r><a:t>Second line</a:t></a:r></a:p><a:p></a:p></p:sp>';
    expect(textFromOoxml(xml)).toBe("Contract review & markup\nSecond line");
  });
});
describe("reading other formats", () => {
  it("strips markup and scripts from html", () => {
    expect(stripHtml("<style>a{}</style><h1>Title</h1><script>x()</script><p>Hello&nbsp;world</p>")).toBe("Title Hello world");
  });
  it("calls a PDF with almost no text a scan", () => {
    expect(looksScanned(10, 5)).toBe(true);
    expect(looksScanned(4000, 5)).toBe(false);
    expect(looksScanned(0, 0)).toBe(false);
  });
});
describe("redacting an attached file", () => {
  it("removes phone numbers and personal emails and counts them", () => {
    const r = redactCounted("Call Priya on +91 74166 55595 or (415) 555-0132. Personal: priya@gmail.com. Work: priya@zscaler.com. Signed 2026-11-16.");
    expect(r.phones).toBe(2);
    expect(r.emails).toBe(1);
    expect(r.text).toContain("priya@zscaler.com");
    expect(r.text).toContain("2026-11-16");
    expect(r.text).not.toMatch(/74166|555-0132|gmail/);
  });
});
describe("what a file costs to read", () => {
  it("estimates tokens and dollars", () => {
    expect(tokensForChars(4000)).toBe(1000);
    expect(inputCostUsd("claude-sonnet-5-5", 100_000)).toBe(0.2);
  });
});
