# Launch Prompt Pack Templates

Fill-in templates for every [ASK AI] blueprint item. Rules of delivery:

- Replace every [BRACKETED] value with the client's real value BEFORE delivering. A prompt with surviving brackets is not deliverable; either resolve the value or flag that one prompt as blocked on a named input.
- Deliver prompts numbered in blueprint order, each in its own code block, with one line above it saying where to paste (Ask AI icon, or Automation > Create Workflow > Build using AI for workflows).
- Default everything to Draft/unpublished; publishing is a QA-gated decision.
- Copy rules for every messaging prompt: final copy verbatim, GHL merge fields pre-placed ({{contact.first_name}}, {{appointment.start_time}}, custom field keys from the field build), first SMS of any sequence includes business name and "Reply STOP to opt out", SMS under 320 characters, stop-on-reply on for nurtures, send windows stated.

## P1. Business profile

```
Update this sub-account's business profile:
- Business name: [NAME], niche: [INDUSTRY]
- Address: [ADDRESS], timezone: [TZ]
- Default from-name for email: [FROM NAME], reply-to: [EMAIL]
Apply logo and brand colors if I have uploaded them; otherwise tell me exactly where to upload.
Do not change any other settings. Confirm each value back when done.
```

## P5. Custom fields and values

```
Create these CONTACT custom fields, skipping any that already exist by the same name (tell me instead of duplicating):
[LIST: name (type: options)] grouped under folder "[FOLDER]".
Create these OPPORTUNITY custom fields: [LIST].
Create these custom values: "Review Link" = [URL], "Booking Link" = [URL], "Business Address" = [ADDRESS].
List every field key when done; I need the keys for message merge fields.
```

## P7. Pipeline

```
Create a pipeline named "[PIPELINE NAME]" with stages in this exact order: [STAGE 1], [STAGE 2], [STAGE 3], [STAGE 4], [STAGE 5].
Mark "[WON STAGE]" as won and "[LOST STAGE]" as lost for reporting.
Do not modify existing pipelines. Confirm the stage list in order when done.
```

## P8. Calendar

```
Create a booking calendar named "[CALENDAR NAME]":
- Duration [X] minutes, [Y] minute buffer after, slot interval [X] minutes, max [N] per day
- Availability: [DAYS], [START] to [END], account timezone
- Assigned to: [USER]
- Intake form: [FIELDS, required flags]
- Confirmation email on, no SMS reminders yet (workflow will handle reminders)
- URL slug: [slug]
Leave it active but unembedded. Give me the booking link when done.
```

## P9. Form

```
Create a form named "[FORM NAME]", unpublished:
Fields in order: [FIELD LIST with types and required flags, matching the custom fields we created].
Submit button: "[CTA TEXT]".
On submission: add tag "[source-tag]".
Confirm the field list when done.
```

## P11. Workflows (paste into Automation > Create Workflow > Build using AI)

Skeleton per workflow; write the full copy for each before delivering:

```
Build a workflow named "[NAME]". Save as Draft, do not publish.
TRIGGER: [exact trigger + filters]
STEPS in this exact order:
1. [action + full configuration]
2. Send SMS: "[FINAL COPY with merge fields, opt-out on first SMS]"
3. Wait [duration]
4. If/Else: [condition]
   - YES: [steps]
   - NO: [steps, including email with Subject: "[SUBJECT]" and full body]
SETTINGS: stop on reply enabled, no re-entry, send window [START] to [END] account time.
Copy is final; use exactly as written including merge fields.
```

Launch five to instantiate: speed-to-lead nurture, missed call text back ("Sorry we missed your call, this is [BUSINESS]! How can we help? Reply STOP to opt out"), appointment lifecycle (confirm + 24h + 1h reminders + no-show), review request (trigger: stage moved to [WON STAGE], wait 1 day, SMS + email with {{custom_values.review_link}}), reactivation (consented imports only, tag-triggered, 3-touch, heavy opt-out respect).

## P12. Funnel / landing page

```
Create a funnel named "[FUNNEL NAME]" with:
1. Landing page: headline "[HEADLINE]", subheadline "[SUBHEAD]", sections for [OFFER BULLETS], embed [FORM or CALENDAR NAME], CTA "[CTA]"
2. Thank-you page: "[THANK YOU COPY]", next step: [NEXT STEP]
3. Privacy Policy and Terms pages linked in the footer of every step
Style: [BRAND COLORS/VOICE]. Keep the funnel in draft, on domain [DOMAIN] path /[slug]. Confirm page list when done.
```

## P13. Reputation

```
Set up review requests: connect review link [GBP LINK] as the destination, set the default review request template to the copy I provide in the review workflow, and enable review request tracking. Do not enable automatic sending; the workflow controls sending. Confirm setup when done.
```

## P16. Conversation AI (only if in scope)

```
Configure Conversation AI in supervised mode for channels [CHANNELS]:
- Goal: [book on CALENDAR NAME / answer FAQs]
- Business knowledge: [PASTE FACTS: services, hours, service area, pricing posture]
- Handoff: on request for a human or any [ESCALATION TOPIC], assign to [USER] and stop the bot
Keep it OFF for live traffic until I confirm testing is complete.
```

## P19. QA prompt (always last)

```
Run a launch check on this sub-account and report: 1) list all workflows and whether each is Published or Draft, 2) confirm the email sending domain is authenticated, 3) confirm A2P registration status, 4) list active calendars with their booking links, 5) list pipelines and stages, 6) list forms and where each is embedded. Flag anything unpublished, unauthenticated, or unlinked.
```

If Ask AI cannot answer part of the QA prompt, fall back: MCP reads where possible, Camoufox screenshots in Claude Code, or a 10-minute human checklist derived from the blueprint's success criteria.
