import type { PlayCode } from "./catalog";

/**
 * Founder validation outreach. When the email is signed by a founder, it asks for 20 minutes to learn how a
 * specific problem looks for that person, tied to a KPI they are judged on, and offers something back.
 * The app picks the hypothesis for each contact from play and persona, so the model writes from a chosen line
 * and never invents the pain. Pure: no database, no clock.
 */

export type OutreachStyle = "standard" | "founder";
export type Hypothesis = { guess: string; share: string; subject: string };
export type HypothesisKey = `${PlayCode}:${string}`;
export const ASK = "Could I take 20 minutes";

export const PERSONA_LABEL: Record<string, string> = {
  economic_buyer: "finance and procurement executives",
  procurement_leader: "procurement leaders",
  system_owner: "Coupa and procurement systems owners",
  contract_manager: "contract managers",
  legal: "legal leaders",
  finance_ap: "finance and AP leaders",
  champion: "procurement leaders",
  other: "procurement leaders",
};

const h = (guess: string, share: string, subject: string): Hypothesis => ({ guess, share, subject });

/** The starting table, one line per play and persona. Edited versions in Settings take over. */
export const DEFAULT_HYPOTHESES: Record<string, Hypothesis> = {
  // Redlining. KPI: contract turnaround, request to signed.
  "A1:procurement_leader": h("you're measured on contract turnaround but don't control legal's queue", "the enterprise teams that cut turnaround moved the first check ahead of legal, and how they did it", "Contract turnaround at {company}"),
  "A1:economic_buyer": h("slow contracts reach your desk as complaints even though procurement doesn't control legal's queue", "how the teams that fixed it moved the first check ahead of legal", "Contract turnaround complaints"),
  "A1:system_owner": h("contract approvals sit outside Coupa, with manual handoffs between the request, legal and the record", "how other enterprise teams cut those handoffs", "Handoffs around contract approvals"),
  "A1:contract_manager": h("a lot of your week goes on supplier paper that follows the same template, and on the handoffs around it", "how other enterprise contract teams are cutting the handoffs", "Handoffs on supplier agreements"),
  "A1:legal": h("routine supplier paper takes legal time that should go to the contracts that need judgment", "which kinds of paper other enterprise legal teams no longer read end to end", "Routine paper and legal time"),
  "A1:champion": h("contract turnaround sits across procurement and legal, so it can be unclear who owns it", "what other enterprise teams do about ownership", "Who owns contract turnaround"),
  // Renewals. KPI: share of big renewals negotiated before the notice date, uplift avoided.
  "A2:procurement_leader": h("no one owns the renewal calendar across categories, so the big renewals get decided close to the notice date", "how enterprise teams get a position agreed before the vendor calls", "Who owns the renewal calendar"),
  "A2:economic_buyer": h("big software and services renewals at {company} often get signed at the vendor's price because the notice window closes first", "that the finance teams that avoid surprise uplifts tend to know their big notice dates months out, and how they get there", "Renewals signed at the vendor's price"),
  "A2:system_owner": h("renewal dates, contracts and usage live in different systems", "how other enterprise teams bring them together", "Where renewal dates live"),
  "A2:contract_manager": h("auto-renewal and notice terms are buried in agreements, so dates get missed", "how other enterprise teams keep notice dates visible", "Notice dates in agreements"),
  "A2:finance_ap": h("price uplifts land in AP and budgets with no warning", "how other finance teams hear about uplifts before they are signed", "Price uplifts with no warning"),
  "A2:legal": h("auto-renewal clauses and notice periods are only noticed when it is too late", "how other enterprise legal teams catch them early", "Auto-renewal and notice periods"),
  "A2:champion": h("renewals sit across several teams, so it can be unclear who owns them", "what other enterprise teams do about ownership", "Who owns renewals"),
  // Guided buying. KPIs: spend under management, requisitions right first time, duplicate spend, non-PO invoices.
  "A3:procurement_leader": h("spend under management is held back by purchases that reach procurement after the fact", "that a few teams have found a way to bring most of that spend into the process, and what they are doing", "Spend that reaches procurement late"),
  "A3:economic_buyer": h("spend under management is capped by purchases that are committed before procurement sees them", "how enterprise teams bring that spend into the process", "Spend committed before procurement sees it"),
  "A3:system_owner": h("a good share of requisitions still need manual fixing, such as coding, approvers or duplicate suppliers", "that the teams with the cleanest requisitions fix it before the request is raised, and how", "Requisitions that need fixing"),
  "A3:finance_ap": h("the same software gets bought more than once across teams, and some invoices arrive with no PO", "that the teams that stopped it check what they already own before a request is raised, and how", "The same software bought twice"),
  "A3:champion": h("purchase requests land in several places, so it can be unclear who owns how they start", "what other enterprise teams do about ownership", "Who owns purchase requests"),
};

export const keyFor = (play: PlayCode, persona: string | null): HypothesisKey => `${play}:${persona ?? "other"}`;

/** The hypothesis for one contact: an edited line if there is one, else the default, else the champion line, else nothing. */
export function pickHypothesis(play: PlayCode | null, persona: string | null, custom: Record<string, Hypothesis> = {}): { key: string; h: Hypothesis; edited: boolean } | null {
  if (!play) return null;
  const tries = [persona ?? "other"];
  if (!tries.includes("champion")) tries.push("champion");
  for (const who of tries) {
    const k = `${play}:${who}`;
    if (custom[k]) return { key: k, h: custom[k], edited: true };
    if (DEFAULT_HYPOTHESES[k]) return { key: k, h: DEFAULT_HYPOTHESES[k], edited: false };
  }
  return null;
}

