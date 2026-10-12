import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { Tip } from '#/ui/Hint.tsx'

type ThemeMode = 'light' | 'dark' | 'auto'

function getInitialMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'auto'
  }

  const stored = window.localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark' || stored === 'auto') {
    return stored
  }

  return 'auto'
}

function applyThemeMode(mode: ThemeMode) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode

  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(resolved)

  if (mode === 'auto') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', mode)
  }

  document.documentElement.style.colorScheme = resolved
}

export default function ThemeToggle() {
  // Ленивая инициализация вместо setState в эффекте (react-hooks/set-state-in-effect)
  const [mode, setMode] = useState<ThemeMode>(getInitialMode)

  useEffect(() => {
    applyThemeMode(mode)
  }, [mode])

  useEffect(() => {
    if (mode !== 'auto') {
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyThemeMode('auto')

    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [mode])

  function toggleMode() {
    const nextMode: ThemeMode =
      mode === 'light' ? 'dark' : mode === 'dark' ? 'auto' : 'light'
    setMode(nextMode)
    applyThemeMode(nextMode)
    window.localStorage.setItem('theme', nextMode)
  }

  const label =
    mode === 'auto'
      ? 'Тема: авто (как в системе). Нажмите, чтобы включить светлую.'
      : `Тема: ${mode === 'dark' ? 'тёмная' : 'светлая'}. Нажмите, чтобы сменить.`

  const Icon = mode === 'auto' ? Monitor : mode === 'dark' ? Moon : Sun

  return (
    <Tip text={label} side="bottom">
      <Button variant="outline" size="sm" onClick={toggleMode} aria-label={label} className="shrink-0">
        <Icon />
        <span className="hidden sm:inline">{mode === 'auto' ? 'Авто' : mode === 'dark' ? 'Тёмная' : 'Светлая'}</span>
      </Button>
    </Tip>
  )
}
