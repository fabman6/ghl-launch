# GHL Launch

**A Claude skill that takes a brand new GoHighLevel sub-account from empty shell to revenue-ready machine.**

[![Get it set up for you at ghlgoat.com](https://img.shields.io/badge/hosted%20version-ghlgoat.com-4f46e5?style=for-the-badge)](https://ghlgoat.com)

New client signs. You open their sub-account and it is a blank void. GHL Launch runs the whole sequence: harvest context, present a blueprint, build it, QA it, hand over a status board.

The end state is always the same. A sub-account where leads flow in, get followed up automatically, book themselves, and get asked for reviews, with copy that sounds like the client instead of like a template.

---

## How it runs

**Phase 1: Context acquisition.** It does not interrogate you for things already in reach. It harvests first from memory, the GHL MCP itself, Google Drive proposals, Gmail threads, Fireflies kickoff transcripts, and the client's own website and socials. Then it asks a short interview for whatever is genuinely missing.

**Phase 2: Mode selection.** One question. MCP mode (Claude executes directly in the account and hands you prompts only for what the MCP cannot reach) or Ask AI mode (Claude writes a complete, numbered prompt pack you paste into GHL's Ask AI to build everything).

**Phase 3: The launch blueprint.** A tailored checklist in strict build order with real values, actual pipeline stages, actual field names, the actual workflow list. Every item tagged `[MCP]`, `[ASK AI]`, or `[MANUAL]`. You approve it before anything gets built. If you have a base snapshot for the vertical, loading it becomes step one and the blueprint shifts from "create everything" to "customize what the snapshot planted."

**Phase 4: Execution.** Top to bottom in dependency order. Fields before the workflows that reference them, calendars before booking funnels, templates before campaigns. Every workflow prompt carries its final messaging copy verbatim with merge fields pre-placed and opt-out language on the first SMS of every sequence. Zero placeholders survive into a delivered prompt.

**Phase 5: Launch QA.** It never ends at "prompts delivered." Test lead through the real form, confirm the nurture fires, the notification lands, the booking link works end to end. Check every workflow is intentionally Published or Draft rather than accidentally half-live. Verify the email domain is authenticated and SMS waits for A2P approval. Then a final status board and a first-week watch list.

## What's in the box

```
SKILL.md                              the skill itself
references/context-intake.md          full context checklist, where to harvest each
                                      item, and the minimum viable set
references/launch-blueprint.md        master setup checklist in build order with
                                      [MCP]/[ASK AI]/[MANUAL] tags and success criteria
references/prompt-pack.md             fill-in Ask AI and Workflow AI templates for
                                      every launch item, plus the copy rules
dist/ghl-launch.skill                 one-click installable bundle
```

---

## Install

### Option 1: the .skill file (easiest, no terminal)

1. Download [`dist/ghl-launch.skill`](dist/ghl-launch.skill)
2. In the Claude desktop app, go to Settings and add it as a skill
3. Done. Say "set up a new sub-account for [client]" and it fires

### Option 2: Claude Code (git clone)

```bash
git clone https://github.com/fabman6/ghl-launch.git ~/.claude/skills/ghl-launch
```

The repo is laid out so the clone target *is* the skill folder. Restart Claude Code and it is live.

To update later:

```bash
cd ~/.claude/skills/ghl-launch && git pull
```

### Option 3: manual

Download the repo as a ZIP, unzip it, and drop the folder into `~/.claude/skills/` (Mac/Linux) or `%USERPROFILE%\.claude\skills\` (Windows). `SKILL.md` must sit at the top level of that folder.

---

## Install ghl-goat too

[**ghl-goat**](https://github.com/fabman6/ghl-goat) is the companion skill and the reason this one stays short. It owns MCP tool mechanics, Ask AI and Workflow AI prompt craft, doc research, Camoufox browser vision, and the weekly feature scan. GHL Launch owns the launch sequence and leans on ghl-goat for everything else.

GHL Launch works standalone (the copy rules it needs are summarized in `prompt-pack.md`), but the pair is the real product.

## Connect the GoHighLevel MCP

MCP mode needs a connection. Create a Private Integration Token in **Settings > Private Integrations** inside the target sub-account, then:

```bash
claude mcp add --transport http ghl https://services.leadconnectorhq.com/mcp/ \
  --header "Authorization: Bearer YOUR_PIT_HERE" \
  --header "locationId: YOUR_SUBACCOUNT_ID"
```

One PIT equals one sub-account. For agencies, register one server per client (`ghl-clientname`) or swap the `locationId`. Full setup walkthrough lives in the ghl-goat README.

Ask AI mode needs no connection at all. You get the prompt pack and paste it.

---

## Want it done for you?

Onboarding, snapshots, A2P registration, and the parts of a launch that stall for two weeks. **[ghlgoat.com](https://ghlgoat.com)** is the hosted version: the same skills, already wired up, plus the files direct if you would rather run it yourself.

---

## Notes

- A2P registration language never gets delegated to in-app AI. Precision matters there and the skill flags it as manual on purpose.
- Anything genuinely unknowable at blueprint time gets marked TBD rather than stalling the launch.
- Nothing in this repo contains credentials. Keep your PIT in your MCP config, never in a repo.

Built by [Raw Marketing Group](https://ghlgoat.com).
