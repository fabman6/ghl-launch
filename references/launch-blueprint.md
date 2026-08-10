# Launch Blueprint: Master Checklist (strict build order)

Tags: [MCP] Claude executes directly via the official GHL MCP. [ASK AI] deliver a filled prompt (templates in prompt-pack.md). [MANUAL] doc-verified click path, human hands (usually compliance or OAuth). Tag reality check lives in ghl-goat's mcp-tools.md; if the MCP has grown since, promote items.

Build in this order because later items depend on earlier ones (fields before workflows, calendars before booking funnels, templates before campaigns).

## 0. Snapshot decision [MANUAL]
If a vertical-fit base snapshot exists, load it first (Agency view > Sub-accounts > actions > load snapshot). Everything below becomes "verify and customize" instead of "create". Success: snapshot assets visible in the sub-account.

## 1. Business profile and branding [ASK AI, partly MANUAL]
Business name, address, timezone, logo, brand colors, email header/footer defaults. Verify with `locations_get-location` [MCP read]. Success: profile complete, timezone correct (wrong timezone silently breaks every calendar and send window).

## 2. Team and users [MANUAL or ASK AI]
Seats, roles, lead assignment defaults, notification recipients. Success: every human who must get notified exists as a user.

## 3. Phone system and A2P [MANUAL, compliance-sensitive]
Buy/port number, register A2P brand and campaign with truthful use-case and sample messages, opt-in language documented on the site (privacy policy non-sharing clause, consent checkboxes). Do NOT send SMS workflows live before approval; build them as Draft. Success: number active, A2P submitted or approved, site consent assets in place.

## 4. Email deliverability [MANUAL]
Dedicated sending domain, DKIM/SPF records at the DNS host, from-name and reply-to set. Success: domain authenticated in settings, test email lands in inbox not spam.

## 5. Custom fields and custom values [ASK AI]
Contact and opportunity fields the client's process needs, grouped in folders; custom values for reusable brand strings (booking link, review link, address). Read back with `locations_get-custom-fields` [MCP read] and capture field keys for copy. Success: fields exist, keys recorded for merge use.

## 6. Tags taxonomy [ASK AI or MCP-implicit]
Define the tag dictionary up front (source tags, status tags, behavior tags) so automations and humans speak one language. Tags create implicitly on first use [MCP]; the dictionary prevents casing chaos. Success: written taxonomy in the blueprint, seeded on a test contact.

## 7. Pipelines [ASK AI]
One pipeline per distinct sales motion, 4 to 7 stages each, win/loss stages flagged for reporting. Success: pipeline visible, stages ordered, `opportunities_get-pipelines` [MCP read] returns them with IDs.

## 8. Calendars [ASK AI]
Booking calendars per meeting type: duration, buffers, availability, intake questions, confirmations. Success: booking link works end to end on a test booking.

## 9. Forms and surveys [ASK AI]
Main lead capture form(s) matching the field set from item 5, submit actions tagging by source. Success: test submission creates a tagged contact.

## 10. Email templates and asset copy [MCP]
Create the core templates with FINAL copy via `emails_create-template`: welcome, nurture set, appointment confirmation/reminder shells, review request, reactivation. Success: templates exist and render.

## 11. Core workflow stack [ASK AI via Workflow AI, copy embedded]
The launch five, all built as Draft, published only after QA and (for SMS) A2P approval:
1. Speed-to-lead nurture (form submitted > instant SMS + email > waits > branches on reply)
2. Missed call text back
3. Appointment lifecycle (confirmation, reminders at 24h and 1h, no-show follow-up)
4. Review request (after won/completed)
5. Database reactivation (for imported lists WITH consent)
Plus vertical-specific flows the blueprint calls for. Every messaging step ships with final copy, merge fields placed, opt-out on first SMS, stop-on-reply on. Success: each workflow's steps match the prompt spec (verify via "Describe this Workflow" or Camoufox).

## 12. Funnel / website [ASK AI]
Minimum: one landing page with the form or calendar embedded, thank-you page, privacy policy and terms pages (A2P needs them). Success: page live on the right domain, form/calendar functional, policy pages linked in the footer.

## 13. Reputation [ASK AI]
Connect Google Business Profile, set review request defaults, response templates. Success: review link resolves, request workflow points at it.

## 14. Social planner [MCP after MANUAL connect]
Human connects accounts (OAuth) [MANUAL]; then schedule the first content batch via `social-media-posting_create-post` [MCP]. Success: accounts listed by `social-media-posting_get-account`, first posts scheduled.

## 15. Payments and invoicing [MANUAL + ASK AI]
Stripe connect [MANUAL], products/invoices setup [ASK AI] if in scope. Success: test invoice or order path works.

## 16. Conversation AI / Voice AI / Agent Studio [ASK AI, optional scope]
Only if in scope and billing allows: bot goals, knowledge base, handoff rules, always in a supervised mode first. Success: bot answers a test message correctly and hands off on request.

## 17. Contact import [MCP]
Only after fields, tags, and consent are settled: upsert the list with source tags. Success: spot-check 5 records, counts match, no duplicate storm.

## 18. Tracking and reporting [ASK AI or MANUAL]
Pipeline reporting sanity, attribution basics, and any dashboard the agency runs. Success: a test lead is visible in reporting.

## 19. Launch QA (always)
Test lead end to end, publish decisions confirmed per workflow, sending verified, status board delivered, first-week watch list handed to the owner.
