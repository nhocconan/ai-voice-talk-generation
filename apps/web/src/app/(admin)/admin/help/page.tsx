import type { Metadata } from "next"
import fs from "node:fs/promises"
import path from "node:path"
import { marked } from "marked"

export const metadata: Metadata = { title: "Admin — Help" }

export const dynamic = "force-static"

async function loadManual(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), "../../docs/ADMIN_MANUAL.md"),
    path.resolve(process.cwd(), "../../../docs/ADMIN_MANUAL.md"),
    path.resolve(process.cwd(), "docs/ADMIN_MANUAL.md"),
  ]
  for (const p of candidates) {
    try {
      return await fs.readFile(p, "utf8")
    } catch {
      // try next
    }
  }
  return "# Admin Manual\n\nSource file not found at runtime. See `docs/ADMIN_MANUAL.md` in the repository."
}

export default async function AdminHelpPage() {
  const md = await loadManual()
  const html = await marked.parse(md, { gfm: true, breaks: false })
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-display-card">Administrator Help</h1>
        <p className="text-body text-[var(--color-text-secondary)] mt-1">
          Full administrator manual. Also available in the repo at <code>docs/ADMIN_MANUAL.md</code>.
        </p>
      </div>
      <article
        className="admin-manual prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style>{`
        .admin-manual h1 { font-size: 1.5rem; font-weight: 600; margin: 1.5rem 0 0.75rem; }
        .admin-manual h2 { font-size: 1.15rem; font-weight: 600; margin: 1.5rem 0 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--color-border); }
        .admin-manual h3 { font-size: 1rem; font-weight: 600; margin: 1rem 0 0.4rem; }
        .admin-manual h4 { font-size: 0.95rem; font-weight: 600; margin: 0.75rem 0 0.3rem; }
        .admin-manual p { margin: 0.5rem 0; line-height: 1.6; color: var(--color-text-secondary); }
        .admin-manual ul, .admin-manual ol { margin: 0.5rem 0 0.5rem 1.25rem; color: var(--color-text-secondary); }
        .admin-manual li { margin: 0.2rem 0; line-height: 1.55; }
        .admin-manual code { background: var(--color-surface-1); padding: 0 0.25rem; border-radius: 3px; font-size: 0.85em; }
        .admin-manual pre { background: var(--color-surface-1); padding: 0.75rem; border-radius: 6px; overflow-x: auto; font-size: 0.8rem; margin: 0.5rem 0; }
        .admin-manual pre code { background: transparent; padding: 0; }
        .admin-manual table { border-collapse: collapse; margin: 0.75rem 0; font-size: 0.85rem; }
        .admin-manual th, .admin-manual td { border: 1px solid var(--color-border); padding: 0.4rem 0.6rem; text-align: left; }
        .admin-manual th { background: var(--color-surface-1); font-weight: 600; }
        .admin-manual a { color: var(--color-accent); text-decoration: underline; }
        .admin-manual blockquote { border-left: 3px solid var(--color-border); padding: 0.25rem 0.75rem; margin: 0.5rem 0; color: var(--color-text-muted); }
        .admin-manual hr { border: 0; border-top: 1px solid var(--color-border); margin: 1.25rem 0; }
      `}</style>
    </div>
  )
}
