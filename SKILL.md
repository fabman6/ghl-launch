---
name: ghl-launch
description: Launch and fully set up a NEW GoHighLevel sub-account from zero to client-ready. Use this skill whenever the user mentions setting up, launching, onboarding, or configuring a new GHL sub-account, location, or client account, loading a snapshot for a new client, "ghl-launch", "spin up a sub-account", "get [client] set up in GHL/HighLevel", or a fresh client needs their CRM, pipelines, calendars, workflows, funnels, and automations stood up. Works in two modes, MCP mode (Claude builds what it can directly and strategizes the rest) or Ask AI mode (Claude delivers a complete, ordered prompt pack for GHL's in-app Ask AI). Companion to the ghl-goat skill.
---

# GHL Launch

You take a brand-new GoHighLevel sub-account from empty shell to revenue-ready machine. You never start building blind: first you acquire context, then you present a launch blueprint, then you execute in the mode the user picks. The end state is always the same, a sub-account where leads flow in, get followed up automatically, book themselves, and get asked for reviews, with copy that sounds like the client.

If the ghl-goat skill is installed, lean on it for MCP tool mechanics, Ask AI/Workflow AI prompt craft, and doc research. This skill owns the launch sequence itself.

## Phase 1: Context acquisition (skip only what you already know)

Do NOT interrogate the user for things already in reach. Harvest first, ask second:

1. **Memory and conversation**: client name, industry, offer, prior notes.
2. **Connected tools**: the GHL MCP itself (`locations_get-location` confirms which sub-account you are pointed at and its timezone/branding), Google Drive (proposals, onboarding forms, brand docs), Gmail (client threads), Fireflies (kickoff call transcripts), and any CRM records.
3. **The client's web presence**: website and socials for voice, services, and proof points.

Then fill remaining gaps with a SHORT interview. The full checklist with priorities lives in `references/context-intake.md`; read it now. Minimum viable context before any build: business identity, offer(s) and pricing posture, target audience, primary lead sources, booking model, brand voice, and the owner's email. If a required item is genuinely unknowable right now, mark it TBD in the blueprint rather than stalling the launch.

## Phase 2: Mode selection

Once context is sufficient, ask ONE question before strategizing the build:

"Do you want me to build this via **MCP** (I execute directly in the account, and hand you prompts only for the parts the MCP can't reach) or via **Ask AI** (I write you a complete, numbered prompt pack you paste into GHL's Ask AI to build everything)?"

If they already told you the mode, do not ask again.

## Phase 3: The launch blueprint

Read `references/launch-blueprint.md` (the master checklist in strict build order, each item tagged [MCP], [ASK AI], or [MANUAL]). Produce a tailored blueprint for THIS client: which items apply, what each will contain (actual pipeline stages, actual field names, actual workflow list), and the build order. Show it to the user for a quick yes before executing. This blueprint is the strategy artifact; both modes execute from it.

Snapshot rule: if the agency has a base snapshot for this vertical, loading it is ALWAYS step one (it is [MANUAL], agency view > Sub-account > load snapshot), and the blueprint shifts from "create everything" to "customize what the snapshot planted."

## Phase 4A: MCP mode

Execute the blueprint top to bottom:

- Build every [MCP] item directly: confirm the location, read existing custom fields, create email templates with final copy, seed contacts/tags if there is a list to import (upsert, never blind create), set up blog structure if content is in scope, connect the dots on social posting if accounts are linked.
- For every [ASK AI] item, generate the prompt at that point in the sequence (using `references/prompt-pack.md` templates filled with this client's real values) and hand it over in build order, clearly numbered, so the user paste-executes while you continue.
- For every [MANUAL] item (phone/A2P, domains/DNS, snapshot loads, integrations requiring OAuth), give exact doc-verified click paths and flag compliance sensitivity. Never delegate A2P registration language to in-app AI; precision matters there.
- Confirm each build with a read-back where the MCP can read, and keep a running DONE / WAITING ON YOU / BLOCKED board so the user always knows launch status.
- In Claude Code, verify UI-only builds visually with the ghl-goat Camoufox helper when available.

## Phase 4B: Ask AI mode

Deliver the complete launch prompt pack:

- Use `references/prompt-pack.md` templates, filled with the client's actual values. ZERO placeholders may survive into a delivered prompt; if a value is missing, resolve it in Phase 1 terms or mark the single prompt as "needs X before pasting."
- Number the prompts in dependency order (fields before workflows that reference them, calendars before booking funnels, templates before campaigns) and say where each gets pasted: general prompts into Ask AI, workflow prompts into Automation > Create Workflow > Build using AI.
- Every workflow prompt carries its final messaging copy verbatim, merge fields pre-placed, opt-out language on the first SMS of every sequence (the ghl-goat workflow-ai reference governs copy rules; follow it even if ghl-goat is not installed, the same rules are summarized in prompt-pack.md).
- Interleave the [MANUAL] items as numbered steps in the same sequence so the pack reads as one continuous launch runbook.
- Close with the QA prompt (last item in prompt-pack.md) and offer to verify results afterward.

## Phase 5: Launch QA

Never end at "prompts delivered" or "items created." Run (or hand over) the QA pass:

- Test lead: submit the main form or create a test contact, confirm the nurture fires, the notification lands, and the booking link works end to end.
- Check every workflow is intentionally Published or Draft, not accidentally half-live.
- Verify sending: email domain authenticated, SMS only after A2P approval.
- Confirm tracking basics (pipeline reporting, at minimum) show data.

Report the final launch status board and the first-week watch list (what the owner should check daily for 7 days).

## Reference files

- `references/context-intake.md`: the full context checklist, where to harvest each item, and the minimum viable set. Read at Phase 1.
- `references/launch-blueprint.md`: master setup checklist in build order with [MCP]/[ASK AI]/[MANUAL] tags and success criteria per item. Read at Phase 3.
- `references/prompt-pack.md`: fill-in Ask AI and Workflow AI prompt templates for every launch item, plus copy rules. Read at Phase 4 in either mode.
