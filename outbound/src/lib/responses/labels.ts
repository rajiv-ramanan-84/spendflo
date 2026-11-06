export const CLASS_LABEL: Record<string, string> = {
  positive: "Positive",
  neutral: "Neutral",
  objection: "Objection",
  not_now: "Not now",
  referral: "Referral",
  wrong_person: "Wrong person",
  unsubscribe: "Unsubscribe",
  auto_reply: "Out of office",
  bounce: "Bounce",
};

export const CLASS_TONE: Record<string, string> = {
  positive: "bg-emerald-50 text-emerald-700 border-emerald-200",
  referral: "bg-sky-50 text-sky-700 border-sky-200",
  neutral: "bg-canvas text-ink-700 border-line",
  not_now: "bg-amber-50 text-amber-700 border-amber-200",
  objection: "bg-amber-50 text-amber-700 border-amber-200",
  auto_reply: "bg-canvas text-ink-500 border-line",
  wrong_person: "bg-rose-50 text-rose-700 border-rose-200",
  unsubscribe: "bg-rose-50 text-rose-700 border-rose-200",
  bounce: "bg-rose-50 text-rose-700 border-rose-200",
};

/** What confirming will do, in plain words, so nobody is surprised. */
export const CLASS_EFFECT: Record<string, string> = {
  positive: "Marks the contact as replied and stops their track. You can pause the other tracks too.",
  neutral: "Marks the contact as replied. Their track keeps going.",
  objection: "Pauses this contact's track until you re-plan.",
  not_now: "Pauses this contact's track until you re-plan.",
  referral: "Pauses this track. Add the person they pointed to, then re-plan.",
  wrong_person: "Stops this contact for good and adds them to do not contact.",
  unsubscribe: "Stops this contact for good and adds them to do not contact.",
  auto_reply: "Moves their next steps past the return date. Not counted as a reply.",
  bounce: "Marks the email bad and switches their open emails to LinkedIn.",
};
