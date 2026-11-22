# ResQflow: flood-relief agent swarm for Assam

> **When the roads go under, the supplies don't stop.**

ResQflow is a team of cooperating AI agents that keeps relief supplies moving during the Assam floods.
When a flood closes a highway, the agents re-route trucks that are already on the road, re-plan who gets what, and
explain every decision in plain English. A District Officer approves every large order before it goes out.

IDEA//FORGE AI & Agents Hackathon · **Track 2: Climate, Resource Infrastructure & Global Supply Resilience** ·
Problem 4: *Autonomous Emergency Response & Supply Chain Logistics Swarm*.

**AI and agents**
![Claude](https://img.shields.io/badge/Claude-Haiku_5.5-D97757?logo=anthropic&logoColor=white)
![Anthropic SDK](https://img.shields.io/badge/Anthropic_SDK-Python-191919?logo=anthropic&logoColor=white)
![OpenRouter](https://img.shields.io/badge/OpenRouter-LLM_gateway-6566F1)
![NVIDIA Nemotron](https://img.shields.io/badge/NVIDIA-Nemotron_3.5-76B900?logo=nvidia&logoColor=white)
![Multi-agent](https://img.shields.io/badge/Multi--agent-8_agents-0F766E)
![Tool use](https://img.shields.io/badge/LLM-tool_use_%2B_JSON_schema-0F766E)

**Backend**
![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Uvicorn](https://img.shields.io/badge/Uvicorn-ASGI-499848)
![Pydantic](https://img.shields.io/badge/Pydantic-v2-E92063?logo=pydantic&logoColor=white)
![WebSockets](https://img.shields.io/badge/WebSockets-live_updates-010101)
![NetworkX](https://img.shields.io/badge/NetworkX-road_graph-2C5BB4)
![Shapely](https://img.shields.io/badge/Shapely-flood_geometry-4B8BBE)
![HTTPX](https://img.shields.io/badge/HTTPX-1E3A8A)
![JWT](https://img.shields.io/badge/JWT-HS256-000000?logo=jsonwebtokens&logoColor=white)
![bcrypt](https://img.shields.io/badge/bcrypt-passwords-334155)

**Data**
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-history-4169E1?logo=postgresql&logoColor=white)
![Prisma Postgres](https://img.shields.io/badge/Prisma_Postgres-hosted_DB-2D3748?logo=prisma&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-users-003B57?logo=sqlite&logoColor=white)
![Open-Meteo](https://img.shields.io/badge/Open--Meteo-weather-FF8C00)

**Frontend**
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-Radix-000000?logo=shadcnui&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-react--leaflet-199900?logo=leaflet&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-state-433E38)
![lucide](https://img.shields.io/badge/lucide-icons-F56565)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=white)

**Tooling and deployment**
![uv](https://img.shields.io/badge/uv-Python_packaging-DE5FE9?logo=uv&logoColor=white)
![pytest](https://img.shields.io/badge/pytest-0A9EDC?logo=pytest&logoColor=white)
![Ruff](https://img.shields.io/badge/Ruff-lint-D7FF64?logo=ruff&logoColor=black)
![Playwright](https://img.shields.io/badge/Playwright-e2e-2EAD33?logo=playwright&logoColor=white)
![axe-core](https://img.shields.io/badge/axe--core-accessibility-663399)
![oxlint](https://img.shields.io/badge/oxlint-lint-F7DF1E)
![Vercel](https://img.shields.io/badge/Vercel-deploy-000000?logo=vercel&logoColor=white)

## Quick start (no API keys needed)

```bash
make setup      # uv sync (backend) + npm install (frontend)
make dev        # backend :8000 + dashboard http://localhost:5173  (BACKEND_PORT=8010 if :8000 is taken)
make headless   # the whole 24 h scenario without UI: decision log + Agentic vs Static KPIs, ~1 s
make test       # backend tests
make e2e        # browser tests (uses your installed Chrome)
```

Open http://localhost:5173/login and click a **demo account** (all fictional; password `demo1234`). Each browser tab keeps
its own login (sessionStorage), so you can open four tabs side by side, one per role.

## Four roles, one live world (real login, role-based access)

| Role | Demo login | Pages |
|---|---|---|
| District Officer | `officer` (Ritu Baruah) | Overview · Command Center · Approvals · Field Reports · AI Agents · Ask ResQflow · Reports · Simulation *(demo tools: the only page with sim controls)* |
| Camp Coordinator | `camp.majuli` (Mousumi Gogoi), `camp.morigaon` (Anil Das) | My Camp · Send Report (Assamese/English, Field Intake AI) · Deliveries (confirm received) · Alerts (Assamese + English) |
| Truck Driver | `driver.t3` (Bikash Kalita) | My Trip (+ full-screen re-route alert → Acknowledge) · Report Road · History |
| Warehouse Manager | `wh.nagaon` (Pranjal Saikia) | Stock (vs 20% safety reserve) · Loading Queue (Mark loaded) · Receive Stock |

JWT (HS256, 12 h) with bcrypt-hashed seeded users in SQLite. Every endpoint checks role **and scope** (a Morigaon
coordinator can't report for Majuli → 403), the WebSocket only sends each role what it may see (a driver gets only
its own truck), and every human action is attributed by name in the decision log. Set `JWT_SECRET` in production.

## Using a real model
Put a key in `.env` (git-ignored):
```
LLM_PROVIDER=anthropic          # or openrouter
ANTHROPIC_API_KEY=...           # or OPENROUTER_API_KEY=... with LLM_MODEL=anthropic/claude-haiku-5.5
```
If the key is rejected or the account has no credits, ResQflow logs it once and keeps running offline.

## Where the AI is, and how it is kept honest
- **Coordinator** (Claude, `LLM_MODEL`, default `claude-haiku-5-5`) proposes the allocation plan; a deterministic **validator** checks every
  plan, rejections go back with the violations (max 2 retries), then a heuristic planner takes over. Large/critical orders go to a human.
- **Field Intake** reads coordinators' free text (English/Assamese) into structured JSON, validated with Pydantic; big or uncertain changes
  wait for Command to confirm. Items the system doesn't stock (ORS, baby food) become notes, never numbers.
- **Ask ResQflow** copilot answers from a *frozen copy* of the live state with read-only tools (`get_camp`, `get_route`, `simulate_closure`).
- **After-action report**: numbers are filled in by code from the KPIs and the log; the AI only writes the prose (an audit rejects any
  figure it typed itself).
- **No key?** Everything still runs: the heuristic planner plans, the two scripted demo field reports use *recorded* AI readings
  (labelled as such), the copilot says it needs a key, and the report narrative comes from a template.

## How the "Static" baseline works (the comparison is honest)

Every KPI is measured on two copies of the same world, stepped in lockstep with fixed 30-second steps:
**Agentic** (ResQflow's agents) and **Static** (a conventional plan-once approach). Both get exactly the same:

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

## Results (headless, seed 42, mock coordinator, 24 sim-hours)

| KPI | Agentic | Static | Δ |
|---|---:|---:|---:|
| People-hours without water | 27 | 22,582 | **−100%** |
| People-hours without food | 0 | 25 | −100% |
| On-time deliveries | 100% | 93.3% | +7 pt |
| Deliveries | 17 | 15 | +13% |
| Truck-hours stuck | 0 | 26.9 | −100% |
| Avg delivery time | 4h59m | 3h43m | +34% *(worse)* |
| Supplies delivered | 107.8 t | 93.0 t | +16% |

Average delivery time is worse for ResQflow on purpose: it accepts long, safe detours and serves far camps the static plan
never reaches. The hourly weather check matters here: the Dhemaji heavy-rain advisory at 06:00 lifts Dhemaji's priority
from the first plan.

**The browser walkthrough** (the officer approves as orders arrive, Majuli's Assamese report at 16:00, confirmed) gave:
water 2,010 vs 72,340 people-hours (−97%), food 0 vs 25, truck-hours stuck 0 vs 26.9, supplies 112.6 t vs 93.0 t;
on-time 83% vs 87% and average delivery time are worse. **Results depend on timing** (when orders are approved, when
reports arrive); the comparison is always computed by code from the run, never edited.

## Three demo cases

Same map, warehouses, camps and trucks; a different flood day each time (**Simulation → Choose a case**, or
`uv run python scripts/run_headless.py --case <id>`). Headless, offline planner, seed 42:

| Case | What happens | People-hours without water (ResQflow vs static) | Truck-hours stuck |
|---|---|---:|---:|
| `highway` · Highway flood | NH-715 floods under Truck T3; Majuli ferry stops; Morigaon cut off | 27 vs 22,582 (−100%) | 0 vs 26.9 |
| `northbank` · North bank cut off | Subansiri and Jia Bharali floods split the north bank; 1,500 people reach Dhemaji; Nagaon warehouse offline 12:10–17:00 | 0 vs 7,252 (−100%) | 7.0 vs 11.4 |
| `surge` · Lower Assam surge | 4,000 more people at Barpeta and Goalpara; Barpeta's road floods; a consignment arrives | 15,343 vs 37,227 (−59%) | 0 vs 14.3 |

Honest gaps: in `northbank` one truck is stranded ~7 h when the Majuli ferry stops and no safe road is left; in `surge`
Barpeta is cut off for 5 hours in both runs (food: 15,834 vs 22,350 people-hours). Restocking from suppliers is an agent
decision, so only ResQflow's run gets it; the static plan never re-orders.

## Weather, supplies and disruptions

- **Weather, every hour:** the Monitor re-reads the 24-hour rain forecast for every district each simulated hour (Open-Meteo
  live, or a cached sample offline), raises a heavy-rain advisory when a district crosses 64.5 mm/24 h and lifts it when the
  outlook falls back. Advisories raise the priority of the camps there.
- **Regional suppliers:** the **Supply agent** watches each warehouse and, when free stock of any item falls below 35% of
  opening stock, re-orders from that region's supplier (simulated) with a lead time of 4–6 hours. The arrival triggers a re-plan.
- **Supply disruptions:** a warehouse can go offline (flooded yard). Nothing can be loaded there, orders waiting on it are
  recalled, and the Coordinator plans from the other warehouses until it reopens; trucks that wait at a closed yard count as stuck.

## Seeing the agents coordinate, and keeping history

- Every decision-log entry belongs to a **coordination cycle** (what changed → the plan → its checks → dispatch → approvals).
  **AI Agents** lights up the agents of a cycle in the order they acted and can **Replay** it; clicking a cycle or a log
  entry opens a side panel with every step and the **AI conversation** behind it (what the agent sent, what the model answered).
- With `DATABASE_URL` (Postgres) set, every run, log entry, cycle, AI conversation, field report and hourly KPI snapshot is
  saved by a background writer (**Reports → Saved runs**). Unset or unreachable: memory only, nothing breaks.
- In the live dashboard the clock **waits while the AI plans** (both runs pause, so the comparison stays fair). Routine
  hourly re-plans use the instant rule-based planner; the AI is asked when something changes.

## Caveats
- Map tiles (Esri World Light Gray) need an internet connection. Everything else runs offline with no keys.
- Road geometry is straight-line between towns (deterministic, so flood tests are reproducible).
- `DEMO_INJECT_FAULT=true` (off by default) corrupts exactly one coordinator plan per demo run, so the validator's
  rejection-and-retry is visible on camera. It is labelled "[demo]" in the feed. It can also be toggled on the officer's Simulation page.

