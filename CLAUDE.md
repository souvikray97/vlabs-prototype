# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Maintenance note (keep this doc + CHANGES.md current).** Whenever you read this project and then make any change to it, update **both** files before finishing:
> - **`CHANGES.md`** — append a new `## Round N — <title>` entry describing what changed and why (follow the existing format: rationale, key diffs, and a **Files:** line). **Every CHANGES.md entry must also include suggested git commit message(s)** under a `**Commit:**` block (a concise, imperative subject line ≤ 72 chars + optional body).
> - **`CLAUDE.md`** — if the change adds/alters architecture, components, conventions, shortcuts, or constraints, reflect it in the relevant section here so this guide never drifts from the code.
>
> Treat this as part of "done," not an optional extra.

## Commands

```bash
pnpm dev        # start Next.js dev server (webpack) on http://localhost:3000
                # NOTE: pinned to --webpack on purpose. Turbopack dev OOMs (>2GB,
                # freezes the machine) on Next 16.2.0 / Node v26 — see Key constraints.
pnpm build      # production build (TypeScript errors are ignored — see next.config.mjs)
pnpm start      # serve production build
pnpm lint       # ESLint
```

There is no test runner configured. `test.ts` at the root is a scratch file, not a test suite.

## Architecture

This is a **Next.js 16 / React 19 / TypeScript** application — an OS Virtual Lab for teaching process life cycle management. The UI lives entirely client-side; there is no API layer in this repo.

### Two generations of simulation code

There are **two separate, parallel implementations** of the simulation engine:

1. **Legacy (root-level `.ts` files)** — `Kernel.ts`, `Process.ts`, `Event.ts`, `Log.ts`, `UI.ts`, `main.ts`, `simulation.ts`. These are the original plain-TS files (not React). `Kernel.ts` posts moves, events, and process data to `http://localhost:3000` (a separate backend not in this repo). These files are largely unused by the current Next.js app but remain in the repo.

2. **Active Next.js app** — everything under `app/`, `components/`, `hooks/`, and `lib/`. This is what actually runs.

### Core simulation logic (`lib/`)

- **`lib/simulation-engine.ts`** — `SimulationEngine` class. Pure in-memory state machine. Tracks processes (`infant → ready → running → blocked → terminated`), events (`create_request`, `io_needed`, `io_done`, `terminate`), clock, and metrics. This is the single source of truth for simulation state. No persistence, no side effects — all callers read state via `engine.getState()`.
  - `generateExternalEvents()`: `io_needed` fires deterministically at `timeRunning === 2`; `terminate` is eligible at `timeRunning >= 4` OR when a process has returned from I/O (`history.includes("blocked") && !hasIOEvent`). Both can coexist in the queue simultaneously — the user chooses which to act on.
  - `snapshot()` / `restore()` — used for step-back history in the sandbox (`EngineSnapshot` type).
  - `loadScenario()` — used by ScenarioEngine (scenario 9 only) to start processes in mixed states.

- **`lib/scenario-engine.ts`** — `ScenarioEngine` wraps `SimulationEngine` for timed, scored assessment scenarios. Contains `PREDEFINED_SCENARIOS` (9 scenarios, beginner → advanced). Scenario 9 uses `engine.loadScenario()`.

- **`lib/export-utils.ts`** — CSV/JSON download helpers for action logs, state history, and evaluation results. No state of their own.

### Pedagogy layer (`lib/` + `components/`)

Added in Round 10. A lesson-first layer wrapped around the existing experiment; the simulator, scenarios, and evaluation are unchanged in behaviour but now participate in a progression policy.

