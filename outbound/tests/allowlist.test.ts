import { describe, expect, it } from "vitest";
import { accessConfigFromEnv, checkAccess, checkDomain, parseEmailList } from "@/lib/auth/allowlist";

const config = {
  allowedEmails: ["rajiv@spendflo.com", "siddharth@spendflo.com", "chandramouli@spendflo.com", "mahasweta@spendflo.com"],
  allowedDomain: "spendflo.com",
};

describe("checkAccess", () => {
  it("lets every allowlisted user in", () => {
    for (const email of config.allowedEmails) {
      expect(checkAccess(email, config)).toEqual({ allowed: true, email });
    }
  });

  it("is case and whitespace insensitive", () => {
    expect(checkAccess("  Rajiv@SpendFlo.com ", config)).toEqual({ allowed: true, email: "rajiv@spendflo.com" });
  });

  it("refuses a company email that is not on the allowlist", () => {
    expect(checkAccess("intern@spendflo.com", config)).toEqual({ allowed: false, reason: "not_on_allowlist" });
  });

  it("refuses an outside domain even with an allowlisted local part", () => {
    expect(checkAccess("rajiv@gmail.com", config)).toEqual({ allowed: false, reason: "wrong_domain" });
  });

  it("refuses lookalike domains", () => {
    expect(checkAccess("rajiv@spendflo.com.evil.io", config).allowed).toBe(false);
    expect(checkAccess("rajiv@evilspendflo.com", config).allowed).toBe(false);
  });

  it("refuses an allowlisted address if the domain config is wrong", () => {
    const misconfigured = { ...config, allowedDomain: "" };
    expect(checkAccess("rajiv@spendflo.com", misconfigured)).toEqual({ allowed: false, reason: "wrong_domain" });
  });

  it("refuses missing or malformed email", () => {
    expect(checkAccess(undefined, config).allowed).toBe(false);
    expect(checkAccess(null, config).allowed).toBe(false);
    expect(checkAccess("not-an-email", config).allowed).toBe(false);
  });

  it("refuses everyone when the allowlist is empty", () => {
    expect(checkAccess("rajiv@spendflo.com", { ...config, allowedEmails: [] }).allowed).toBe(false);
  });
});

describe("env parsing", () => {
  it("parses comma and space separated lists", () => {
    expect(parseEmailList("A@spendflo.com, b@spendflo.com  c@spendflo.com")).toEqual([
      "a@spendflo.com",
      "b@spendflo.com",
      "c@spendflo.com",
    ]);
  });

  it("builds config from env", () => {
    const cfg = accessConfigFromEnv({ ALLOWED_EMAILS: "rajiv@spendflo.com", ALLOWED_DOMAIN: " SpendFlo.com " } as unknown as NodeJS.ProcessEnv);
    expect(cfg).toEqual({ allowedEmails: ["rajiv@spendflo.com"], allowedDomain: "spendflo.com" });
  });
});

describe("checkAccess with the users table", () => {
  it("lets an active team member in, even if not in the env list", () => {
    const empty = { ...config, allowedEmails: [] };
    expect(checkAccess("newbdr@spendflo.com", empty, { active: true })).toEqual({ allowed: true, email: "newbdr@spendflo.com" });
  });

  it("refuses a deactivated user even if they are in the env list", () => {
    expect(checkAccess("rajiv@spendflo.com", config, { active: false })).toEqual({ allowed: false, reason: "deactivated" });
  });

  it("refuses someone with no users row once the database is connected", () => {
    expect(checkAccess("rajiv@spendflo.com", config, null)).toEqual({ allowed: false, reason: "not_on_allowlist" });
  });

  it("still enforces the domain for an active row", () => {
    expect(checkAccess("rajiv@gmail.com", config, { active: true })).toEqual({ allowed: false, reason: "wrong_domain" });
  });
});

describe("checkDomain", () => {
  it("passes any company address and refuses others", () => {
    expect(checkDomain("anyone@spendflo.com", config).allowed).toBe(true);
    expect(checkDomain("anyone@other.com", config).allowed).toBe(false);
  });
});
