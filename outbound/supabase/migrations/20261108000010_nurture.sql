-- Nurture: people held back on purpose at an account. Their steps stay saved
-- without dates until someone makes them active from the attack plan.
alter type track_status add value if not exists 'nurture';
