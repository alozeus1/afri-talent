# Agent Teams — Master Reference Guide

> Source: https://code.claude.com/docs/en/agent-teams  
> Status: Experimental — requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`  
> Min version: Claude Code v2.1.32+

---

## Table of Contents

1. [What Are Agent Teams](#1-what-are-agent-teams)
2. [Agent Teams vs Subagents](#2-agent-teams-vs-subagents)
3. [Enabling Agent Teams](#3-enabling-agent-teams)
4. [Architecture](#4-architecture)
5. [Display Modes](#5-display-modes)
6. [Starting a Team](#6-starting-a-team)
7. [Controlling a Team](#7-controlling-a-team)
8. [Task Management](#8-task-management)
9. [Permissions and Context](#9-permissions-and-context)
10. [Hooks for Quality Gates](#10-hooks-for-quality-gates)
11. [Subagent Definitions as Teammates](#11-subagent-definitions-as-teammates)
12. [Token Costs](#12-token-costs)
13. [Best Practices](#13-best-practices)
14. [Use Case Patterns](#14-use-case-patterns)
15. [Troubleshooting](#15-troubleshooting)
16. [Known Limitations](#16-known-limitations)
17. [AfriTech Usage Notes](#17-afritech-usage-notes)

---

## 1. What Are Agent Teams

Agent teams coordinate multiple Claude Code instances working together:

- One session acts as the **team lead** — creates, coordinates, and synthesizes
- **Teammates** are fully independent Claude Code sessions with their own context windows
- Teammates communicate **directly with each other**, not just through the lead
- A **shared task list** lets teammates self-assign work
- A **mailbox system** handles inter-agent messaging

Unlike subagents, teammates persist and can be messaged directly by the user without going through the lead.

---

## 2. Agent Teams vs Subagents

| Dimension | Subagents | Agent Teams |
|-----------|-----------|-------------|
| Context window | Own, results return to caller | Own, fully independent |
| Communication | Report back to main agent only | Message each other directly |
| Coordination | Main agent manages everything | Shared task list, self-coordination |
| Best for | Focused tasks where only result matters | Complex work needing discussion and collaboration |
| Token cost | Lower (results summarized back) | Higher (each teammate = separate Claude instance) |

**Rule of thumb:**
- Use **subagents** when workers don't need to talk to each other
- Use **agent teams** when teammates need to share findings, challenge each other, and coordinate autonomously

---

## 3. Enabling Agent Teams

### In settings.json (project or user level)

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### In shell environment

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

This project already has it enabled in `.claude/settings.local.json`.

---

## 4. Architecture

### Components

| Component | Role |
|-----------|------|
| **Team lead** | Main Claude Code session — creates team, spawns teammates, coordinates work |
| **Teammates** | Separate Claude Code instances working on assigned tasks |
| **Task list** | Shared list of work items teammates claim and complete |
| **Mailbox** | Messaging system for inter-agent communication |

### Storage locations (all local)

- **Team config**: `~/.claude/teams/{team-name}/config.json`
- **Task list**: `~/.claude/tasks/{team-name}/`

> **Do not hand-edit team config files.** They are overwritten on every state update. Use subagent definitions for reusable roles instead.

### Team config structure

The `config.json` contains a `members` array with each teammate's:
- Name
- Agent ID
- Agent type

Teammates can read this file to discover other team members.

### Task states

- `pending` — not yet started
- `in_progress` — claimed by a teammate
- `completed` — done

Tasks can declare **dependencies**. A pending task with unresolved dependencies cannot be claimed until those dependencies complete. The system unblocks dependent tasks automatically.

Task claiming uses **file locking** to prevent race conditions.

---

## 5. Display Modes

### In-process (default when not in tmux)

- All teammates run inside the main terminal
- `Shift+Down` — cycle through teammates
- `Enter` — view a teammate's session
- `Escape` — interrupt a teammate's current turn
- `Ctrl+T` — toggle task list
- Type normally to send messages to the currently focused teammate

### Split panes (when inside tmux, or forced)

- Each teammate gets its own visible pane
- Click into a pane to interact with that teammate directly
- Requires **tmux** or **iTerm2** with `it2` CLI

### Configuration

Set globally in `~/.claude.json`:

```json
{
  "teammateMode": "in-process"
}
```

Or per-session:

```bash
claude --teammate-mode in-process
```

Valid values: `"auto"` (default), `"in-process"`, `"tmux"`

### Install split-pane dependencies

```bash
# tmux (macOS)
brew install tmux

