# Launch-Wave Orchestration Team — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Inline execution is required — this plan creates a live Agent Team in the current session; it cannot be delegated to a subagent because the team's lead must be the calling session.

**Goal:** Spawn the 7-teammate Agent Team described in `docs/superpowers/specs/2026-05-12-launch-wave-orchestration-design.md`, establish heartbeat + watcher cadence, and kick off Wave 5.

**Architecture:** Use Claude Code's experimental Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). The current session is the Wave Lead (Supervisor role). Seven persistent teammates spawn via the Agent tool with `team_name` + `name` parameters. Coordination is via the shared task list (`~/.claude/tasks/afritalent-launch-waves/`) and SendMessage for direct communication.

**Tech stack:** Claude Code Agent Teams (TeamCreate, Agent, SendMessage, TaskList/TaskUpdate). No application code changes in this plan — the team produces those once spawned. Heartbeat is a markdown file the Wave Lead writes.

---

## Task 1: Pre-flight verification

**Files:**
- Read: `.claude/settings.local.json`
- Read: `docs/agent-heartbeat.md` (current state baseline)

- [ ] **Step 1: Verify the experimental agent teams flag is set**

Run: `grep CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS .claude/settings.local.json`

Expected output:
```
"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
```

If missing, halt and ask founder to add it. Do not proceed.

- [ ] **Step 2: Verify current branch and working tree state**

Run: `git status --short && git rev-parse --abbrev-ref HEAD`

Expected: branch is `release/launch-wave-4-bullmq-queues` (current) or `develop`. Working tree may have untracked items but no uncommitted modified tracked files. If dirty, surface a one-line summary to founder before proceeding.

- [ ] **Step 3: Verify `develop` is up to date locally**

Run: `git fetch origin develop && git log --oneline origin/develop -5`

Expected: returns the 5 latest commits on `origin/develop`. This confirms remote is reachable and we know the head Wave 5 branches off.

- [ ] **Step 4: Verify required spec + memory + reading files are present**

Run:
```
ls docs/superpowers/specs/2026-05-12-launch-wave-orchestration-design.md \
   docs/engineering-team.md \
   docs/agent-heartbeat.md \
   docs/WAVE4_FOUNDER_ACTIONS.md \
   STAGING_RUNBOOK.md AGENTS.md CODEX.md CLAUDE.md
```

Expected: all 8 paths print without error.

---

## Task 2: Create the team

**Files:**
- Created by tool: `~/.claude/teams/afritalent-launch-waves/config.json`
- Created by tool: `~/.claude/tasks/afritalent-launch-waves/` (directory)

- [ ] **Step 1: Call TeamCreate**

Tool call:
```
TeamCreate({
  team_name: "afritalent-launch-waves",
  agent_type: "wave-lead-supervisor",
  description: "AfriTalent launch waves 5-12 orchestration; mode A code-only; founder approves every PR + applies destructive prod steps. Spec at docs/superpowers/specs/2026-05-12-launch-wave-orchestration-design.md"
})
```

Expected: success message identifying the team and task-list path.

- [ ] **Step 2: Verify the team config file**

Run: `cat ~/.claude/teams/afritalent-launch-waves/config.json | head -40`

Expected: JSON with at minimum a `team_name` field equal to `afritalent-launch-waves` and a `members` array (likely just the lead at this point).

- [ ] **Step 3: Verify task list location**

Run: `ls -la ~/.claude/tasks/afritalent-launch-waves/`

Expected: directory exists, possibly empty.

---

## Task 3: Spawn the seven teammates in parallel

**Files:**
- Modified by tool: `~/.claude/teams/afritalent-launch-waves/config.json` (adds each teammate to `members` array)

All seven Agent calls happen in **one message** (parallel tool use) so the team comes up at once. Each call passes `team_name: "afritalent-launch-waves"` and a stable `name`. The prompt for each is the full spawn prompt from §10 of the spec, with absolute file paths.

