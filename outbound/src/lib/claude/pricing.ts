/** What Claude costs (pure, so screens can show an estimate before anything is sent). */

/** USD per million tokens. One-hour cache writes bill at 2x input, reads at the listed rate. Batches bill at half. */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export function costUsd(model: string, u: { input: number; output: number; cacheRead: number; cacheWrite: number }, opts: { batch?: boolean } = {}): number {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const usd = ((u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.input * 2) / 1_000_000) * (opts.batch ? 0.5 : 1);
  return Math.round(usd * 10_000) / 10_000;
}

/** Roughly four characters to a token. Good enough to warn before sending. */
export const tokensForChars = (chars: number) => Math.ceil(chars / 4);

/** What reading this many input tokens costs on a model. */
export const inputCostUsd = (model: string, tokens: number) => Math.round((tokens * (PRICES[model] ?? PRICES["claude-opus-5-5"]).input) / 10_000) / 100;
