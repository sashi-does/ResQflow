import { ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROLE_LABEL, useSession } from '../auth'
import { logout } from '../lib/logout'
import { HOME } from '../lib/nav'
import { navigate } from '../router'

export function Forbidden() {
  const session = useSession()
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 p-6" data-testid="forbidden">
      <div className="max-w-md text-center">
        <ShieldX className="mx-auto size-12 text-slate-400" aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">403: not your page</h1>
        <p className="mt-2 text-slate-600">
          {session
            ? `You're signed in as ${session.user.name} (${ROLE_LABEL[session.user.role]}). This page belongs to a different role.`
            : 'You need to sign in first.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {session && <Button onClick={() => navigate(HOME[session.user.role])}>Go to my pages</Button>}
          <Button variant="outline" onClick={logout}>
            Sign in as someone else
          </Button>
        </div>
      </div>
    </div>
  )
}