- **`lib/lesson-plan.ts`** — pure data: course objectives (LO1–LO6), the lesson dependency graph (L1 → L2 → {L3, L4} → EXP → ASMT), tasks with validation items (`mcq` | `multi` | `order`), experiment challenges mapped to guided scenarios (`s1`–`s4`), and the mastery check (6 items, pass ≥ 5). Each node also carries a `blurb` — a plain-language one-liner for its course-map card. The player components never hard-code content — other experiments reuse them by supplying their own plan file.
- **Taxonomy metadata is instructor-only.** LO codes and Bloom levels (`los`, `bloom`, `lo` on items) stay in the data model and in record metadata for the design docs and the Analytics tab, but must never render in the learner-facing Lessons flow (course map, lesson player, mastery check). Cards show prerequisites on one line and `Covers: {blurb}` on another — never conflated.
- **`lib/learning-records.ts`** — `record(action, object, metadata)` emits `{timestamp, user, action, object, metadata}` events; pseudonymous learner id (`getLearner` / `setLearnerName` / `clearLearner`); path mode (`guided` | `partial` | `open`); persistence + subscription hooks (`usePathMode`, `useRecordsVersion`); JSON export. Storage keys: `os-vlab-learning-records-v1`, `os-vlab-learner-v1`, `os-vlab-path-mode-v1` (separate from the app's `os-virtual-lab-state`).
- **Session entry (`app/page.tsx`)** — a `SessionEntry` card replaces the tabs until the learner confirms a name (or explicitly continues as "Learner"). Themed as process admission: a life-cycle chip strip (`ENTRY_STRIP`, mirroring `STATE_CHIP_COLORS`) where the pulsing **New** chip carries the typed name live, "you are here" caption, sky top-accent, and a `variant="ready"` submit ("Admit "X" to the Ready queue"). (A Round-16 experiment extending this strip into a persistent header journey indicator was reverted on user request — the strip lives only on the gate.) Confirmation calls `setLearnerName()` exactly once **before any tab content mounts**, so the first record of the session (`launched`) already carries the confirmed name. A stored non-default name pre-fills the form ("Continue as X" / "Not you?"); the confirmation is remembered per browser session in `sessionStorage` (`os-vlab-session-entered-v1`) so reloads skip the prompt; `handleTabChange` no-ops until entry; **Reset All** clears learner identity (`clearLearner()`) and the session flag. There is deliberately no name input anywhere else.
- **`lib/lesson-progress.ts`** — per-node progress store (`os-vlab-lesson-progress-v1`); `lockState(node, mode)` → `done | open | warn | locked` (the whole progression policy); `withUnlockTracking()` emits `unlocked` records; `syncExperimentProgress(completedScenarios)` passes experiment challenges when their scenarios complete; `experimentGateOpen(mode)` gates the experiment tabs in guided mode.
- **`components/lessons.tsx`** — Lessons tab: **syllabus graph** overview, lesson player (task rail + content + validation), mastery check, mode selector. The experiment card deep-links into the Scenarios tab via `onNavigate`.
  - **Syllabus graph (`route.view === "map"`)** — replaced the old flat card grid (Round 12). A single vertical flow of expandable `SyllabusNode` cards with plain-`div` connectors (`VBar`, plus a labelled "L3 & L4 · either order" fork bar around the L3/L4 two-column row) — **no SVG edges**, deliberately, to avoid the expand-triggered edge reflow this repo has been burned by. A progress header shows "N of 6 stages complete" (a stage = a node with `getProgress(id).done`), a thin progress bar, and one **Continue** control. Each collapsed card shows status pill, requires-line, `Covers: {blurb}`, and a progress fraction; expanding lists the syllabus: lessons show their task titles with ✓/▸/○ state, EXP shows its four challenges (challenge title — scenario title, from `SCENARIO_TITLES` exported by `guided-scenarios.tsx`) with ✓ from `completedScenarios`, ASMT shows **meta only** (never the question stems — it is summative). Locked nodes are still expandable (read-only preview).
  - **Continue semantics** — `upNext()` computes the next actionable step: (1) an in-progress lesson → "Continue", else (2) the first node in graph order `L1,L2,L3,L4,EXP,ASMT` that is `open`/`warn` and not `done` → "Start", else (3) `null` → "Course complete". The header button and the one auto-expanded-on-mount node both use `upNext()`, so they always agree. `enterNode()` dispatches by kind through the unchanged gated `openNode` path.
  - **Expansion is record-silent** — toggling a node emits **no** learning records; only *entering* a node (via `openNode`) records `started`/`viewed`/`blocked`/`warned` as before. Task rows inside an expanded lesson are non-interactive (no per-task deep-linking — entering always resumes at the saved `taskIdx`/`itemIdx`).
  - **Course header card** — the syllabus overview opens with one Card in the app's shared dialect (`panel-title` + icon CardTitle, like the Scenarios tab header): an **Aim:** sentence, two plain-bordered objective panels ("What you'll learn" / "What you'll do") whose colour is limited to the icon and item numbers (green / sky — user feedback: fully tinted panels were too colourful), then a green progress bar with "Progress: N of 6 stages complete" and the `variant="success"` Continue button (the header CTA is the only green button in the tab; syllabus-node Start/Continue buttons use the light-blue `variant="ready"`). Plain language, no LO codes. The session-entry gate carries a one-sentence purpose line too. When restyling Lessons surfaces, match this dialect (CardHeader/CardTitle + restrained accents + the existing button variants), not bespoke mono-kicker layouts.
  - **Colour accents (Round 13)** — the pedagogy surfaces use the lab's process-state palette (sky/green/amber/red — `--primary` is greyscale, so don't lean on it for accents): node-kind icons (lesson = sky BookOpen, experiment = green FlaskConical, assessment = amber GraduationCap), sky quiz-selection/progress-bar/task-rail states, amber keyfact callout and mastery-check kicker, KPI top-border accents, banded first-attempt % colouring, and outcome-coloured verbs in the record stream (`actionColor`: green = progress, red = friction, amber = caution).