- [ ] **Step 1: Spawn Backend Engineer**

Tool call:
```
Agent({
  description: "Backend Engineer teammate",
  subagent_type: "general-purpose",
  team_name: "afritalent-launch-waves",
  name: "backend-engineer",
  prompt: "<full spawn prompt from spec §10.1, with all referenced paths converted to absolute under /Users/ocheme/Desktop/Client-Projects/afri-tech/>"
})
```

- [ ] **Step 2: Spawn Frontend Engineer**

Same shape, `name: "frontend-engineer"`, prompt from spec §10.2.

- [ ] **Step 3: Spawn DevOps Engineer**

Same shape, `name: "devops-engineer"`, prompt from spec §10.3.

- [ ] **Step 4: Spawn QA Tester**

Same shape, `name: "qa-tester"`, prompt from spec §10.4.

- [ ] **Step 5: Spawn Security Engineer**

Same shape, `name: "security-engineer"`, prompt from spec §10.5.

- [ ] **Step 6: Spawn Code Reviewer**

Same shape, `name: "code-reviewer"`, prompt from spec §10.6.

- [ ] **Step 7: Spawn External-Deps Watcher**

Same shape, `name: "deps-watcher"`, prompt from spec §10.7.

**All seven Agent calls go in one tool-use block.** This is the only way to start them concurrently and avoid sequential token cost on idle handshakes.

---

## Task 4: Verify team composition

- [ ] **Step 1: Read team config**

Run: `cat ~/.claude/teams/afritalent-launch-waves/config.json`

Expected: `members` array contains seven entries with `name` values: `backend-engineer`, `frontend-engineer`, `devops-engineer`, `qa-tester`, `security-engineer`, `code-reviewer`, `deps-watcher`. Each has an `agentId` and `agentType`.

- [ ] **Step 2: If any teammate is missing, re-spawn that one teammate only**

A missing teammate means the Agent call returned an error or the team-add step failed. Look at the prior tool result for that name, fix the error (commonly a permission denial that needs a founder one-line OK), then re-issue just that Agent call. Do not re-spawn the others.

---

## Task 5: Initialize the heartbeat file

**Files:**
- Modify: `docs/agent-heartbeat.md`

- [ ] **Step 1: Read current heartbeat content**

Read `docs/agent-heartbeat.md` to preserve any existing entries from prior waves.

- [ ] **Step 2: Append a new section for the launch-wave team**

Append at the bottom of the file (do not overwrite earlier entries):

```markdown

---

## Launch-Wave Orchestration Team — started 2026-05-12

**Team:** `afritalent-launch-waves`
**Lead:** Wave Lead (this session)
**Spec:** `docs/superpowers/specs/2026-05-12-launch-wave-orchestration-design.md`
**Plan:** `docs/superpowers/plans/2026-05-12-launch-wave-orchestration-implementation.md`

### Active teammates
| Name | Role | Status |
|------|------|--------|
| backend-engineer | Backend Engineer | spawned |
| frontend-engineer | Frontend Engineer | spawned |
| devops-engineer | DevOps Engineer | spawned |
| qa-tester | QA Tester | spawned |
| security-engineer | Security Engineer | spawned |
| code-reviewer | Code Reviewer | spawned |
| deps-watcher | External-Deps Watcher | spawned |

### Wave status
- Wave 5: **kickoff pending**
- Waves 6–12: pending
- PR Q / S / T: awaiting external dependency (see deps-watcher log)

### Last update
2026-05-12 — team spawned, Wave 5 kickoff next.
```

- [ ] **Step 3: Verify the file**

Run: `tail -30 docs/agent-heartbeat.md`

Expected: shows the new section verbatim. Do not commit yet — Task 11 covers commit policy.

---

## Task 6: External-Deps Watcher first poll

- [ ] **Step 1: Send the Watcher its first poll instruction**

