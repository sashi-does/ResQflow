import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { api } from './api'
import { useSession } from './auth'
import { AppShell } from './components/app/AppShell'
import { findPage, HOME } from './lib/nav'
import { Forbidden } from './pages/Forbidden'
import { Intro } from './pages/Intro'
import { Login } from './pages/Login'
import { CampAlerts } from './pages/camp/Alerts'
import { CampDeliveries } from './pages/camp/Deliveries'
import { CampMyCamp } from './pages/camp/MyCamp'
import { CampSendReport } from './pages/camp/SendReport'
import { DriverHistory } from './pages/driver/History'
import { DriverMyTrip } from './pages/driver/MyTrip'
import { DriverReportRoad } from './pages/driver/ReportRoad'
import { RerouteAlert } from './pages/driver/RerouteAlert'
import { OfficerAgents } from './pages/officer/Agents'
import { OfficerApprovals } from './pages/officer/Approvals'
import { OfficerAsk } from './pages/officer/Ask'
import { OfficerFieldReports } from './pages/officer/FieldReports'
import { OfficerOverview } from './pages/officer/Overview'
import { OfficerOperations } from './pages/officer/Operations'
import { OfficerReports } from './pages/officer/Reports'
import { OfficerSimulation } from './pages/officer/Simulation'
import { WarehouseQueue } from './pages/warehouse/LoadingQueue'
import { WarehouseReceive } from './pages/warehouse/ReceiveStock'
import { WarehouseStock } from './pages/warehouse/Stock'
import { navigate, usePath } from './router'
import { useStore } from './store'
import { useLiveSocket } from './ws'

const PAGES: Record<string, () => React.ReactNode> = {
  'officer/overview': OfficerOverview,
  'officer/operations': OfficerOperations,
  'officer/approvals': OfficerApprovals,
  'officer/field-reports': OfficerFieldReports,
  'officer/agents': OfficerAgents,
  'officer/ask': OfficerAsk,
  'officer/reports': OfficerReports,
  'officer/simulation': OfficerSimulation,
  'camp/my-camp': CampMyCamp,
  'camp/report': CampSendReport,
  'camp/deliveries': CampDeliveries,
  'camp/alerts': CampAlerts,
  'driver/trip': DriverMyTrip,
  'driver/report-road': DriverReportRoad,
  'driver/history': DriverHistory,
  'warehouse/stock': WarehouseStock,
  'warehouse/queue': WarehouseQueue,
  'warehouse/receive': WarehouseReceive,
}

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, true), [to])
  return null
}

export default function App() {
  const session = useSession()
  const path = usePath()
  const setHealth = useStore((s) => s.setHealth)
  const setScenario = useStore((s) => s.setScenario)
  const setError = useStore((s) => s.setError)
  const token = session?.token

  useLiveSocket()

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null))
  }, [setHealth])
  useEffect(() => {
    if (!token) return
    api
      .scenario()
      .then(setScenario)
      .catch((e: unknown) => setError(String(e)))
  }, [token, setScenario, setError])

  const page = findPage(path)
  useEffect(() => {
    if (page) document.title = `${page.title} · ResQflow`
  }, [page])

  let body: React.ReactNode
  if (path === '/' || path === '') body = <Intro />
  else if (path === '/login') body = session ? <Redirect to={HOME[session.user.role]} /> : <Login />
  else if (path === '/403') body = <Forbidden />
  else if (!session) body = <Redirect to="/login" />
  else if (!page) {
    const role = path.split('/')[1]
    body = ['officer', 'camp', 'driver', 'warehouse'].includes(role) ? <Forbidden /> : <Redirect to={HOME[session.user.role]} />
  } else if (page.role !== session.user.role) body = <Forbidden />
  else {
    const Page = PAGES[`${page.role}/${page.slug}`]
    body = (
      <>
        <AppShell session={session} page={page}>
          <Page />
        </AppShell>
        {session.user.role === 'driver' && <RerouteAlert />}
      </>
    )
  }
  return (
    <TooltipProvider>
      {body}
      <Toaster position="bottom-right" richColors closeButton />
    </TooltipProvider>
  )
}
