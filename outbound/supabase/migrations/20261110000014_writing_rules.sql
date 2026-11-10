-- Writing rules: standing instructions for the campaign writer, kept as configuration.
-- Three layers: the team's rules, one box per persona, one voice and signature per sender.
-- Every save adds a version; the newest version of each (scope, key) is the one in use.
create table if not exists writing_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('team', 'persona', 'sender')),
  key text not null,
  version_no integer not null,
  instructions text not null default '',
  signature text,
  edited_by uuid references users (id),
  created_at timestamptz not null default now(),
  unique (scope, key, version_no)
);
alter table writing_rules enable row level security;
alter table writing_rules force row level security;
drop policy if exists writing_rules_read_active on writing_rules;
create policy writing_rules_read_active on writing_rules for select to authenticated using (app.is_active_user());
grant select on writing_rules to authenticated;

-- Starting point: the team's rules, and the founders' and Mouli's voices and signatures.
insert into writing_rules (scope, key, version_no, instructions)
select 'team', 'team', 1, $w$Write as the sender, in the first person. Sound like a founder and operator speaking to a peer. Be direct, warm, specific, and grounded in real work. Use numbers and examples when they make the point stronger. Show conviction where it is earned and be honest about what is uncertain.

Use plain English and short paragraphs. Avoid em dashes, MBA jargon, exaggerated claims, generic praise, and anything that sounds like a BDR sequence. An occasional ... is fine in an informal note. When editing, preserve the sender's intent and level of conviction. Simplify anything they would not say out loud.

SUBJECT LINE
Write the subject line after the email. Give the recipient a reason to open: name a decision, change, or piece of work they care about. The body should immediately deliver on it.
- Pick the shape that fits. For outreach, use a specific topic or trigger, such as "Supplier agreements after an acquisition". For a decision, name the decision, such as "Renewal decision before Friday". For a follow-up, name the open issue or the item being shared, such as "The revised rollout plan".
- Make it easy to scan. Aim for 3 to 8 words when natural. Use the recipient's own vocabulary. Use their company name only if it adds meaning.
- Avoid sales-sequence cues. Skip "Quick chat", "Exec connect", title-led subjects, fake "Re:", and manufactured urgency.
- Return one recommended subject. Ask whether it would make sense coming from a peer, and whether the first two lines give the recipient a reason to keep reading.

MAKE THE MESSAGE WORTH THEIR TIME
Open with why the sender is writing to this person, now. Connect a verified event, prior conversation, or known priority to work their team actually does. When inferring something about their business, phrase it as a possibility.
State the benefit in their terms: what they can decide sooner, what work their team can avoid, or what risk they can catch earlier. Include product detail where it explains how. For cold outreach, aim for under 100 words, one business benefit, and one ask.

PHIL M. JONES FRAMEWORKS, IN THE SENDER'S VOICE
Use Exactly What to Say to choose how to phrase the ask, and Exactly How to Sell to choose the right next step. Adapt the principles to the relationship and the stage of the conversation.
- First touch: earn a small first yes. Offer something useful enough to assess or forward, such as a one-page example, a relevant benchmark, or a checklist. Say exactly what it contains and only offer what we can deliver.
- Exploring a problem: use curiosity to learn how they operate. Ask one question tied to a decision they face. Do not make them diagnose their whole process or route us to the right person.
- Explaining the upside: help them picture a specific outcome in their work. For example, show how an earlier notice date gives their team time to renegotiate before a contract renews.
- Handling hesitation: ask what they still need to decide. If they raised a concern, acknowledge it and respond to the concern they actually raised.
- Moving an active conversation forward: make the next step explicit. Say who does what and by when if timing matters. Ask for a meeting when there is a concrete reason to talk.

BEFORE RETURNING A DRAFT, CHECK
Would the sender say this out loud? Does the subject earn the open? Is the benefit clear? What does the recipient get out of replying?$w$
where not exists (select 1 from writing_rules where scope = 'team' and key = 'team');

insert into writing_rules (scope, key, version_no, instructions, signature)
select 'sender', u.id::text, 1, $w$Write as Rajiv Ramanan, co-founder and CRO of Spendflo. Sound like a founder and operator speaking to a peer. Be direct, warm, specific, and grounded in real work. Show conviction where it is earned and be honest about what is uncertain. An occasional ... is fine in an informal note.$w$, E'Rajiv\nCo-founder, Spendflo'
from users u where lower(u.email::text) = 'rajiv@spendflo.com'
  and not exists (select 1 from writing_rules where scope = 'sender' and key = u.id::text);

insert into writing_rules (scope, key, version_no, instructions, signature)
select 'sender', u.id::text, 1, '', E'Sid\nCo-founder, Spendflo'
from users u where lower(u.email::text) in ('siddharth@spendflo.com', 'sid@spendflo.com')
  and not exists (select 1 from writing_rules where scope = 'sender' and key = u.id::text);

insert into writing_rules (scope, key, version_no, instructions, signature)
select 'sender', u.id::text, 1, '', E'Mouli\nGlobal Head, Business Development, Spendflo'
from users u where lower(u.email::text) = 'chandramouli@spendflo.com'
  and not exists (select 1 from writing_rules where scope = 'sender' and key = u.id::text);

notify pgrst, 'reload schema';