Tool call:
```
SendMessage({
  to: "deps-watcher",
  summary: "first dependency poll",
  message: "Run your first poll. Check current status of: (1) SES domain + DKIM/DMARC + sandbox-exit for mail.afri-talent.com, (2) Greenhouse / Lever / Ashby / Workable partner-program application status, (3) Anthropic Computer Use API access. For each, record what you know today in /Users/ocheme/Desktop/Client-Projects/afri-tech/docs/agent-watch-log.md with one line per dependency: YYYY-MM-DD <dep> <status> <evidence>. If you have no evidence yet, say 'no evidence yet — needs founder check'. Reply to me with a 3-line summary of the three statuses. Do NOT write production code."
})
```

- [ ] **Step 2: Wait for the Watcher's idle notification + reply**

The Watcher's response arrives automatically as a new conversation turn. Do not poll. When it arrives, read the 3-line summary and store the watch-log path in working notes.

- [ ] **Step 3: Verify the watch log was written**

Run: `cat docs/agent-watch-log.md`

Expected: at least three lines, one per dependency, dated `2026-05-12`.

---

## Task 7: Create the Wave 5 branch

- [ ] **Step 1: Move local HEAD to develop**

Run: `git checkout develop && git pull --ff-only origin develop`

Expected: clean fast-forward to current `origin/develop`.

- [ ] **Step 2: Create the Wave 5 branch**

Run: `git checkout -b release/launch-wave-5-resume-builder-ats`

Expected: switches to the new branch with no working-tree changes.

- [ ] **Step 3: Do NOT push the branch yet**

The first push happens when the first Wave 5 PR opens. Pushing an empty branch is harmless but unnecessary — leaving it local prevents accidental empty-PR creation.

- [ ] **Step 4: Update heartbeat**

Edit `docs/agent-heartbeat.md` — change `Wave 5: **kickoff pending**` to `Wave 5: **branch created** (release/launch-wave-5-resume-builder-ats)`.

---

## Task 8: Seed the Wave 5 task list

**Files:**
- Created by TaskCreate calls: tasks in `~/.claude/tasks/afritalent-launch-waves/`

The shared task list is how teammates self-claim work. The Wave Lead seeds it; teammates pick from it.

Each TaskCreate call below sets the subject, description, and (after creation) the owner via TaskUpdate so the right teammate picks it up. Tasks reference the spec §5.3 Wave 5 PR breakdown.

- [ ] **Step 1: Create Wave 5 task — schema for resume versions (BE)**

Tool call:
```
TaskCreate({
  subject: "Wave 5 PR #1: resume version schema",
  description: "Add Prisma model for ResumeVersion (id, candidateId, originalContent, optimizedContent, atsScore, matchScore, targetJobId, createdAt). Create migration. Add Zod schema. No route changes. Open as PR #1 of Wave 5 on branch release/launch-wave-5-resume-builder-ats, base develop. Wait for code-reviewer and security-engineer sign-off before notifying Wave Lead for founder approval. Code-only — no terraform / SSM / migrations against prod.",
  activeForm: "Building resume version schema"
})
```

Then TaskUpdate with `owner: "backend-engineer"`.

- [ ] **Step 2: Create Wave 5 task — ATS rubric scoring service (BE)**

```
TaskCreate({
  subject: "Wave 5 PR #2: ATS rubric scoring service",
  description: "Create backend/src/services/ats-rubric.ts that scores a resume against a job description using the existing AI orchestrator (MOCK_AI=1 must work for tests). Persistence via createAiRun fire-and-forget. Stacked PR on top of PR #1.",
  activeForm: "Building ATS rubric service"
})
```

TaskUpdate with `owner: "backend-engineer"`, `addBlockedBy: ["<task id of step 1>"]`.

- [ ] **Step 3: Create Wave 5 task — resume builder UX + live preview (FE)**

