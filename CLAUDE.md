# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PoOD (Picture of Our Day)** — A shared daily photo wall where friends post one polaroid-style picture per day onto a calendar page. Each day has a 3x3 grid (9 slots). Users navigate between days with a tear-off calendar animation.

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start Vite dev server with HMR
pnpm build            # TypeScript check + Vite production build (output: dist/)
pnpm lint             # ESLint
pnpm preview          # Preview production build locally
```

There is also a Parcel-based bundling pipeline (`bundle.html`) for producing a single self-contained HTML file, but primary development uses Vite.

## Architecture

**Stack:** React 19 + TypeScript + Vite, Tailwind CSS 3, shadcn/ui (Radix primitives), Firebase compat SDK (Firestore + Storage).

**Path alias:** `@/` maps to `src/` (configured in vite.config.ts and tsconfig).

### Storage layer (`src/lib/storage.ts`)

Three-tier fallback: **Firebase > `window.storage` (Claude artifact sandbox) > in-memory Map**. The app works without Firebase configured — `src/lib/firebase.ts` exports `isConfigured` which gates all Firebase calls. Last-used name persists via localStorage.

**Firestore schema:** `days/{YYYY-MM-DD}` → `{ entries: DayEntry[] }`
**Storage schema:** `images/{YYYY-MM-DD}/{gridPos}.jpg`

### Key data types

- `DayEntry` — `{ gridPos: number, name: string, tilt: number, offsetX: number, offsetY: number }`
- `DayData` — `{ entries: DayEntry[] }`

### Component structure

- `App.tsx` — Root. Owns day state, navigation (with tear-off/put-back animation via CSS classes), upload flow.
- `CalendarPage` — Renders one calendar day: header (weekday/date/month), perforation line, 3x3 photo grid.
- `PolaroidImage` — Single polaroid with random tilt/offset transforms.
- `UploadDialog` — shadcn Dialog for photo upload with name input and preview.
- `ImageViewer` — Full-screen lightbox overlay.
- `src/components/ui/` — shadcn/ui primitives (do not edit directly; regenerate via `npx shadcn@latest add <component>`).

### Styling

Custom styles live in `src/App.css` (calendar, animations, polaroid frames). The app uses a warm paper/cream color palette with handwritten-style fonts (Caveat, Playfair Display). Tailwind is used for utility classes; CSS custom properties drive the shadcn theme.
