# RahatNet — Plan Pack for Claude Code

**RahatNet** is an autonomous emergency-response and relief-logistics agent swarm.
IDEA//FORGE (NxtWave AI & Agents Hackathon), **Track 2 · Problem 4**.

> When a flood cuts off roads, a team of AI agents re-plans relief deliveries in seconds,
> and a human official approves each big order before it goes out.

## How to use this pack

1. Create an empty folder for the project, e.g. `rahatnet/`, and run `git init`.
2. Copy **everything in this pack** into it, keeping the layout:
   - `CLAUDE.md` goes in the repo root. Claude Code reads it automatically every session.
   - `docs/` holds the full specification.
   - `prompts/` holds what you paste into Claude Code.
3. Open Claude Code in that folder.
4. Paste the contents of `prompts/00_KICKOFF.md`.
5. After each phase passes its acceptance criteria, paste the next phase prompt from `prompts/PHASE_PROMPTS.md`.
6. Keep an eye on `PROGRESS.md`. Claude Code updates it after every phase.

## Files

| File | What it is |
|---|---|
| `CLAUDE.md` | Rules Claude Code must follow (principles, layout, commands, workflow) |
| `docs/01_PRD.md` | Product requirements: problem, users, features, priority cutline |
| `docs/02_ARCHITECTURE.md` | System design, agent loop, event flow, tech stack |
| `docs/03_AGENTS.md` | Each agent's job, inputs and outputs, LLM prompt, validator rules |
| `docs/04_DATA_AND_SCENARIO.md` | Assam flood scenario, road graph, flood presets, units |
| `docs/05_API_CONTRACT.md` | REST and WebSocket contract between backend and frontend |
| `docs/06_FRONTEND.md` | Dashboard layout, map layers, interactions |
| `docs/07_BUILD_PLAN.md` | Phases with tasks, acceptance criteria, and a calendar |
| `docs/08_DEMO_SCRIPT.md` | 2:30 demo video script (build toward this) |
| `docs/09_SUBMISSION_CHECKLIST.md` | Everything to tick before submitting |
| `prompts/00_KICKOFF.md` | First message to paste into Claude Code |
| `prompts/PHASE_PROMPTS.md` | One prompt per phase |

## Key dates

- Submissions open: **20 Nov, 6:00 PM IST**
- Submission deadline: **22 Nov, 11:59 PM IST** (aim to submit by **8:00 PM**)

> ⚠️ Confirm in the intro-session recording whether coding is allowed before 20 Nov.
> If it isn't, use 18–19 Nov only for data prep, API-key setup and spike tests outside the repo.