- **`components/analytics-dashboard.tsx`** — Analytics tab, computed **only** from the record stream: progression funnel, hardest validations (first-attempt correctness), misconception signals (from `attempted-invalid` records), median time per node, filterable record stream, JSON export, and a clearly-labelled synthetic-cohort generator (25 simulated learners, `metadata.synthetic: true`). `byUser()` keeps each learner's display name in sync with their **latest** record, so renames propagate. This surface is instructor-facing and keeps showing LO codes.
- **Misconception bridge** — `showAlert` in `process-scheduling-simulation.tsx` emits an `attempted-invalid` record (with the refusal reason) for every `type === "error"` alert. Three lines; the simulator is otherwise untouched.

### UI components (`components/`)

- **`process-scheduling-simulation.tsx`** — Main interactive sandbox. Owns a `SimulationEngine` instance via `useState`. Renders process lanes, event queue, action log, export controls, and metrics. Converted to `forwardRef` — exposes a `SimulationHandle` imperative API (see below). Also exports `SIMULATION_SHORTCUT_DEFS` (static list of shortcut metadata for the dialog).
  - **Panel styling conventions:** the generative grey panels (Event Request queue, CPU/Ready/I/O/Terminated lanes, State Presence, Action Log, Invalid Transition Attempts, State Transition History) use `bg-gray-100`. The fixed-height scrolling boxes (State Presence and Action Log) use `h-32 sm:h-48` (not `max-h-*`) so they hold a constant height and scroll internally rather than growing the layout per generation. Empty-state placeholders inside fixed-height boxes (Event Request, State Presence, Action Log) use `h-full flex items-center text-xs` — left-aligned, vertically centered. Keep new panels consistent with these.
  - **Three-column equal-height layout:** at `xl` the Controls column, Sandbox card, and Metrics & Log card share one grid row. Metrics & Log is the shortest and is marked `self-start`; a `useLayoutEffect` + `ResizeObserver` (refs `metricsCardRef`, `controlsColRef`, `sandboxCardRef`) measures the Metrics card and **caps the other two to its height** so all three bottoms align — CSS grid can only grow a row to its tallest child, never shrink to the shortest, hence the JS. Only applied at `≥ 1280px`; below that the three are on separate rows and the height is cleared. The Controls column is `flex flex-col` and the Event Catalog card (`flex-1 min-h-0`) fills the capped column, its inner list scrolling internally (`flex-1 min-h-0 overflow-y-auto` — `min-h-0` all the way up so the flex children shrink and the scrollbar engages instead of the column clipping).
  - **Sandbox two-column grid (inside the Sandbox card):** a `grid-cols-1 sm:grid-cols-2` grid. Left column = Event Requests + Valid Transitions; right column = the Processes lanes (`lanesWrapRef`). Both columns use `gap-4` (16px) between their sections. Alignment is **pixel-tuned, not automatic** (the columns don't structurally share rows): the Event Requests scroll box has an explicit height (`h-[10.5625rem]` = 169px ≈ CPU-lane + 16px gap + Ready-lane) so its bottom sits on **Ready**'s bottom; the Valid Transitions diagram is `flex-1`, so it auto-fills to the column bottom and lines up with **Terminated**. Small `sm:-mt-*` nudges trim the inter-section gaps (`sm:-mt-0.5` on the Valid Transitions header, `sm:-mt-1` on the diagram button). **If you change the lane `gap-4`, re-tune the Event Requests height by the same delta** (each `0.0625rem` = 1px).
  - **Phone stacking order (< sm):** the left column is `display: contents` on phones (`contents sm:flex`), so its four children join the parent grid directly; `max-sm:order-last` on the two Valid Transitions pieces reorders the stack to **Event Requests → Processes → Valid Transitions**. All phone-only tweaks are `max-sm:`/base and overridden by `sm:*`, so the desktop layout is untouched. The diagram SVG uses `preserveAspectRatio="xMidYMax meet"` (drawing pinned to the bottom of its box).
  - **Guided tour (`TOUR_STEPS`):** a first-run, state-driven walkthrough that takes **P0** through a full life cycle (Ready → CPU → I/O → Ready → CPU → Terminated). `TOUR_STEPS` is an ordered list of steps; each has a `target` (`button` \| `event` \| `drag`), a `message`, and a `done(state)` predicate. A `useEffect` step machine advances `tourStep` whenever the current step's `done` predicate is satisfied by real engine state — so the tour only progresses when the user performs the actual action. Key points:
    - **Step 4 exists because of the engine:** a freshly-created process cannot be dispatched in the same clock cycle (`SimulationEngine.moveProcess` rejects it), so the tour inserts an explicit "Advance Clock once" step before the first Ready → CPU drag.
    - `create_request`/`io_done` are **probabilistic**, so those steps just keep the Advance Clock button pulsing until `evActive(...)` becomes true.
    - The final "revert" step completes when the clock goes *backwards* (step-back), detected via `tourBaselineTime`.
    - **Rendering:** buttons/event chips get a pulse via the `.tour-target-btn` (buttons — stronger) / `.tour-target` (events) classes (keyframes in `app/globals.css`); drag steps animate a ghost **P0** chip between the *real* lanes using `.drag-hint-ghost` + measured lane geometry (`hintGeom`, CSS vars `--hx0/--hy0/--hx1/--hy1`). The ghost chip is **colour-coded to the transition**: it holds the source-state colour while picked up/dragging and flips to the target-state colour on drop, via the `.drag-hint-chip-color` class + `drag-hint-color` keyframe and CSS vars `--hc0`/`--hc1` (from `STATE_COLOR`, which mirrors `getProcessColor`: ready=sky, running=green, blocked=yellow, terminated=red). The instruction popup is portalled to `document.body`; on `< 640px` it pins as a bottom banner (no room beside full-width controls), otherwise it anchors beside the target and clamps to the viewport. The anchored popup has a **caret** (rotated-square diamond) that auto-flips to point at the target — left edge when the popup is right of the target, right edge when it flips left; stored as `tourPopup.caret` from `place()` (null on the mobile banner).
    - **Lifecycle:** `tourActive` defaults `true`. Sandbox tour: runs on the live Sandbox tab only, has a **Stop guide** button (`setTourActive(false)`), and **Reset** restarts it (`tourStep = 0`, `tourActive = true`).
    - **Reusable renderer (`externalTourCues` prop):** the same renderer is driven by an optional `externalTourCues?: TourStep[]` prop. When provided (Guided Scenarios), those cues replace `TOUR_STEPS`, the tour runs **even though the embedded sim is `isActiveTab=false`**, its cue index resets whenever the prop identity changes (memoize per step), and the **Stop guide** button is hidden (scenario tours can't be skipped). `TourStep` / `TourTarget` are exported for callers to build cues. `usingExternalTour` gates these differences; the sandbox path (`externalTourCues == null`) is unchanged.

- **`guided-scenarios.tsx`** — Step-by-step guided scenarios with hints, quizzes, and `instructionBullets`. Receives persisted completed-scenario list from `app/page.tsx`. Embeds `ProcessSchedulingSimulation` via `ref` to drive it with keyboard shortcuts. Also exports `SCENARIO_SHORTCUT_DEFS`.
  - **Per-step tour:** `cuesForStep(step)` builds a small ordered `TourStep[]` from the step's `expectedAction` (one builder keyed by action — `create_process`, `move_to_cpu`, `move_to_io`, `move_to_ready`, `preempt_process`, `terminate_process`; read-only steps get `[]`), using the step's `instructionBullets` as the popup text. Cues use **generic state predicates** (`anyState`, `evActiveAny`, `evSelAny`) rather than P0-specific ones, so they work for multi-process scenarios. The memoized `currentTourCues` (keyed by `[selectedScenario, currentStep]`) is passed to the embedded sim as `externalTourCues`. Step completion gating (quiz correct **and** `validation` pass, plus the `cpuIdleBlocked` rule) is enforced in `handleCompleteStep` and is unchanged. NOTE: some cue popup texts don't yet match the exact on-screen control wording — intentional, to be reconciled later.

- **`guided-tutorial.tsx`** — Static tutorial content with embedded practice steps.

- **`scenario-evaluation.tsx`** — Uses `ScenarioEngine` for timed, scored evaluation. Writes results back to `app/page.tsx` for persistence.

- **`keyboard-shortcuts-dialog.tsx`** — Dialog listing all keyboard shortcuts grouped by category. Accepts `ShortcutDef[]` (display-only, no action field). Supports controlled `open`/`onOpenChange` for the `?` global shortcut.

- **`components/ui/`** — shadcn/ui primitives. Do not edit these manually; they are generated by `shadcn`.

### App shell (`app/page.tsx`)

Five-tab layout: **Lessons | Scenarios | Sandbox | Evaluation | Analytics** (Lessons is the default tab). Manages tab state, `shortcutsDialogOpen` state, keyboard shortcuts (`Alt+1–5`, `?`), and `localStorage` persistence via `hooks/use-persistence.ts`. The persistence key is `os-virtual-lab-state` (schema version 1 — a version mismatch clears the store). Passes `shortcutsEnabled` and `isActiveTab` down to `ProcessSchedulingSimulation` and `GuidedScenarios`.

The tab content is gated behind the session-entry step (see Pedagogy layer): until the learner confirms a name, `SessionEntry` renders instead of the tabs and `handleTabChange` no-ops. All tab switches (clicks **and** `Alt+N` shortcuts) go through `handleTabChange`, which enforces the experiment gate: in fully guided mode the Scenarios/Sandbox/Evaluation tabs are intercepted until lessons L3 and L4 are complete (`experimentGateOpen`), the attempt records `blocked`, and a banner explains the lock. A `useEffect` calls `syncExperimentProgress(completedScenarios)` after hydration so completing scenarios s1–s4 passes the experiment node's challenges. **Reset All** also clears the pedagogy stores and learner identity (`resetAllProgress()`, `clearAllRecords()`, `clearLearner()` + the session-entry flag).

### Keyboard shortcut system (`hooks/use-keyboard-shortcuts.ts`)

- `ShortcutAction` — full shortcut descriptor including `action: () => void`.
- `ShortcutDef` — `Omit<ShortcutAction, "action">` — used for dialog display without needing a callable action.
- `useKeyboardShortcuts(shortcuts, enabled)` — registers a `keydown` listener on `window`. Blocked when any interactive element (input, textarea, select, button, anchor, contentEditable, role=button) has focus, so Space/Enter don't double-fire on focused buttons.
- Each component registers its own shortcuts locally, gated by `shortcutsEnabled && isActiveTab` — shortcuts on hidden tabs are inactive.

#### Active shortcuts

| Key | Action | Active on |
|-----|--------|-----------|
| `Alt+1/2/3/4/5` | Switch tabs (via the gated `handleTabChange`) | Always |
| `?` (Shift+/) | Toggle shortcuts dialog | Always |
| `Space` / `A` | Advance Clock | Sandbox & Scenarios tabs |
| `Z` | Step Back | Sandbox & Scenarios tabs |
| `C` | Create Process | Sandbox & Scenarios tabs |
| `E` | Select Next Event (cycles) | Sandbox & Scenarios tabs |
| `G` | Dispatch selected process → CPU | Sandbox & Scenarios tabs |
| `I` | Move selected process → I/O | Sandbox & Scenarios tabs |
| `R` | Preempt selected process → Ready | Sandbox & Scenarios tabs |
| `T` | Terminate selected process | Sandbox & Scenarios tabs |
| `Escape` | Deselect process/event | Sandbox & Scenarios tabs |
| `Shift+R` | Reset Simulation (Sandbox) / Reset Scenario (Scenarios) | Respective tab |
| `Enter` | Check & Complete Step | Scenarios tab, step active |
| `H` | Toggle Hint | Scenarios tab, step active |
| `B` | Go Back to scenario list | Scenarios tab, step active |

### `SimulationHandle` (forwardRef API)

`ProcessSchedulingSimulation` is a `forwardRef` component. `GuidedScenarios` holds a `useRef<SimulationHandle>` to call simulation actions from keyboard shortcuts without owning the engine state.

```typescript
export interface SimulationHandle {
  advanceClock: () => void
  stepBack: () => void
  createProcess: () => void
  selectNextEvent: () => void       // cycles through active events
  cancelSelection: () => void       // deselects current process
  moveSelectedToState: (state: SimulationProcess["state"]) => void
}
```

### `GuidedStep` schema

```typescript
interface GuidedStep {
  id: string
  title: string
  description: string
  stepObjectives?: string[]       // rendered as a numbered green list before instructions
  instruction: string
  instructionBullets?: string[]   // numbered sub-steps rendered below instruction; supports **bold**
  hint?: string
  quiz?: StepQuiz                 // must be answered correctly before step can complete
  cpuIdleBlocked?: boolean        // blocks completion if CPU idle while Ready queue is non-empty
  expectedAction: string
  validation: (state: any) => boolean
  feedback: { success: string; error: string }
}
```

Step renderer order: Step Objectives → Instruction (with bullets) → Hint toggle → Knowledge Check quiz → CPU idle warning → Feedback → Buttons.

`renderBold(text)` splits on `**text**` and returns bold React nodes. Use this for `instructionBullets` content.

### Path alias

`@/` maps to the repo root (see `tsconfig.json`). Use `@/lib/...`, `@/components/...`, `@/hooks/...` for imports.

### Copy voice (project-wide rule)

All learner-facing UI copy is **declarative** — it states what a feature is or what can be done. Never imperative/command voice ("Complete L3 to unlock…" → "…unlocks once L3 is complete"), never second-person promises ("you will learn/understand", "What you'll learn" → "Objectives"). Tooltips are additionally kept concise. Three exemptions: **action labels** on buttons/CTAs ("Start", "Check answer", "Admit "X" to the Ready queue"), **guided-scenario step directives** (`instruction`/`instructionBullets`/tour cue text — literal directions for a required action), and the **session-entry gate** (`SessionEntry` in `app/page.tsx`), whose second-person "you are the newest process" admission copy is a deliberate, user-approved design (Rounds 15/20) — do not de-personalize it in future voice sweeps. This rule originated in the Round-1-era "Section A — Global copy/voice" spec in `CHANGES.md` and was re-affirmed and re-applied to the pedagogy layer in Round 18; keep any new copy compliant.

### Key constraints

- `next.config.mjs` sets `typescript.ignoreBuildErrors: true` — TypeScript errors do not fail the build.
- The legacy root-level `.ts` files (`Kernel.ts` etc.) are not compiled by Next.js. Do not import them from the app.
- `config.ts` (root) defines shared constants for the legacy engine. `lib/simulation-engine.ts` has its own inline constants and does not import from `config.ts`.
- The embedded `ProcessSchedulingSimulation` inside `GuidedScenarios` must always be passed `isActiveTab={false}` — the parent registers simulation shortcuts via the ref instead. Omitting this would double-register the same keys.
- `shadcn` Dialog components support controlled open state via `open`/`onOpenChange` — pass `undefined` for both to use uncontrolled mode.