# iTerm2 — install it2 CLI, then enable Python API:
# iTerm2 → Settings → General → Magic → Enable Python API
```

---

## 6. Starting a Team

### Basic spawn prompt pattern

```text
Create an agent team to [describe task]. Spawn [N] teammates:
- One [role/focus]
- One [role/focus]
- One [role/focus]
Have them [describe coordination goal].
```

### Example — exploratory research

```text
I'm designing a CLI tool that helps developers track TODO comments across
their codebase. Create an agent team to explore this from different angles:
one teammate on UX, one on technical architecture, one playing devil's advocate.
```

### How Claude initiates teams

Two paths:
1. **User requests explicitly** — Claude creates the team per instructions
2. **Claude proposes** — Claude suggests a team for complex tasks; user confirms before it proceeds

Claude will **never create a team without approval**.

---

## 7. Controlling a Team

### Specify team size and models

```text
Create a team with 4 teammates to refactor these modules in parallel.
Use Sonnet for each teammate.
```

### Require plan approval before implementation

```text
Spawn an architect teammate to refactor the authentication module.
Require plan approval before they make any changes.
```

Plan approval flow:
1. Teammate works in read-only plan mode
2. Teammate sends plan approval request to lead
3. Lead reviews — approves or rejects with feedback
4. If rejected: teammate revises and resubmits
5. If approved: teammate exits plan mode and begins implementation

To influence lead's judgment: add criteria in your prompt, e.g.:
- `"only approve plans that include test coverage"`
- `"reject plans that modify the database schema"`

### Message a teammate directly

In-process: `Shift+Down` to reach the teammate, then type

### Shut down a teammate gracefully

```text
Ask the researcher teammate to shut down
```

Lead sends shutdown request → teammate can approve (exits) or reject with reason.

### Clean up the entire team

```text
Clean up the team
```

> Always use the **lead** to clean up. Never ask a teammate to run cleanup — their team context may not resolve correctly, leaving resources in an inconsistent state.
>
> Cleanup fails if active teammates are still running — shut them down first.

---

## 8. Task Management

### Lead assigns explicitly

```text
Assign the auth module task to the security teammate
```

### Teammate self-claims

After finishing a task, a teammate picks up the next unassigned, unblocked task automatically.

### Steer task breakdown

If the lead isn't creating enough granular tasks:

```text
Split the work into smaller pieces — aim for 5-6 tasks per teammate
```

### Force lead to wait

If the lead starts doing work instead of delegating:

```text
Wait for your teammates to complete their tasks before proceeding
```

---

## 9. Permissions and Context

### Permissions

- Teammates inherit the **lead's permission settings** at spawn time
- If lead uses `--dangerously-skip-permissions`, all teammates do too
- Permissions **cannot** be set per-teammate at spawn time
- Individual teammate modes **can** be changed after spawning

### Context at spawn

Each teammate automatically loads:
- `CLAUDE.md` files from working directory
- MCP servers from project and user settings
- Skills from project and user settings
- The **spawn prompt** from the lead

What teammates do **not** inherit:
- Lead's conversation history

### Information sharing mechanisms

| Mechanism | Description |
|-----------|-------------|
| **Automatic message delivery** | Messages delivered automatically; lead doesn't poll |
| **Idle notifications** | Teammates notify lead when they stop |
| **Shared task list** | All agents see task status and can claim work |

### Messaging types

- `message` — send to one specific teammate by name
- `broadcast` — send to all teammates simultaneously (use sparingly — costs scale with team size)

---

## 10. Hooks for Quality Gates

Three hook types for enforcing standards:

| Hook | Trigger | Exit code 2 behavior |
|------|---------|----------------------|
| `TeammateIdle` | Teammate about to go idle | Send feedback, keep teammate working |
| `TaskCreated` | Task being created | Prevent creation, send feedback |
| `TaskCompleted` | Task being marked complete | Prevent completion, send feedback |

Example use: enforce that no task is marked complete without a test file being referenced.

---

## 11. Subagent Definitions as Teammates

You can reference any [subagent](https://code.claude.com/docs/en/sub-agents) type (project, user, plugin, or CLI-defined) when spawning a teammate.

```text
Spawn a teammate using the security-reviewer agent type to audit the auth module.
```

When a subagent definition is used as a teammate:
- Its `tools` allowlist and `model` are honored
- Its body is **appended** to the teammate's system prompt (not replacing it)
- Team coordination tools (`SendMessage`, task management) are always available regardless of `tools` restriction

**Not applied when running as teammate:**
- `skills` frontmatter field
- `mcpServers` frontmatter field

These are loaded from project/user settings instead.

---

## 12. Token Costs

- Each teammate = separate Claude instance = its own token usage
- Token usage scales **linearly** with active teammate count
- Broadcast messages scale costs by team size

**Cost guidance:**
- Research, review, and new feature work: extra tokens usually worthwhile
- Routine or sequential tasks: use a single session instead
- Start with 3-5 teammates; scale up only when genuinely beneficial

---

## 13. Best Practices

### Team sizing

- **3-5 teammates** is the practical sweet spot for most workflows
- Aim for **5-6 tasks per teammate** to keep everyone productive without context-switching overload
- Scale up only when work genuinely benefits from true parallelism

### Task sizing

| Size | Problem |
|------|---------|
| Too small | Coordination overhead > benefit |
| Too large | Long runs without check-ins, high wasted-effort risk |
| Just right | Self-contained unit with a clear deliverable (a function, a test file, a review) |

### Context in spawn prompts

Teammates don't inherit lead history. Be explicit:

```text
Spawn a security reviewer teammate with the prompt: "Review the authentication
module at src/auth/ for security vulnerabilities. Focus on token handling,
session management, and input validation. The app uses JWT tokens stored in
httpOnly cookies. Report any issues with severity ratings."
```

### Avoid file conflicts

Two teammates editing the same file = overwrites. Partition ownership:
- By directory (e.g., `src/auth/` vs `src/jobs/`)
- By file type (e.g., one does routes, one does services, one does tests)
- By feature boundary

### Monitor and steer

- Check in on teammates' progress regularly
- Redirect approaches that aren't working early
- Synthesize findings as they arrive, not just at the end
- Letting a team run unattended too long increases wasted-effort risk

### Start with read-only tasks

New to agent teams? Begin with tasks that don't write code:
- Reviewing a PR
- Researching a library
- Investigating a bug with competing hypotheses

Clear boundaries + no write conflicts = good learning environment.

### Pre-approve common operations

Teammate permission requests bubble up to the lead and create friction. Pre-approve common operations in permission settings before spawning.

---

## 14. Use Case Patterns

### Pattern 1 — Parallel code review

Assign each teammate a distinct review lens so they don't overlap:

```text
Create an agent team to review PR #142. Spawn three reviewers:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

