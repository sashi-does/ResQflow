import { Laptop, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { setTheme, useTheme } from '../../lib/theme'

export function ThemeToggle() {
  const theme = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="text-slate-600" aria-label={`Theme: ${theme}`} data-testid="theme-toggle">
          {theme === 'dark' ? <Moon /> : <Sun />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setTheme('light')} data-testid="theme-light">
          <Sun /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme('dark')} data-testid="theme-dark">
          <Moon /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme('system')}>
          <Laptop /> Match my device
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
