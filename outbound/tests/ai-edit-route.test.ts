import { describe, expect, it } from "vitest";
import { finalizeEmail } from "@/lib/writing/compose";

// What Edit with AI sends back must survive a second finish without doubling the greeting or signature.
describe("edited emails are finished once", () => {
  it("is stable when the whole email, greeting and signature included, is edited again", () => {
    const sig = "Rajiv\nCo-founder, Spendflo";
    const first = finalizeEmail("One point.\n\nHow do you handle this today?", { firstName: "Dan", signature: sig });
    const again = finalizeEmail(first, { firstName: "Dan", signature: sig });
    expect(again).toBe(first);
  });
});