### Pattern 2 — Competing hypotheses debugging

Force adversarial investigation to prevent anchoring on the first plausible theory:

```text
Users report the app exits after one message instead of staying connected.
Spawn 5 agent teammates to investigate different hypotheses. Have them talk to
each other to try to disprove each other's theories, like a scientific debate.
Update the findings doc with whatever consensus emerges.
```

### Pattern 3 — Cross-layer parallel implementation

Each teammate owns a non-overlapping layer:

```text
Create a team with 4 teammates to implement the job alerts feature:
- One builds the backend API endpoints (src/routes/alerts.ts)
- One builds the frontend UI components (frontend/src/components/alerts/)
- One writes the service layer (backend/src/services/alerts.ts)
- One writes the test suite (backend/tests/alerts/ and frontend/tests/alerts/)
No teammate should edit files owned by another.
```

### Pattern 4 — Research synthesis

Multiple perspectives investigated independently, then synthesized:

```text
Create an agent team to research authentication options for our API.
Spawn three teammates:
- One researching JWT best practices and pitfalls
- One researching session-based auth tradeoffs
- One researching OAuth2/OIDC integration patterns
Have them share findings and produce a comparison doc at docs/auth-research.md.
```

---

## 15. Troubleshooting

### Teammates not appearing

- In-process mode: press `Shift+Down` — they may already be running but not visible
- Check if the task was complex enough to warrant a team
- Verify tmux is installed: `which tmux`
- For iTerm2: verify `it2` CLI is installed and Python API is enabled

