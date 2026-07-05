"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

export type Theme = "light" | "dark" | "system"
type Resolved = "light" | "dark"

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: Resolved
  setTheme: (t: Theme) => void
}

/** Kept in sync with the inline no-flash script in `app/layout.tsx`. */
export const THEME_STORAGE_KEY = "vs-theme"

const ThemeContext = createContext<ThemeContextValue | null>(null)

function systemPref(): Resolved {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function applyClass(resolved: Resolved): void {
  // Suppress CSS transitions during the swap so colours snap instantly instead
  // of animating element-by-element (the "disableTransitionOnChange" trick).
  const style = document.createElement("style")
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{transition:none !important;animation:none !important}",
    ),
  )
  document.head.appendChild(style)

  document.documentElement.classList.toggle("dark", resolved === "dark")

  // Force a reflow so the no-transition rule takes effect before we remove it.
  window.getComputedStyle(document.body)
  window.setTimeout(() => document.head.removeChild(style), 1)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Must match the server render + no-flash script default so hydration is stable.
  const [theme, setThemeState] = useState<Theme>("system")
  const [resolvedTheme, setResolvedTheme] = useState<Resolved>("light")

  // Hydrate the chosen preference from storage once mounted.
  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null
    if (stored === "light" || stored === "dark" || stored === "system") {
      setThemeState(stored)
    }
  }, [])

  // Resolve + apply whenever the preference changes; track OS changes in `system`.
  useEffect(() => {
    const resolved = theme === "system" ? systemPref() : theme
    setResolvedTheme(resolved)
    applyClass(resolved)

    if (theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      const next = mq.matches ? "dark" : "light"
      setResolvedTheme(next)
      applyClass(next)
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t)
    } catch {
      /* storage may be unavailable (private mode) — apply in-memory only */
    }
    setThemeState(t)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider")
  return ctx
}
