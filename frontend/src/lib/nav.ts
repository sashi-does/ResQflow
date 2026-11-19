import type { LucideIcon } from 'lucide-react'
import {
  Bell,
  Bot,
  CircleCheckBig,
  ClipboardList,
  FileBarChart,
  FlaskConical,
  History,
  LayoutDashboard,
  Map,
  MessageSquareText,
  Navigation,
  Package,
  PackagePlus,
  Send,
  Sparkles,
  TentTree,
  TriangleAlert,
  Truck,
} from 'lucide-react'
import type { Role } from '../auth'

/** One page in a role's sidebar. `why` drives the "ⓘ Why this page" popover (Problem → What it does → Who uses it). */
export interface PageDef {
  role: Role
  slug: string
  label: string
  icon: LucideIcon
  title: string
  purpose: string
  why: { problem: string; does: string; who: string }
  demo?: boolean
}

export const PAGES: PageDef[] = [
  // ---------------------------------------------------------------- District Officer
  {
    role: 'officer',
    slug: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    title: 'Overview',
    purpose: 'The whole flood response at a glance: what is critical and what needs you now.',
    why: {
      problem: 'There is no single live picture of the flood: camps, trucks and roads are tracked over phone calls.',
      does: 'Shows critical camps, people at risk, trucks on the road and closed roads, plus everything waiting for your decision.',
      who: 'The District Officer, first thing every shift and whenever something changes.',
    },
  },
  {
    role: 'officer',
    slug: 'operations',
    label: 'Live Operations',
    icon: Map,
    title: 'Live Operations',
    purpose: 'The live map of camps, warehouses, trucks, floods and detours. Click anything for details.',
    why: {
      problem: 'Nobody can see where the trucks are or which roads are under water right now.',
      does: 'Plots every camp, warehouse, truck and flood zone live; re-routes flash on the map as the AI makes them.',
      who: 'The District Officer and the control room.',
    },
  },
  {
    role: 'officer',
    slug: 'approvals',
    label: 'Approvals',
    icon: CircleCheckBig,
    title: 'Approvals',
    purpose: 'Approve large orders before trucks leave the warehouse.',
    why: {
      problem: 'An AI that moves 8 tonnes of supplies with no human sign-off is not acceptable in a disaster.',
      does: 'Queues orders over 6 t or that use a warehouse safety reserve, with the AI reason, route and ETA. You approve or reject.',
      who: 'The District Officer (or whoever holds approval authority).',
    },
  },
  {
    role: 'officer',
    slug: 'field-reports',
    label: 'Field Reports',
    icon: MessageSquareText,
    title: 'Field Reports',
    purpose: 'Confirm what camps and drivers report before it changes the plan.',
    why: {
      problem: 'Ground information arrives as phone calls and messages in Assamese or English, and gets lost.',
      does: 'Shows each report as written next to what the AI understood. Big changes wait here for you to confirm; driver road reports too.',
      who: 'The District Officer.',
    },
  },
  {
    role: 'officer',
    slug: 'agents',
    label: 'AI Agents',
    icon: Bot,
    title: 'AI Agents',
    purpose: 'See which agent did what, and why. Every decision is logged in plain English.',
    why: {
      problem: 'An AI that can’t explain itself won’t be trusted in a crisis.',
      does: 'A live graph of the 8 agents passing work to each other, and the full decision log with filters and the reasoning behind each step.',
      who: 'The District Officer, auditors, and anyone asking “why did it do that?”.',
    },
  },
  {
    role: 'officer',
    slug: 'ask',
    label: 'Ask RahatNet',
    icon: Sparkles,
    title: 'Ask RahatNet',
    purpose: 'Ask questions about the live situation in plain language. Read-only: it never changes anything.',
    why: {
      problem: 'Getting a quick answer (“which camp is most at risk tonight?”) means calling five people.',
      does: 'An AI copilot that answers from live data through read-only lookups, and shows which lookups it used.',
      who: 'The District Officer.',
    },
  },
  {
    role: 'officer',
    slug: 'reports',
    label: 'Reports',
    icon: FileBarChart,
    title: 'Reports',
    purpose: 'Prove the response is working: RahatNet against a static plan on the same floods.',
    why: {
      problem: 'Nobody can tell whether the response worked, or what to fix next time.',
      does: 'Compares RahatNet with a fixed 06:00 plan on the same floods, and writes an after-action report (numbers from code) you can save as PDF.',
      who: 'The District Officer, the state disaster authority, reviewers.',
    },
  },
  {
    role: 'officer',
    slug: 'simulation',
    label: 'Simulation',
    icon: FlaskConical,
    title: 'Simulation (demo tools)',
    purpose: 'Run the Assam flood scenario: start the clock, change speed, trigger floods.',
    demo: true,
    why: {
      problem: 'A demo needs a flood on cue. In real use this page would not exist: floods come from the field.',
      does: 'Starts the scripted 24-hour scenario, sets the speed, and triggers or recedes floods. These controls exist only here.',
      who: 'The presenter, during the demo.',
    },
  },
  // ---------------------------------------------------------------- Camp Coordinator
  {
    role: 'camp',
    slug: 'my-camp',
    label: 'My Camp',
    icon: TentTree,
    title: 'My Camp',
    purpose: 'How long your supplies will last, and when help is coming.',
    why: {
      problem: 'Camps run out of water before anyone outside notices.',
      does: 'Shows days of cover for water, food and medical kits, the camp status, and incoming trucks.',
      who: 'The Camp Coordinator.',
    },
  },
  {
    role: 'camp',
    slug: 'report',
    label: 'Send Report',
    icon: Send,
    title: 'Send Report',
    purpose: 'Tell the district what is happening, in Assamese or English.',
    why: {
      problem: 'Reporting needs means phone calls in the local language that get lost or misheard.',
      does: 'You write (or speak) as you normally would. The AI turns it into structured updates; big changes go to the District Officer to confirm.',
      who: 'The Camp Coordinator.',
    },
  },
  {
    role: 'camp',
    slug: 'deliveries',
    label: 'Deliveries',
    icon: Package,
    title: 'Deliveries',
    purpose: 'Track incoming trucks and confirm what you received.',
    why: {
      problem: 'Nobody knows when help arrives, and there is no proof of what was received.',
      does: 'Shows incoming trucks with live ETAs and delays, and lets you confirm deliveries, including any shortfall.',
      who: 'The Camp Coordinator.',
    },
  },
  {
    role: 'camp',
    slug: 'alerts',
    label: 'Alerts',
    icon: Bell,
    title: 'Alerts',
    purpose: 'Messages about your camp’s deliveries, in Assamese and English.',
    why: {
      problem: 'Camps hear about dispatches and delays late, or not at all.',
      does: 'Dispatch, delay and arrival messages, written from live data in both languages.',
      who: 'The Camp Coordinator and camp volunteers.',
    },
  },
  // ---------------------------------------------------------------- Driver
  {
    role: 'driver',
    slug: 'trip',
    label: 'My Trip',
    icon: Navigation,
    title: 'My Trip',
    purpose: 'Where you are going, what you carry, and the safe road to take.',
    why: {
      problem: 'Drivers drive into flooded roads because nobody tells them the plan changed.',
      does: 'Shows the current job, the road-by-road route and ETA. If a road floods, a full-screen alert gives the new route.',
      who: 'The truck driver.',
    },
  },
  {
    role: 'driver',
    slug: 'report-road',
    label: 'Report Road',
    icon: TriangleAlert,
    title: 'Report Road',
    purpose: 'Tell Command about a road problem in one tap.',
    why: {
      problem: 'What drivers see on the road never reaches the planners.',
      does: 'One tap reports waterlogging, a blockage or a landslide on your road. It goes to Command as an unverified report.',
      who: 'The truck driver.',
    },
  },
  {
    role: 'driver',
    slug: 'history',
    label: 'History',
    icon: History,
    title: 'History',
    purpose: 'Your completed trips.',
    why: {
      problem: 'There is no record of who delivered what, and when.',
      does: 'Lists your completed deliveries with times and whether they arrived on time.',
      who: 'The truck driver and the district office.',
    },
  },
  // ---------------------------------------------------------------- Warehouse
  {
    role: 'warehouse',
    slug: 'stock',
    label: 'Stock',
    icon: ClipboardList,
    title: 'Stock',
    purpose: 'What you have, what is promised, and how close you are to the safety reserve.',
    why: {
      problem: 'There is no live view of stock against demand, and over-dispatch drains the emergency reserve.',
      does: 'For each item: on hand, committed to trucks, available to plan, and the 20% safety reserve line.',
      who: 'The Warehouse Manager.',
    },
  },
  {
    role: 'warehouse',
    slug: 'queue',
    label: 'Loading Queue',
    icon: Truck,
    title: 'Loading Queue',
    purpose: 'Approved orders to load, in pickup order.',
    why: {
      problem: 'Trucks wait at the loading bay because nobody knows what to load next.',
      does: 'Lists approved orders for this warehouse with truck and ETA. Mark each one loaded.',
      who: 'The Warehouse Manager and loading staff.',
    },
  },
  {
    role: 'warehouse',
    slug: 'receive',
    label: 'Receive Stock',
    icon: PackagePlus,
    title: 'Receive Stock',
    purpose: 'Log an incoming consignment so the plan uses it straight away.',
    why: {
      problem: 'Availability goes stale: new stock arrives but planners don’t know.',
      does: 'Records a consignment; availability updates and the AI coordinator re-plans.',
      who: 'The Warehouse Manager.',
    },
  },
]

export const HOME: Record<Role, string> = {
  officer: '/officer/overview',
  camp: '/camp/my-camp',
  driver: '/driver/trip',
  warehouse: '/warehouse/stock',
}

export function pagesFor(role: Role): PageDef[] {
  return PAGES.filter((p) => p.role === role)
}

export function pathOf(p: PageDef): string {
  return `/${p.role}/${p.slug}`
}

export function findPage(path: string): PageDef | undefined {
  const [, role, slug] = path.split('/')
  return PAGES.find((p) => p.role === role && p.slug === slug)
}

