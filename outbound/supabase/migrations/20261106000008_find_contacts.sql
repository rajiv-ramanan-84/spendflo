-- Claude web search for missing contacts is recorded like any other call,
-- so it shows in Claude spend and counts against the monthly budget.
alter type claude_call_type add value if not exists 'find_contacts';
