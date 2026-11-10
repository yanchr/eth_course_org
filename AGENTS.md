# ETH Course Planner — project rules

## Stack
- React 19 + TypeScript (strict), Vite 8
- Tailwind CSS v4 via `@tailwindcss/vite`; theme tokens live in `src/index.css` under `@theme` (no tailwind.config.js)
- Icons: `lucide-react` only. Font: Inter.
- PWA: `vite-plugin-pwa` (autoUpdate). Everything must work offline, including `public/maps/*.png`.
- Lint: `oxlint`. Build must pass `tsc -b && vite build`.

## Conventions
- No UI component libraries. Primitives live in `src/components/ui/`.
- Feature components in `src/components/`, hooks in `src/hooks/`, pure logic in `src/lib/`, types in `src/types/`.
- State is local-first: one `PlannerProvider` persisted to `localStorage` (`eth-course-planner:v1`). Never add a backend.
- Progress keys are `${week}-${category}`. Semester has 14 weeks starting on `settings.semesterStartDate` (a Monday).
- Campus resolution: `src/lib/buildings.ts` registry is authoritative; the "H-prefix except HG -> Hönggerberg" rule is only the fallback.
- Palette: monochrome zinc with subtle borders. Transitions: `duration-150 ease-out`.
- Interactive elements must be keyboard reachable with visible focus rings and a minimum 44px tap target on mobile.