### Too many permission prompts

Pre-approve common operations before spawning teammates.

### Teammates stopping on errors

Check output via `Shift+Down`, then:
- Give them additional instructions directly, or
- Spawn a replacement teammate to continue the work

### Lead shuts down before work is done

Tell it to keep going. Preemptively instruct: `"wait for all teammates to finish before proceeding"`.

### Task status lagging / stuck tasks

If a task appears stuck but work is actually done:
- Tell the lead to nudge the teammate to mark it complete, or
- Update the task status manually

### Orphaned tmux sessions

```bash
tmux ls
tmux kill-session -t <session-name>
```

---

## 16. Known Limitations

| Limitation | Workaround |
|------------|-----------|
| No session resumption for in-process teammates | After `/resume`, tell lead to spawn new teammates |
| Task status can lag | Nudge teammate to mark complete, or update manually |
| Shutdown can be slow | Teammates finish current operation before shutting down |
| One team per lead session | Clean up current team before starting a new one |
| No nested teams | Teammates cannot spawn their own teams |
| Lead is fixed for team lifetime | Cannot promote teammate to lead |
| Permissions set at spawn (not per-teammate) | Change individual modes after spawning |
| Split panes don't work in VS Code terminal, Windows Terminal, Ghostty | Use in-process mode in those environments |

---

## 17. AfriTech Usage Notes

### Already configured

`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set in `.claude/settings.local.json`.

### High-value use cases in this repo

| Task | Recommended pattern |
|------|-------------------|
| PR reviews spanning auth/jobs/applications | 3 reviewers: security, logic, test coverage |
| Cross-stack features (route + service + frontend + tests) | 4 teammates, one per layer, strict file ownership |
| Debugging session/auth issues with unclear root cause | 3-5 teammates with competing hypotheses, adversarial debate |
| AI orchestrator changes + downstream service impacts | Lead coordinates, teammates own each affected service |

### File ownership partitions for this repo

Suggested ownership boundaries to avoid conflicts:

| Domain | Files |
|--------|-------|
| Auth | `backend/src/routes/auth.ts`, `backend/src/middleware/` |
| Jobs | `backend/src/routes/jobs.ts`, `backend/src/services/jobs*` |
| AI/Orchestrator | `backend/src/lib/ai/orchestrator/`, `backend/src/routes/orchestrator.ts` |
| Frontend | `frontend/src/` |
| Infra | `infra/terraform/`, `.github/workflows/` |
| Tests | `backend/tests/`, `frontend/tests/` |

### Spawn prompt template for this project

```text
Create an agent team to [task description].

Project context for all teammates:
- Backend: Node.js 20 + Express 5 + TypeScript + Prisma + PostgreSQL
- Frontend: Next.js 16 + React 19 + Tailwind v4
- Import Zod as: import { z } from "zod/v4"
- MOCK_AI=1 for tests (no Claude API key needed)
- Never use relative paths in code

Spawn [N] teammates:
- [Teammate 1 name]: [role, files they own, specific instructions]
- [Teammate 2 name]: [role, files they own, specific instructions]

No teammate should edit files owned by another.
Report findings to the lead when complete.
```

---

*Last updated: 2026-04-09*
