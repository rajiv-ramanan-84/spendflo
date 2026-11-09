import data from "./playbook.json";
import { PLAY_CODES, type PlayCode } from "./catalog";

/**
 * The playbook for one play, as the text Claude reads. Built from the same
 * data the team reviewed, so the page and the prompt cannot drift. Only the
 * matched play is sent with a request. Pure.
 */

type Buyer = { w: number; role: string; t: string; shape: string | null; care: string; line: string };
type Email = { label: string; sig: string; subject: string; body: string };
type Play = {
  agent: string; name: string; sells: string; promise: string;
  glance: { lead: string; econ: string; deal: string; proof: string };
  pull: { project: string[]; unavoidable: string[]; options: string[]; limits: string[] };
  fit: { musts: string[]; dq: string[]; shape: string[] };
  signals: string[][]; buyers: Buyer[]; emails: Email[];
  li: { connect: string; message: string };
  call: { opener: string; prop: string; close: string; off: string };
  objections: string[][]; discovery: string[]; rivals: string[][];
  proof: { can: string[]; never: string[] };
  pilot: { rule: string; need: string[]; get: string[]; pass: string[] };
  landmines: string[]; flags: string[];
  value?: {
    headline: string; sub: string; caveat: string;
    outcomes: Array<{ n: string; name: string; say: string; mech: string; hard: string; avoid: string; proof: string; cpo: string; cfo: string }>;
    why: string[][]; how: string[][]; ladder: { line: string; spoken: string; by: string[][] }; gaps: string[];
  };
};
type Shape = { name: string; note: string; t: Array<[number, string]> };

const PLAYS = data.plays as unknown as Play[];
const SHAPES = data.shapes as unknown as Record<string, Shape>;
const CH: Record<string, string> = { c: "LinkedIn connect", m: "LinkedIn message", e: "email", p: "call" };
const bullets = (a: readonly string[]) => a.map((x) => `- ${x}`).join("\n");

export const PLAYBOOK_INTRO = [
  "# How to use the playbook",
  "",
  "- The app has already matched this account to a play and a level from its dated signals. Follow the playbook for that play. It replaces the job table, the ICP profile rule and the sweep and intake guidance in the skill.",
  "- The three jobs are redlining, renewals and guided_buying. Set `job` to the play's job. If the evidence clearly points elsewhere, set the job you believe in, say why in the rationale and add a flag.",
  "- Only signals marked counts: true are triggers. Cite the signal and its date in the first touch and the rationale. Never present an old or undated signal as current.",
  "- Level hot: full multi-contact plan. Level warm: a 4-touch track per contact. Level nurture: no live trigger, so write a short, low-key sequence of 3 touches and flag that there is no live signal.",
  "- The message kit below shows the pattern, the tone and the claims that are safe. Write original copy for each contact from their role and the signal. Do not paste the examples.",
  "- You may ask to run Flo on the buyer's own documents (for example three recent contracts). Never say a sample or demo output already exists unless the request says so.",
].join("\n");

function shapeLine(key: string | null) {
  if (!key || !SHAPES[key]) return "no sequence until business relevance is shown";
  const s = SHAPES[key];
  return `${s.name}: ${s.t.map(([d, c]) => `day ${d} ${CH[c]}`).join(", ")}`;
}

const cache = new Map<PlayCode, string>();

export function kitFor(code: PlayCode): string {
  const hit = cache.get(code);
  if (hit) return hit;
  const p = PLAYS.find((x) => x.agent === code);
  if (!p) throw new Error(`No playbook for ${code}`);
  const out: string[] = [];
  out.push(`# PLAYBOOK: ${p.name} (${code})`, "", `Sells as: ${p.sells}.`, `Promise: ${p.promise}`);
  if (p.value) {
    const v = p.value;
    out.push("", "## Value proposition", `Headline: ${v.headline}`, v.sub, v.caveat, "");
    for (const o of v.outcomes) out.push(`- ${o.n}: ${o.name}. Buyers say: ${o.say} Mechanism: ${o.mech} Hard savings: ${o.hard} Cost avoidance: ${o.avoid} A CPO says: "${o.cpo}" A CFO says: "${o.cfo}"`);
    out.push("", "Why now:", bullets(v.why.map(([t, d]) => `${t}: ${d}`)), "", "How it works:", bullets(v.how.map(([t, d]) => `${t}: ${d}`)));
    out.push("", `One line: ${v.ladder.line}`, `Spoken: ${v.ladder.spoken}`, "Lead with, by role:", bullets(v.ladder.by.map(([a, b]) => `${a}: ${b}`)));
    out.push("", "Not yet proven (do not claim):", bullets(v.gaps));
  }
  out.push("", "## Why they buy (PULL)", "Project:", bullets(p.pull.project), "Unavoidable:", bullets(p.pull.unavoidable), "Options they weigh:", bullets(p.pull.options), "Where those options fall short:", bullets(p.pull.limits));
  out.push("", "## Fit", "Must-haves:", bullets(p.fit.musts), "Disqualifiers (flag in the rationale if any may apply):", bullets(p.fit.dq), "A strong account looks like:", bullets(p.fit.shape));
  out.push("", "## What the signals mean", bullets(p.signals.map(([id, n, f, , k]) => `${code}.${id} ${n} (${k}): ${f}`)));
  out.push("", "## Who to reach, in order");
  for (const w of [1, 2, 3]) {
    const bs = p.buyers.filter((b) => b.w === w);
    if (!bs.length) continue;
    out.push(`Wave ${w} (${["first touches", "after Wave 1 starts", "on a reply, or when the account is hot"][w - 1]}):`);
    out.push(bullets(bs.map((b) => `${b.role} (${b.t}). Cares about: ${b.care}. Line: "${b.line}" Track: ${shapeLine(b.shape)}.`)));
  }
  out.push("Sequence rules: gaps of at least 2 working days; a LinkedIn message only after the connect; founder-sent for the economic buyer; at most 6 people active.");
  out.push("", "## Message kit (patterns, not scripts)");
  for (const e of p.emails) out.push(`Email, ${e.label} (${e.sig}). Subject: ${e.subject}\n${e.body}\n`);
  out.push(`LinkedIn connect: ${p.li.connect}`, `LinkedIn message: ${p.li.message}`, `Call opener: ${p.call.opener}`, `Call proposition: ${p.call.prop}`, `If it's close: ${p.call.close}`, `If it's way off: ${p.call.off}`);
  out.push("", "## Objections (acknowledge, then ask)", bullets(p.objections.map(([a, b]) => `"${a}" -> ${b}`)));
  out.push("", "## Discovery questions", bullets(p.discovery));
  out.push("", "## Rivals and our line", bullets(p.rivals.map(([a, , c, d]) => `${a}. Weak where: ${c} Our line: ${d}`)));
  out.push("", "## What you can say", bullets(p.proof.can), "## Never say", bullets(p.proof.never));
  out.push("", `## The 30-day proof`, p.pilot.rule, `Need from them: ${p.pilot.need.join("; ")}. They get: ${p.pilot.get.join("; ")}. Pass marks: ${p.pilot.pass.join("; ")}.`);
  out.push("", "## Raise these as review flags when they apply", bullets(p.flags));
  const text = out.join("\n");
  cache.set(code, text);
  return text;
}

export const playCodes = PLAY_CODES;
