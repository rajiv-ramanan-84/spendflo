-- Overnight drafts go through the Message Batches API at half price.
-- batch_id links a queued call to its batch; batch_context keeps the contact
-- refs Claude saw (c1, c2...) so results map back even if contacts change.
alter table claude_calls add column if not exists batch_id text;
alter table claude_calls add column if not exists batch_context jsonb;
create index if not exists claude_calls_batch_id_idx on claude_calls (batch_id) where batch_id is not null;
