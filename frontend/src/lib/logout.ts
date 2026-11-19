import { setSession } from '../auth'
import { navigate } from '../router'
import { useStore } from '../store'

export function logout(): void {
  setSession(null)
  useStore.getState().clear()
  navigate('/login')
}
