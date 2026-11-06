# Datavant implementation context

Snapshot 30 October 2026 from Siddharth's supplied scope and SOW. Production go-live target: 16 November 2026; production setup target: 10 November. These are planned milestones, not confirmed completions. Refresh status before claims about current delivery.

Coupa remains the system of record. Users interact via email notifications and the Spendflo app; avoid saying there is no additional app or no implementation effort.

| Job | Trigger and action | Output and human boundary |
|---|---|---|
| Contract intelligence | Daily sync of Coupa Contracts and Legal Agreement attachments; extraction by document type including order form, MSA, DPA and SOW | Plain-language answers across contracts linked to source clauses; commercial policy exceptions surfaced |
| Renewal preparation | Extracted notice deadlines drive notifications at 90, 60 and 30 days with terms, supplier context, pricing benchmark and negotiation guidance | Owner chooses Renew or Not renewing; Renew starts a prefilled request in Coupa Contracts under existing approvals; Not renewing is recorded with deadline reminders, not proof that legal notice was served |
| Redline automation | Contract reaches the agreed pending approval step with the agreed attachment type and filename | Review against customer templates/policies; redlined attachment and summary comment returned to Coupa; Legal reviews; later uploaded versions processed; final clean copy attached separately after approval |
| PR creation | Contract workflow completes | Fields prefilled from contract and past purchases; lines split by billing period; uncertain fields left to requester; no claim of spend approval |

Integration uses a dedicated OAuth client. Reads include contracts/attachments, suppliers, users/groups, requisitions, POs, invoices, accounting, commodity and approval configuration. Writes are capability-specific: renewal request, redline and clean attachments/comments, and requisition creation. Broad sandbox permissions do not establish approved production scopes.

Known boundaries to resolve with engineering: supplied scope lists contracts/approvals as read-only in sandbox despite planned attachment/comment writes; automatic approval of Spendflo's own stage was proposed but final approval behaviour is not clearly established. Attachment identifiers, field maps and billing examples require agreement. Do not repeat unresolved details as committed behaviour.

Sandbox access and matching data were reported as obtained 23 October; templates/policies shared 26 October. Demo dates in the SOW are planned, not verified completed. Supplier back-and-forth in later redline rounds is described as picking up versions Legal uploads, not autonomously chasing suppliers. Pricing benchmarks are not proof of negotiated savings.

External wording can accurately describe an implementation underway for “a Coupa customer.” Name Datavant or share its documents only with permission. The sample must exist and be shareable before an offer to send it. Use synthetic or approved examples if needed. No measured production outcomes are supplied.

Sources: [original SOW](datavant-sow.txt) and [supplied scope](datavant-scope.md).