/** An email is in the founder style when whoever it is signed by is a founder. Read from the signature, so it follows Settings. */
export function isFounderSignature(signature: string | null | undefined): boolean {
  return /\bco-?founder\b|\bfounder\b/i.test(signature ?? "");
}

export type FocusInput = { play: PlayCode | null; persona: string | null; companyName: string; custom?: Record<string, Hypothesis>; smallGroup?: boolean };
/** What the model is told to write from for one contact. */
export function validationFocus(i: FocusInput) {
  const p = pickHypothesis(i.play, i.persona, i.custom);
  if (!p) return null;
  const fill = (s: string) => s.replace(/\{company\}/g, i.companyName);
  const topic = p.h.subject.replace(/\s+at\s+\{company\}/i, "").replace(/\{company\}/g, i.companyName).toLowerCase();
  const label = PERSONA_LABEL[i.persona ?? "other"] ?? PERSONA_LABEL.other;
  return {
    hypothesis: fill(p.h.guess),
    what_i_can_share: fill(p.h.share),
    subject_idea: fill(p.h.subject),
    ask: `${ASK} to hear how it works for you`,
    // Composed by the app so the group line is accurate for the persona. Left out when the setting is off.
    group_line: i.smallGroup === false ? undefined : `I'm speaking with a small group of enterprise ${label} about ${topic}, and I'd value your view${i.companyName ? ` at ${i.companyName}` : ""}.`,
  };
}

export const FOUNDER_STYLE = [
  "# FOUNDER VALIDATION STYLE",
  "",
  "This request has outreach_style \"founder\": every email, LinkedIn note and call opener is written as one of the company's founders asking for 20 minutes to learn how a specific problem looks for that person. This section replaces the skill's Email: Reply Method, its persona line table and the playbook's sample emails. Everything else in the skill (tracks, dates, caps, flags, JSON format) still applies.",
  "",
  "## The email, in order (about 85 words, three short paragraphs, no greeting, sign-off or signature)",
  "1. Who and what, one plain sentence each: \"I'm {writing_rules.sender.name}, one of the founders at Spendflo. We build AI agents on top of the procurement suites companies already run.\" Always use the sender's first name. Name Coupa only when the account's Coupa evidence is confirmed (\"on top of existing suites like Coupa, which I understand {company} runs\"). Only for a Coupa or systems owner say \"on top of Coupa and other suites, so Coupa stays the system of record\". If Coupa is not confirmed, never mention it.",
  "2. Why now and the hypothesis. Start from validation_focus.hypothesis as a possibility: \"I'd guess ...\". If a counted signal supports it, cite the signal first (\"I noticed ...\") and then guess the consequence. If no counted signal supports it, write no \"I noticed\" at all. Never state a claim about their company as fact.",
  "3. The group line, the ask and the give, in one paragraph: validation_focus.group_line verbatim when it is present (omit it when it is absent), then \"Could I take 20 minutes to hear how it works for you?\", then what_i_can_share in the founder's words (\"I'm happy to share ...\"). Never offer an asset that does not exist. The only proof line allowed is \"in our enterprise customer base\" or \"a few enterprise teams\". No numbers, no names, no \"exclusive\", no \"top\".",
  "Subject: use validation_focus.subject_idea, 3 to 8 words, plain, specific to the problem. No sales cues.",
  "",
  "## Never in a founder email",
  "Product features, demos, pricing, \"we're implementing\", customer names, statistics, ROI figures, urgency or scarcity tricks, flattery beyond that one clause, or more than one ask. Do not pretend to be neutral research: say plainly that Spendflo builds AI agents.",
  "",
  "## Sequence (adjust to the level the app sent)",
  "- Signal-led (super_hot, hot, warm): day 1 LinkedIn connect, day 1 to 2 email 1, day 4 to 5 email 2, day 7 call, day 9 to 10 LinkedIn message, day 12 email 3, day 15 close the loop. The signal is the why-now in email 1.",
  "- Cold (nurture): connect, email 1, email 2 and email 3 over about three weeks. No call unless the account is Tier A and a strong fit. The why-now is a possibility, never a claim.",
  "- Economic buyer: short, two or three touches, founder-sent, never first unless the app says so. Wave order is unchanged.",
  "- Every touch after the first adds something and never says \"just checking in\".",
  "",
  "## The other touches",
  "- LinkedIn connect (under 300 characters, no pitch): \"I'm one of the founders at Spendflo. I'm speaking with a few enterprise {persona} about {topic} and would value your view. Would be glad to connect.\"",
  "- Email 2: one pattern from enterprise teams that adds substance and one sharper question tied to the KPI. Offer a one-line reply or 20 minutes.",
  "- LinkedIn message: one line and one question.",
  "- Email 3: \"I may be writing to the wrong person. Who at {company} owns {topic}? A name is plenty and I'll stop there.\"",
  "- Close the loop: say plainly you will stop and leave the door open.",
  "- Call opener: \"I'm one of the founders at Spendflo. I sent a note about {topic}. Do you have 20 seconds for me to say why I'm calling, and you tell me if it's off base?\" Branches: yes, not me (ask who), not now (ask when), off base (ask what is true).",
  "- On a positive reply the next step is to offer 20-minute slots. The call explores four things in the buyer's words: the project they are working on, what is forcing it now, what they have tried, and where that fell short.",
  "",
  "## A persona with no validation_focus",
  "Write only the \"who owns this\" note (email 3 pattern) or leave the person in nurture and list them in skipped_contacts. Do not invent a hypothesis.",
].join("\n");
