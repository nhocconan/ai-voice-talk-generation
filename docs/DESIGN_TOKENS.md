# Design Tokens — YouNet Voice Studio

Source: [`DESIGN.md`](../DESIGN.md) (ElevenLabs-inspired system) + YouNet brand accent from younetgroup.com.

These tokens are the single source of truth. Anywhere in code that references a color, shadow, radius, or font value, reference a token — not a literal.

## 1. Implementation

Tokens live as CSS variables on `:root`, then mapped to Tailwind v4 theme via `@theme`:

```css
/* apps/web/src/styles/tokens.css */
:root {
  /* Color — Surface */
  --color-surface-0:   #ffffff;
  --color-surface-1:   #f5f5f5;
  --color-surface-warm: #f5f2ef;
  --color-surface-warm-translucent: rgba(245, 242, 239, 0.8);

  /* Color — Text */
  --color-text-primary:   #000000;
  --color-text-secondary: #4e4e4e;
  --color-text-muted:     #777169;

  /* Color — Border */
  --color-border:         #e5e5e5;
  --color-border-subtle:  rgba(0, 0, 0, 0.05);

  /* Color — YouNet accent (single accent per DESIGN.md spec) */
  --color-accent:         #E5001A; /* TODO: confirm exact hex from younetgroup.com brand */
  --color-accent-hover:   #C80017;
  --color-accent-soft:    rgba(229, 0, 26, 0.08);

  /* Color — Semantic (used sparingly) */
  --color-success: #0A7A3A;
  --color-warning: #B86B00;
  --color-danger:  #B42318;
  --color-info:    #0B5BCC;

  /* Color — Focus ring */
  --color-ring: rgb(147 197 253 / 0.5);

  /* Color — Recording / waveform */
  --color-recording:     var(--color-accent);
  --color-waveform-idle: #777169;
  --color-waveform-active: var(--color-accent);

  /* Radius */
  --radius-xs:    2px;
  --radius-sm:    4px;
  --radius-md:    8px;
  --radius-lg:    12px;
  --radius-card:  16px;
  --radius-xl:    20px;
  --radius-2xl:   24px;
  --radius-warm-btn: 30px;
  --radius-pill:  9999px;

  /* Shadow (sub-0.1 opacity per DESIGN.md) */
  --shadow-inset-edge:   rgba(0,0,0,0.075) 0px 0px 0px 0.5px inset;
  --shadow-inset-dark:   rgba(0,0,0,0.10) 0px 0px 0px 0.5px inset;
  --shadow-outline-ring: rgba(0,0,0,0.06) 0px 0px 0px 1px;
  --shadow-soft-lift:    rgba(0,0,0,0.04) 0px 4px 4px;
  --shadow-card:         rgba(0,0,0,0.4) 0px 0px 1px, rgba(0,0,0,0.04) 0px 4px 4px;
  --shadow-warm-lift:    rgba(78,50,23,0.04) 0px 6px 16px;
  --shadow-edge:         rgba(0,0,0,0.08) 0px 0px 0px 0.5px;

  /* Fonts */
  --font-display:    "Waldenburg", "Waldenburg Fallback", serif;
  --font-display-fh: "WaldenburgFH", "WaldenburgFH Fallback", serif;
  --font-body:       "Inter", "Inter Fallback", system-ui, sans-serif;
  --font-mono:       "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Spacing (8px base, extended scale per DESIGN.md) */
  --space-1:  1px;
  --space-3:  3px;
  --space-4:  4px;
  --space-8:  8px;
  --space-12: 12px;
  --space-16: 16px;
  --space-20: 20px;
  --space-24: 24px;
  --space-32: 32px;
  --space-40: 40px;
  --space-64: 64px;
  --space-96: 96px;

  /* Motion */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-emphasized: cubic-bezier(0.3, 0, 0, 1);
  --duration-fast:   120ms;
  --duration-med:    240ms;
  --duration-slow:   360ms;

  /* Z-index scale */
  --z-base:    0;
  --z-raised:  10;
  --z-sticky:  100;
  --z-overlay: 1000;
  --z-modal:   1100;
  --z-toast:   1200;
}
```

Tailwind v4 mapping (`apps/web/src/styles/globals.css`):

