-- ICP fit per play, scored from the sales playbook ICP (see src/lib/playbook/fit.ts).
-- fit_level is the best play's level: strong, possible, weak. fit_scores keeps each play's detail.
alter table accounts
  add column if not exists fit_level text,
  add column if not exists fit_best_play text,
  add column if not exists fit_scores jsonb,
  add column if not exists fit_computed_at timestamptz;
alter table accounts drop constraint if exists accounts_fit_level_check;
alter table accounts add constraint accounts_fit_level_check check (fit_level is null or fit_level in ('strong', 'possible', 'weak'));
notify pgrst, 'reload schema';
