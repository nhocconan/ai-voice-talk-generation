"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { Session } from "next-auth"
import { signOut } from "next-auth/react"
import { useTranslations } from "next-intl"
import {
  LayoutDashboardIcon, MicIcon, PlayCircleIcon, HistoryIcon,
  UsersIcon, SettingsIcon, LogOutIcon, MenuIcon, XIcon, AudioLinesIcon,
  ActivityIcon, HelpCircleIcon,
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "./ThemeToggle"
import { LanguageSwitcher } from "./LanguageSwitcher"

const appNav = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboardIcon },
  { href: "/voices", key: "voices", icon: MicIcon },
  { href: "/generate", key: "generate", icon: AudioLinesIcon },
  { href: "/history", key: "history", icon: HistoryIcon },
] as const

const adminNav = [
  { href: "/admin/users", key: "navUsers", icon: UsersIcon },
  { href: "/admin/providers", key: "navProviders", icon: SettingsIcon },
  { href: "/admin/library", key: "library", icon: MicIcon },
  { href: "/admin/generations", key: "generations", icon: PlayCircleIcon },
  { href: "/admin/audit", key: "audit", icon: HistoryIcon },
  { href: "/admin/system-health", key: "navSystemHealth", icon: ActivityIcon },
  { href: "/admin/settings", key: "navSettings", icon: SettingsIcon },
  { href: "/admin/help", key: "help", icon: HelpCircleIcon },
] as const

interface Props {
  children: React.ReactNode
  session: Session
}

export function AppShell({ children, session }: Props) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const tNav = useTranslations("nav")
  const tAdmin = useTranslations("admin")
  const isAdmin = session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN"

  return (
    <div className="min-h-screen bg-[var(--color-surface-1)] flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[var(--z-sticky)] w-56 bg-[var(--color-surface-0)] flex flex-col transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ borderRight: "1px solid var(--color-border)" }}
      >
        {/* Logo */}
        <div className="px-6 py-5" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <Link href="/dashboard" className="block">
            <span className="text-display-card text-[var(--color-text-primary)]">Voice</span>
            <span className="text-display-card" style={{ color: "var(--color-accent)" }}>Studio</span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {appNav.map(({ href, key, icon: Icon }) => (
            <NavItem key={href} href={href} label={tNav(key)} icon={<Icon size={16} />} active={pathname.startsWith(href)} onClick={() => setMobileOpen(false)} />
          ))}

          {isAdmin && (
            <>
              <div className="pt-4 pb-1 px-3">
                <span className="text-micro text-[var(--color-text-muted)] uppercase tracking-widest">{tNav("admin")}</span>
              </div>
              {adminNav.map(({ href, key, icon: Icon }) => (
                <NavItem key={href} href={href} label={tAdmin(key)} icon={<Icon size={16} />} active={pathname.startsWith(href)} onClick={() => setMobileOpen(false)} />
              ))}
            </>
          )}
        </nav>

        {/* Theme + language controls */}
        <div
          className="flex items-center justify-between gap-2 px-3 py-3"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        {/* User footer */}
        <div className="px-3 py-4" style={{ borderTop: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-3 px-3 py-2 mb-1 rounded-[var(--radius-md)]">
            <div className="w-7 h-7 rounded-full bg-[var(--color-surface-1)] flex items-center justify-center text-micro font-medium">
              {session.user.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-small truncate">{session.user.name}</div>
              <div className="text-micro text-[var(--color-text-muted)] truncate">{session.user.role}</div>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-caption text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <LogOutIcon size={14} />
            {tNav("logout")}
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[var(--z-overlay)] bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 lg:ml-56">
        {/* Top bar (mobile) */}
        <header
          className="sticky top-0 z-[var(--z-sticky)] flex items-center h-14 px-4 bg-[var(--color-surface-0)] lg:hidden"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-1)]"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <XIcon size={18} /> : <MenuIcon size={18} />}
          </button>
          <span className="ml-3 text-nav">Voice Studio</span>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        <main className="p-6 lg:p-8 max-w-5xl">
          {children}
        </main>
      </div>
    </div>
  )
}

function NavItem({
  href, label, icon, active, onClick,
}: { href: string; label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-md)] text-nav transition-colors",
        active
          ? "bg-[var(--color-surface-1)] text-[var(--color-text-primary)] font-medium"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text-primary)]",
      )}
    >
      {icon}
      {label}
    </Link>
  )
}