```
TaskCreate({
  subject: "Wave 5 PR #3: resume builder UX + live preview",
  description: "Build frontend/src/app/tools/resume-builder/ multi-step form with live preview and template selector. Hits POST /api/skills/resume-builder/* (already exists). Stacked PR on top of PR #2.",
  activeForm: "Building resume builder UX"
})
```

TaskUpdate with `owner: "frontend-engineer"`, `addBlockedBy: ["<task id of step 2>"]`.

- [ ] **Step 4: Create Wave 5 task — vitest + Playwright coverage (QA)**

```
TaskCreate({
  subject: "Wave 5 PR #4: vitest + Playwright coverage",
  description: "Add vitest cases for ats-rubric.ts + Playwright happy-path for the builder. Block merge on coverage missing.",
  activeForm: "Writing Wave 5 tests"
})
```

TaskUpdate with `owner: "qa-tester"`, `addBlockedBy: ["<task id of step 3>"]`.

- [ ] **Step 5: Create Wave 5 task — Code Reviewer gate**

```
TaskCreate({
  subject: "Wave 5: review each PR before founder request",
  description: "Code Reviewer reviews PR #1, #2, #3, #4 in order. Each review must: confirm tests, confirm security-engineer sign-off where touched, check rollback safety, ensure founder-action checklist is in PR body. Sends approval note to Wave Lead per PR.",
  activeForm: "Reviewing Wave 5 PRs"
})
```

TaskUpdate with `owner: "code-reviewer"`, no blockers (Code Reviewer claims this and watches the others).

- [ ] **Step 6: Verify the seeded task list**

Run TaskList tool call. Expected: five tasks, owners assigned, dependency chain visible.

---

## Task 9: Kick off Wave 5

- [ ] **Step 1: Broadcast Wave 5 kickoff**

This is one of the rare authorized broadcasts (per spec §4). Send to every active teammate by name.

Loop through the 7 teammate names and send each one this message via SendMessage:

```
{
  to: "<name>",
  summary: "Wave 5 kickoff",
  message: "WAVE 5 KICKOFF — Resume builder UX + ATS rubric. Branch: release/launch-wave-5-resume-builder-ats (already created). Spec: /Users/ocheme/Desktop/Client-Projects/afri-tech/docs/superpowers/specs/2026-05-12-launch-wave-orchestration-design.md. Seeded tasks for this wave are in the shared task list — call TaskList and claim or watch your assigned tasks. Hard rules: branch-only, no merges, no pushes to main, code-only for destructive prod, attach the founder-action checklist to every PR body. Code Reviewer is the final gate before I request founder approval. Message me when you open a PR."
}
```

Sending seven SendMessage calls in one message is fine (parallel tool use).

- [ ] **Step 2: Update heartbeat**

Edit `docs/agent-heartbeat.md` — change `Wave 5: **branch created**` to `Wave 5: **kicked off** (release/launch-wave-5-resume-builder-ats, 4 PRs queued)`.

- [ ] **Step 3: Update memory file `launch-wave-plan.md`**

Edit `/Users/ocheme/.claude/projects/-Users-ocheme-Desktop-Client-Projects-afri-tech/memory/launch-wave-plan.md` — add a row for Wave 5: `5 | Resume builder UX + ATS rubric | **in progress** | branch: release/launch-wave-5-resume-builder-ats; 4 PRs queued; team: afritalent-launch-waves`.

---

## Task 10: First incoming message handling protocol

This task is run when the first teammate sends a message back. It's the founder-approval gate dry-run.

- [ ] **Step 1: When Backend Engineer messages "PR #1 ready"**

Expected message: link to PR, summary, founder-action checklist preview.

- [ ] **Step 2: Verify CI green**

Run: `gh pr checks <PR number>` (or fetch via GitHub API). Expected: all checks ✓. If any failing, message Backend Engineer to fix. Do NOT page founder.