```css
@import "tailwindcss";
@import "./tokens.css";

@theme {
  --color-surface: var(--color-surface-0);
  --color-surface-muted: var(--color-surface-1);
  --color-surface-warm: var(--color-surface-warm);
  --color-text: var(--color-text-primary);
  --color-text-secondary: var(--color-text-secondary);
  --color-text-muted: var(--color-text-muted);
  --color-accent: var(--color-accent);
  --radius: var(--radius-md);
  --radius-pill: var(--radius-pill);
  --radius-card: var(--radius-card);
  --font-sans: var(--font-body);
  --font-display: var(--font-display);
}
```

## 2. Typography tokens

Use these semantic classes (utility recipes), not raw values:

| Class | Font | Size | Weight | Line | Letter |
|---|---|---|---|---|---|
| `.text-display-hero` | Waldenburg | 48px | 300 | 1.08 | -0.96px |
| `.text-display-section` | Waldenburg | 36px | 300 | 1.17 | normal |
| `.text-display-card` | Waldenburg | 32px | 300 | 1.13 | normal |
| `.text-body-lg` | Inter | 20px | 400 | 1.35 | normal |
| `.text-body` | Inter | 18px | 400 | 1.60 | 0.18px |
| `.text-body-ui` | Inter | 16px | 400 | 1.50 | 0.16px |
| `.text-body-med` | Inter | 16px | 500 | 1.50 | 0.16px |
| `.text-nav` | Inter | 15px | 500 | 1.47 | 0.15px |
| `.text-button` | Inter | 15px | 500 | 1.47 | normal |
| `.text-button-uppercase` | WaldenburgFH | 14px | 700 | 1.10 | 0.7px |
| `.text-caption` | Inter | 14px | 400 | 1.43 | 0.14px |
| `.text-small` | Inter | 13px | 500 | 1.38 | normal |
| `.text-micro` | Inter | 12px | 500 | 1.33 | normal |
| `.text-code` | Geist Mono | 13px | 400 | 1.85 | normal |

## 3. Component token recipes

### Primary pill (black)
```
bg-black text-white h-[36px] px-[14px] rounded-[9999px] text-button
```

### White pill (secondary)
```
bg-surface text-text h-[36px] px-[14px] rounded-[9999px] text-button
shadow-[var(--shadow-card)]
```

### Warm-stone CTA (featured — uses YouNet accent on hover only)
```
bg-[var(--color-surface-warm-translucent)] text-text
pt-[12px] pr-[20px] pb-[12px] pl-[14px] rounded-[30px]
shadow-[var(--shadow-warm-lift)]
hover:bg-[var(--color-accent-soft)] transition-colors duration-[var(--duration-med)]
```

### Accent pill (used ONLY for: primary CTA in hero, recording state, active waveform)
```
bg-accent text-white h-[36px] px-[14px] rounded-[9999px] text-button
hover:bg-[var(--color-accent-hover)]
```

### Card
```
bg-surface rounded-[var(--radius-card)]
shadow-[var(--shadow-outline-ring),var(--shadow-soft-lift)]
p-[var(--space-24)]
```

### Input
```
bg-surface text-text rounded-[var(--radius-md)]
border border-[var(--color-border)]
px-[var(--space-12)] py-[var(--space-12)]
focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]
```

## 4. YouNet accent usage rules

The design spec says "achromatic with warm undertones". The YouNet accent is the single exception. Use it ONLY for:

1. **Primary CTA in the hero** (replaces or joins the black pill).
2. **Recording state indicator** (red dot, pulse animation).
3. **Active waveform cursor / playhead.**
4. **Destructive confirmation buttons** in Admin CP (delete user, purge storage).

Do **not** use accent for:
- Body links (use `--color-text-primary` with subtle underline).
- Borders or dividers.
- Backgrounds of large surfaces.
- Icons unless inside a primary CTA.

## 5. Accessibility

- Text on `--color-surface-0`: AAA for body and display.
- Text on `--color-accent`: white only; contrast ≥ 4.5:1 verified.
- Focus ring on every interactive element, using `--color-ring`.
- Waveform active vs idle states: use color **and** motion/shape (cursor, bar height), never color alone.

## 6. Dark mode

Out of scope for v1. Design is light-only per `DESIGN.md`. If added later, invert surfaces and recompute shadows — don't just darken.

## 7. TODO before Phase 1 UI work

- [ ] Confirm `--color-accent` exact hex from YouNet brand guide (currently placeholder `#E5001A`).
- [ ] License-check Waldenburg font files; procure or substitute.
- [ ] Embed Inter (variable) via `next/font` for subsetted delivery.
- [ ] Embed Geist Mono via `next/font`.

## Changelog
- 2026-04-19: v1.0 initial tokens.
