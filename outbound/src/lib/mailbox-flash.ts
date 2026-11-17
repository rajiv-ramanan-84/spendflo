/** What to say when Google sends someone back after connecting an inbox. Shared by Mailboxes and My setup. */
export const FLASH: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Inbox connected. It starts warming up, and its replies are checked every 15 minutes." },
  wrong_account: { ok: false, text: "Google signed in a different account. Click Connect again and pick the inbox itself." },
  expired: { ok: false, text: "The connection took too long or was started by someone else. Click Connect again." },
  no_refresh: { ok: false, text: "Google did not grant offline access. Remove the app at myaccount.google.com > Security > Third-party access for that inbox, then connect again." },
  google: { ok: false, text: "Google refused the connection. An admin should check the redirect address is added to the Google sign-in client." },
  forbidden: { ok: false, text: "Only admins, or the person who uses the inbox, can connect it." },
  missing: { ok: false, text: "That inbox could not be found." },
  not_found: { ok: false, text: "That inbox could not be found." },
};
export const flashFor = (sp: { mailbox_connected?: string; mailbox_error?: string }) => (sp.mailbox_connected ? FLASH.connected : sp.mailbox_error ? (FLASH[sp.mailbox_error] ?? null) : null);