- [ ] **Step 3: Verify Code Reviewer approval note**

Check the message log from Code Reviewer addressed to Wave Lead. Required content: PR link, 3-line summary, founder-action checklist.

- [ ] **Step 4: Surface to founder**

Output to the founder chat (this user) a single message of this form:

```
PR ready for your approval:
- PR: <link>
- Summary: <3 lines>
- Founder actions:
  - Before merge: <list>
  - After merge: <destructive prod list>
  - Smoke: <verification list>
```

- [ ] **Step 5: After founder merges**

Run `git fetch origin develop` and broadcast `WAVE 5 PR #N MERGED — unblock next stacked PR` to all teammates. Update heartbeat. Update memory file.

---

## Task 11: Commit policy reminder + final verification

- [ ] **Step 1: Do NOT commit any file from this plan without explicit founder ask**

Project global `CLAUDE.md` rule: "NEVER commit changes unless the user explicitly asks you to." The spec file, this plan file, and the heartbeat update are all uncommitted on `release/launch-wave-5-resume-builder-ats` (or `develop` if branched after writing). At the founder's first PR-approval cycle, ask whether to include these doc files in the first commit of Wave 5 or in a separate doc PR.

- [ ] **Step 2: Final readiness check**

Confirm all of:
- Team config has 7 members.
- Shared task list has at least 5 Wave 5 tasks.
- Heartbeat file shows `Wave 5: kicked off`.
- Watcher's `docs/agent-watch-log.md` has 3 dependency-status lines.
- Memory file `launch-wave-plan.md` shows Wave 5 row.

- [ ] **Step 3: Report status to founder**

Single-message summary: team spawned, Wave 5 kicked off, blocked PRs being polled by the Watcher, awaiting first PR from Backend Engineer.

---

## Self-review notes

**Spec coverage:**
- §3.2 Lead role → Task 5 + Task 9 + Task 10 (Lead doesn't write feature code; only coordinates) ✓
- §3.3 7 teammates → Task 3 spawns all seven ✓
- §4 communication protocol → Task 9 step 1 references hard rules in the broadcast ✓
- §5.1 rhythm (one wave at a time) → Task 7 only creates Wave 5 branch ✓
- §5.2 role-activation matrix → Task 8 task ownership matches Wave 5 row ✓
- §5.4 blocked-PR resumption → Task 6 starts the Watcher's polling ✓
- §6.1 per-PR approval flow → Task 10 covers the dry-run ✓
- §6.2 founder-action template → Task 8 step 1 references it; Task 10 step 4 surfaces it ✓
- §6.3 destructive-prod policy → Task 9 step 1 broadcast restates it ✓
- §7 token guardrails → Task 9 step 1 broadcast is one of the rare authorized broadcasts ✓
- §8 failure handling → Task 4 step 2 covers re-spawn of a missing teammate ✓
- §9 heartbeat cadence → Task 5, Task 7 step 4, Task 9 step 2, Task 10 step 5 ✓
- §10 spawn prompts → Task 3 references them ✓
- §11/12 wave-done / launch-done → out of scope for this plan (run at Wave 5 close + Wave 12) ✓

**Placeholder scan:**
- Task 8 mentions `<task id of step 1>` — that's a real runtime value the executor fills in from the prior TaskCreate result. Not a TBD.
- No "TODO", "TBD", "implement later", or vague-handwave instructions.

**Type / name consistency:**
- Teammate names appear in Task 3, Task 5, Task 8, Task 9 — all use the same set: `backend-engineer`, `frontend-engineer`, `devops-engineer`, `qa-tester`, `security-engineer`, `code-reviewer`, `deps-watcher`. ✓
- Branch name `release/launch-wave-5-resume-builder-ats` consistent across Task 7, 9, heartbeat updates. ✓
- Team name `afritalent-launch-waves` consistent across TeamCreate, every Agent spawn, every SendMessage. ✓
