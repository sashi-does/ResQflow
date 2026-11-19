# RahatNet: flood-relief agent swarm for Assam

> **When the roads go under, the supplies don't stop.**

RahatNet is a team of cooperating AI agents that keeps relief supplies moving during the Assam floods.
When a flood closes a highway, the agents re-route trucks that are already on the road, re-plan who gets what, and
explain every decision in plain English. A District Officer approves every large order before it goes out.

IDEA//FORGE AI & Agents Hackathon · Track 2 · Problem 4: *Autonomous Emergency Response & Supply Chain Logistics Swarm*.

> 🚧 Work in progress. This README is completed in Phase 9 (architecture, video, deploy link).

![Re-route flash](docs/screenshots/02-flood-reroute-flash.png)

## Quick start (no API keys needed)

```bash
make setup      # uv sync (backend) + npm install (frontend)
make dev        # backend :8000 + dashboard http://localhost:5173  (BACKEND_PORT=8010 if :8000 is taken)
make headless   # the whole 24 h scenario without UI: decision log + Agentic vs Static KPIs, ~1 s
make test       # backend tests
make e2e        # browser smoke test (uses your installed Chrome), writes docs/screenshots/
```

Open http://localhost:5173 → **Watch the live demo**. Keyboard on `/command`: `Space` play/pause · `1`–`4` trigger floods · `A` approve the top order.

## Four roles, one live world ("View as" switcher, no login)

| Role | Route | What they do |
|---|---|---|
| District Command | `/command` | Live map, agent feed, **Agents** graph, approvals (with an approval policy), confirmations, **Ask RahatNet** copilot, after-action report |
| Camp Coordinator | `/camp/C7` | Phone view: supplies, incoming trucks, **free-text field reports in English or Assamese** (Field Intake AI), delivery receipts |
| Driver | `/driver/T3` | Phone view: job, road-by-road route, **full-screen re-route alert + Acknowledge**, report road problems (unverified until confirmed) |
| Warehouse | `/warehouse/W2` | Stock vs safety reserve, loading queue, stock adjustments |

## Where the AI is, and how it is kept honest
- **Coordinator** (Claude, `LLM_MODEL`, default `claude-haiku-5-5`) proposes the allocation plan; a deterministic **validator** checks every
  plan, rejections go back with the violations (max 2 retries), then a heuristic planner takes over. Large/critical orders go to a human.
- **Field Intake** reads coordinators' free text (English/Assamese) into structured JSON, validated with Pydantic; big or uncertain changes
  wait for Command to confirm. Items the system doesn't stock (ORS, baby food) become notes, never numbers.
- **Ask RahatNet** copilot answers from a *frozen copy* of the live state with read-only tools (`get_camp`, `get_route`, `simulate_closure`).
- **After-action report**: numbers are filled in by code from the KPIs and the log; the AI only writes the prose (an audit rejects any
  figure it typed itself).
- **No key?** Everything still runs: the heuristic planner plans, the two scripted demo field reports use *recorded* AI readings
  (labelled as such), the copilot says it needs a key, and the report narrative comes from a template.

## How the "Static" baseline works (the comparison is honest)

Every KPI is measured on two copies of the same world, stepped in lockstep with fixed 30-second steps:
**Agentic** (RahatNet's agents) and **Static** (a conventional plan-once approach). Both get exactly the same:

- scenario: 5 warehouses, 8 camps (32,600 people), 6 trucks × 8 t, same starting stock;
- floods: NH-715 Kaziranga at 07:15, Majuli ferry at 11:00, Morigaon cut off at 15:30, NH-715 reopens at 20:00;
- planning heuristic at 06:00. The first plan is identical, so the difference comes only from what happens afterwards;
- order sizing (top a camp up to 1.3 days of cover) and approval gate (orders over 6 t or using a warehouse's safety reserve).

The Static plan differs only in what a static plan can't do:

| | Agentic | Static |
|---|---|---|
| Allocation | re-planned on every flood, hourly, when a camp turns critical, and when a truck frees up | decided once at 06:00; each truck keeps its original target camp |
| Re-dispatch | any idle truck to whichever camp needs it most | idle trucks re-sent hourly to their *original* camp only |
| Floods | trucks re-routed around closed roads; orders to cut-off camps recalled | routes ignore floods; trucks drive up to the flooded road and **wait until it reopens** |
| Approvals | live UI: a human clicks, **or** the Command approval policy auto-approves *critical* orders ≤ 8 t after a 20-min countdown (reserve-use orders always need a human). Headless runs auto-approve every gated order after 20 sim-min | auto-approved after 20 sim-min (unchanged) |

KPIs: **people-hours without water** (Σ population × hours a camp has 0 L), people-hours without food, **on-time deliveries**
(arrived before the camp ran out of water), deliveries, **truck-hours stuck** (holding or waiting at a flooded road),
average delivery time (order created → delivered), and supplies delivered.

## Results so far (headless, seed 42, mock coordinator, 24 sim-hours)

| KPI | Agentic | Static | Δ |
|---|---:|---:|---:|
| People-hours without water | 3,952 | 22,582 | **−82%** |
| People-hours without food | 4,560 | 56,725 | −92% |
| On-time deliveries | 94.1% | 92.9% | +1 pt |
| Deliveries | 17 | 14 | +21% |
| Truck-hours stuck | 0 | 26.9 | −100% |
| Avg delivery time | 5h33m | 3h52m | +43% *(worse)* |
| Supplies delivered | 114.8 t | 94.8 t | +21% |

Average delivery time is worse for Agentic on purpose: it accepts long, safe detours and serves far camps the static plan never reaches.
The live dashboard gives the same picture when the officer approves promptly. In the e2e run, approving every 20 minutes gave −83% people-hours without water.

## Caveats
- Map tiles (Esri World Dark Gray) need an internet connection. Everything else runs offline with no keys.
- Road geometry is straight-line between towns (deterministic, so flood tests are reproducible).
- `DEMO_INJECT_FAULT=true` (off by default) corrupts exactly one coordinator plan per demo run, so the validator's
  rejection-and-retry is visible on camera. It is labelled "[demo]" in the feed. *(Arrives with the LLM coordinator in Phase 4.)*

The original plan pack (PRD, architecture, agents, API contract) is in [`docs/`](docs/).
