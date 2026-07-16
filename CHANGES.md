# Development Changes Log

---

## Round 1 — 6-Item UI Polish

### 1. Step UI Reorder — Knowledge Check after Hint
The Knowledge Check (quiz) block was moved to render **after** the Show Hint toggle in the step renderer.

New order inside every step card:
1. Step Objectives (green box)
2. Instruction (blue alert) — with `instructionBullets` sub-steps
3. Hint toggle (yellow)
4. Knowledge Check quiz (purple) ← moved here
5. CPU idle warning (orange)
6. Feedback alert
7. Action buttons

### 2. `terminate` Event Bug Fix (Scenario 1 Shortest Path)

**Root cause:** `generateExternalEvents()` in `lib/simulation-engine.ts` had a gate that blocked `terminate` from being generated whenever a pending `io_needed` event existed:

```typescript
// Before (buggy):
const eligible = !hasIOEvent && (process.history.includes("blocked") || timeRunning >= 4)
```

This meant that once `io_needed` appeared at `timeRunning === 2`, the user could never see a `terminate` event by ignoring the I/O — making the "shortest valid path" scenario impossible to complete.

**Fix:**

```typescript
// After (fixed):
const eligible = (process.history.includes("blocked") && !hasIOEvent) || timeRunning >= 4
```

`terminate` is now eligible after 4 ticks regardless of any pending `io_needed`. Both events can coexist in the queue — the user chooses which path to take.

### 3. `instructionBullets` — Multi-step Instructions

Added `instructionBullets?: string[]` to the `GuidedStep` interface. When present, sub-steps render as a numbered list below the main instruction text. Supports `**bold**` via `renderBold()`.

24 multi-action steps across all 10 scenarios were updated with `instructionBullets`. Example (`s1-terminate`, synced with the engine fix):

```
instruction: "Advance the clock until a terminate event appears, then select it and terminate the process.",
instructionBullets: [
  "Click Advance Clock twice. After 2 advances, an io_needed event appears — the process is signalling I/O.",
  "Continue advancing 2 more times (4 total) without acting on io_needed. A Terminated event will appear.",
  "Click the Terminated event in Event Requests to select it.",
  "Click Terminate on the running process. The process moves from CPU to Terminated.",
],
hint: "You will see both an io_needed and a Terminated event — ignore io_needed and use the Terminated event instead."
```

### 4. Header Alignment — `max-w-7xl`

The header container was missing `max-w-7xl`, causing the "Shortcuts" and "Reset All" buttons to sit outside the bounds of the main content area on wide screens.

```jsx
// Before:
<div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4">

// After:
<div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4 max-w-7xl">
```

### 5. Responsiveness — Scenario Header Mobile Fix

The scenario header in `guided-scenarios.tsx` was using `flex items-center justify-between`, which caused the title and elapsed timer to overflow horizontally on narrow screens.

```jsx
// Before:
<div className="flex items-center justify-between">

// After:
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
  <div className="min-w-0 flex-1">
    <CardTitle className="... break-words">
```

The hint row was similarly fixed to `flex flex-col sm:flex-row`.

### 6. Remove "Selected Process" Readout

The "Selected Process: P1 / None" display block was removed from the Controls card. The `selectedProcess` state was kept — it is consumed by the move panel (shown when a process is selected) and the blue ring highlight on all process badges.

### 7. Typography Hierarchy Upgrade

- Section headings (`h3`): `text-xs sm:text-sm` → `text-sm sm:text-base`
- Lane headings (`h4`, CPU / Ready / I/O wait / Terminated): `font-medium` → `font-semibold`

### 8. Info Button Placement — Adjacent to Label

Three card headers had `flex-1` on the title `<span>`, which pushed the Info tooltip button far to the right of the label text. Fixed by wrapping the title text and Info button together in a shared `flex-1` span:

```jsx
// Process Life Cycle Sandbox / Metrics & Log:
<span className="flex items-center gap-1 flex-1 min-w-0">
  <span className="break-words">Process Life Cycle Sandbox</span>
  <Tooltip>...(Info)...</Tooltip>
</span>

// System States (Export button stays at far right):
<span className="flex items-center gap-1 flex-1">
  System States
  <Tooltip>...(Info)...</Tooltip>
</span>
<DropdownMenu>...Export...</DropdownMenu>
```

---

## Round 2 — Keyboard Shortcuts

### What was added

15 keyboard shortcuts across three layers:

```
┌─────────────┬────────────────────────────────────────────────────────┬────────────────────────────┐
│     Key     │                         Action                         │          Active on         │
├─────────────┼────────────────────────────────────────────────────────┼────────────────────────────┤
│ Alt+1/2/3   │ Switch tabs                                            │ Always                     │
├─────────────┼────────────────────────────────────────────────────────┼────────────────────────────┤
│ ? (Shift+/) │ Toggle shortcuts dialog                                │ Always                     │
├─────────────┼────────────────────────────────────────────────────────┼────────────────────────────┤
│ Space / A   │ Advance Clock                                          │ Sandbox & Scenarios tabs   │
├─────────────┼────────────────────────────────────────────────────────┼────────────────────────────┤
│ Z           │ Step Back (undo last clock advance)                    │ Sandbox & Scenarios tabs   │
├─────────────┼────────────────────────────────────────────────────────┼────────────────────────────┤
│ C           │ Create Process                                         │ Sandbox & Scenarios tabs   │
├─────────────┼────────────────────────────────────────────────────────┼────────────────────────────┤
│ E           │ Select Next Event (cycles through queue)               │ Sandbox & Scenarios tabs   │
├─────────────┼────────────────────────────────────────────────────────┼────────────────────────────┤
│ G           │ Dispatch selected process to CPU                       │ Sandbox & Scenarios tabs   │
├─────────────┼────────────────────────────────────────────────────────┼────────────────────────────┤
│ I           │ Move selected process to I/O Wait                      │ Sandbox & Scenarios tabs   │
├─────────────┼────────────────────────────────────────────────────────┼────────────────────────────┤
│ R           │ Preempt selected process to Ready                      │ Sandbox & Scenarios tabs   │
├─────────────┼────────────────────────────────────────────────────────┼────────────────────────────┤
│ T           │ Terminate selected process                             │ Sandbox & Scenarios tabs   │
├─────────────┼────────────────────────────────────────────────────────┼────────────────────────────┤
│ Escape      │ Deselect process / event                               │ Sandbox & Scenarios tabs   │
├─────────────┼────────────────────────────────────────────────────────┼────────────────────────────┤
│ Shift+R     │ Reset Simulation (Sandbox) / Reset Scenario (Scenarios)│ Respective tab             │
├─────────────┼────────────────────────────────────────────────────────┼────────────────────────────┤
│ Enter       │ Check & Complete Step                                  │ Scenarios tab, step active │
├─────────────┼────────────────────────────────────────────────────────┼────────────────────────────┤
│ H           │ Toggle Hint                                            │ Scenarios tab, step active │
├─────────────┼────────────────────────────────────────────────────────┼────────────────────────────┤
│ B           │ Go Back to scenario list                               │ Scenarios tab, step active │
└─────────────┴────────────────────────────────────────────────────────┴────────────────────────────┘
```

### Architecture changes

- **`ProcessSchedulingSimulation` converted to `forwardRef`** exposing `SimulationHandle` — `GuidedScenarios` calls simulation actions (advance clock, step back, move process, etc.) via the ref without needing to own engine state.

- **Shortcuts are tab-gated** (`isActiveTab` prop) so keys don't fire on hidden tabs. Each component registers its own shortcuts locally; `useKeyboardShortcuts(shortcuts, shortcutsEnabled && isActiveTab)`.

- **`?` shortcut** is wired to `shortcutsDialogOpen` state in `app/page.tsx` so it toggles the panel from anywhere in the app.

- **All shortcut defs visible in the dialog** — `SIMULATION_SHORTCUT_DEFS` and `SCENARIO_SHORTCUT_DEFS` are exported as static arrays and merged in `app/page.tsx` into `allShortcutDefs` passed to `KeyboardShortcutsDialog`. The dialog accepts `ShortcutDef[]` (display-only, no `action` field) so it can render defs from any component without needing callable references.

- **`isInteractiveFocused()` updated** to also block shortcuts when a `button`, `a`, or `role=button` element has focus. This prevents `Space`/`Enter` from double-firing (once via shortcut, once via the focused button's click handler).

- **Embedded simulation in `GuidedScenarios`** must always receive `isActiveTab={false}` — the parent owns the simulation keyboard shortcuts and drives the engine via the ref. Passing `isActiveTab={false}` ensures the embedded component does not register a duplicate set of listeners.

### Files changed

| File | Change |
|------|--------|
| `hooks/use-keyboard-shortcuts.ts` | Added `ShortcutDef` type; updated `isInteractiveFocused` to include button/anchor/role=button |
| `components/keyboard-shortcuts-dialog.tsx` | Accepts `ShortcutDef[]` (not `ShortcutAction[]`); added `open`/`onOpenChange` props; `Space` key renders as "Space" not " " |
| `components/process-scheduling-simulation.tsx` | `forwardRef` + `SimulationHandle`; memoized all handlers with `useCallback`; `selectedProcessRef` for stable closure in shortcut actions; exports `SIMULATION_SHORTCUT_DEFS` |
| `components/guided-scenarios.tsx` | Added `simulationRef`; registers simulation + scenario shortcuts; passes `ref` and `isActiveTab={false}` to embedded sim; exports `SCENARIO_SHORTCUT_DEFS` |
| `app/page.tsx` | `shortcutsDialogOpen` state; `?` shortcut; `allShortcutDefs` merged for dialog; `isActiveTab` and `shortcutsEnabled` passed to components |


# Claude Code Task (Round 3): Visual, Structural & Pedagogical Refinements to the CPU Scheduling Learning Simulator

This continues the same project (React + Tailwind, Lucide icons; guided **Scenarios**, a **Sandbox**, **Metrics/System States**, process-state visualizations). Prior rounds added: per-step knowledge verification + simulation-task validation, the Objectives → Instructions → **Show hint** → **Knowledge check** order, Reverse Advance, `sky-500` Ready state, the "CPU must stay busy" rule, detailed bulleted instructions, responsiveness work, and a typography hierarchy. Keep all of that intact; this round refines and extends it.

## Ground rules (unchanged)

1. **Reconnaissance first.** Re-locate the relevant code before editing (tab/layout shell, Sandbox controls + display, Metrics/System States, scenario step renderer + scenario data, simulation/scheduler engine, shared typography/color/border tokens, tooltip definitions, the info-button component). Summarize the files you'll touch per item before changing them.
2. **Single source of truth.** Fix shared tokens/components once.
3. **No regressions.** Preserve all prior acceptance criteria (validation gating, Reverse Advance history, sky-500, keep-CPU-busy, etc.).
4. **Verify completeness** with grep/search wherever an item says "throughout/everywhere/all."
5. **PEDAGOGICAL REVIEW GATE (important):** Before implementing the architectural/pedagogical items (Section F), evaluate each for **OS-theory correctness**. If any proposed mechanic is pedagogically wrong or misleading, do NOT silently implement it — implement the correct version and clearly flag the deviation and your reasoning. Correctness of the lesson takes priority over literal instruction-following here.
6. Work section-by-section; give a concise per-item changelog. Ask before any schema change affecting persisted/saved state.

---

## Section A — Global copy/voice: remove ALL imperative statements

Convert **every piece of UI copy in the entire project** from imperative/command voice (and second-person "you will learn/understand") to neutral, **declarative** voice describing what the feature is or what can be done.

- Imperative (wrong): "Use these controls to manage the sandbox. Create processes and move them between states to learn the process life cycle."
- Declarative (right): "These controls manage the sandbox. Processes can be created and moved between states using the controls."
- Also remove phrasings like "you will learn…", "you will understand…", "learn that…". State what the experiment/feature **does** or what **can be done**, not what the user is commanded to do or promised to learn.

Apply this principle to **all** text: info-button tooltips, section descriptions, scenario objectives, instructions, hints, evaluation copy — everywhere. Grep for second-person/imperative patterns and report what you changed.

---

## Section B — Typography hierarchy (apply project-wide)

Enforce a strict, consistent size hierarchy so panel headings are clearly larger than their subsections, reducing navigation load. Levels, from largest to smallest (illustrative ratios, not literal px — define as shared classes/tokens):
- **Panel/section title** (e.g., "Process Life Cycle Sandbox") — largest.
- **Sub-section heading** (e.g., "Event Requests", "Processes and Current State") — clearly smaller than the panel title.
- **Item/label level** (e.g., "CPU", "Ready", state labels) — smaller again.

The same role must always use the same size/weight across every view. Fix any place where headings and their children look the same size or where importance is visually inverted. Keep it consistent across breakpoints (works with the existing responsiveness).

Specifically: **"Guided Learning Scenarios" and "Process Life Cycle Evaluation" must use the same text size** as each other (they currently differ).

---

## Section C — Buttons: 3D, shadowed, stronger hover

Make buttons look tactile and 3D: add resting **shadows** so they appear raised. On **hover**, make the effect clearly more pronounced than the current subtle state — the button should **grow slightly** (subtle scale-up) **and shift color more noticeably** (and deepen/raise the shadow). The current hover is too subtle; increase its magnitude while keeping it tasteful. Apply consistently via the shared button component/classes.

---

## Section D — Tabs

1. **Reorder** the main tabs to: **Scenarios** (first), **Sandbox** (middle), **Evaluation** (last).
2. **Inactive tab color:** darken inactive tabs so active vs. inactive is clearly distinguishable. (On large/4K displays the current light-grey inactive tabs read as plain white; use a darker grey so the distinction survives bright, less-color-accurate screens.)
3. **Tooltips (hover text) for Scenarios, Sandbox, and Evaluation:** rewrite to be **more comprehensive** (describe what each area does), in declarative voice (Section A), and **remove any mention of keyboard shortcuts** — shortcuts have their own dedicated button.

---

## Section E — Borders, outlines, and dividers

Darken the greys used for: **section outlines**, **grey button outlines**, and the **divider lines between sub-sections**. Currently they're too light (especially on bright/4K screens). Use a darker grey token consistently so structure is visible without being heavy. Update the shared border/divider token(s).

---

## Section F — Layout, structure & pedagogical/architectural changes

### F1. Sandbox layout regions
- **Current Time** belongs in the **Display (middle section)**, not in Controls. Move it there so the page's region distinctions (controls / display / etc.) are clean.
- **Remove the Legend entirely** — process states are already color-coded.
- **Advance Clock button:** give it a **forward-pointing icon** (the mirror of the Revert/Step-Back icon; pointing forward).
- **Rename the "Step Back" button to "Revert Clock"** (keep its existing Reverse-Advance functionality from the prior round).
- **Remove the redundant "Selected Process"** readout from Controls (if not already removed).

### F2. "Valid attempts" section (renamed from "Valid transitions")
- Valid transitions is **not part of Controls**. Create a **small dedicated section directly below Controls** for it, preserving the overall layout structure.
- **Rename "Valid transitions" → "Valid attempts".**
- Replace the **text** representation with a **state-diagram graphic** (see Section G for the exact spec), using project colors.

### F3. State Presence → dedicated scrollable Metrics section
- Restyle **State Presence** to match the **Action Log** design, and give it its own **dedicated, scrollable section inside the Metrics area** (exactly like Action Log has). Scrolling ensures the page **does not grow/extend** when many processes are created — the overall structure stays fixed.

### F4. System States / Metrics cleanup
- **Remove "Current State Summary"** from System States — redundant.
- **System States must also capture invalid transition attempts** so they're available for evaluation (record each rejected/invalid transition the user attempts, with enough detail to evaluate against).
- **Remove the "Completed Processes" metric** entirely.

### F5. Event Requests → add an Event Catalog
- Add an **Event Catalog** section **directly below "Event Requests"** listing **all possible event types** that can be generated in Event Requests (e.g., I/O-needed, I/O-complete, terminate, preempt, etc. — enumerate exactly the events the engine can emit), each with a short declarative description. Keep it consistent with the events the engine actually produces.

### F6. Scenarios content fixes
- **Remove the "Infant" state completely** — there is no such state. Scenario 0 (and anywhere else) must reflect the real states only: **Ready, CPU (Running), I/O Wait, Terminated** (plus the entry "New process" admission). Verify no "Infant" reference remains anywhere.
- Fix Scenario 0 objectives that are imperative ("Understand the five process states…", "Learn that processes can only be terminated from the CPU…") → declarative, per Section A (e.g., "This experiment covers the process states Ready, CPU, I/O Wait, and Terminated and the transitions between them. A process can be terminated only from the CPU (Running) state."). Apply this voice to all scenario objectives/instructions/hints.
- **Remove the subtitle** "Learn process life cycle management through interactive, step-by-step guided scenarios with immediate feedback and hints." beneath "Guided Learning Scenarios" (it's redundant and imperative).
- **Remove the subtitle** "Comprehensive scenarios to evaluate your understanding of process states, valid transitions, and event-driven state changes." beneath "Process Life Cycle Evaluation" (redundant).
- **Change the "Process Life Cycle Evaluation" icon** — it currently matches the Instructions icon; choose a distinct, appropriate Lucide icon (e.g., a checklist/clipboard-check/graduation-style icon).

### F7. Architectural: transitions are an ordered SET (full lifecycle), CPU never idle while Ready non-empty
Scenario evaluation must require a **sequence of transitions** (the clock does not auto-advance), not single hops. Because multiple processes can be Ready, the CPU must not be left empty when a runnable process exists (consistent with the prior "keep CPU busy" rule).

Worked example to model the evaluation logic on — "drive P1 through a full cycle to Terminated" with P1 and P2 both initially Ready:
P1 → CPU, then P1 → I/O, then **P2 → CPU** (CPU shouldn't sit empty), then P1 → Ready (I/O completed), then P2 → I/O, then P1 → CPU, then P1 → Terminated.

Generalize this: scenario steps that involve multiple processes must validate the **whole ordered transition set**, enforce that the CPU is occupied whenever a Ready process is available, and only mark the step complete when the correct full sequence has been performed. **Verify this is pedagogically correct** (single-core, non-preemptive vs. preemptive assumptions) and adjust the canonical accepted sequence(s) accordingly — if multiple valid orderings exist under the model, accept any valid ordering rather than one hardcoded path, and explain your choice.

### F8. State-presence timing bug + "no dispatch on creation cycle" rule
Bug: creating P1 at clock = 4 and moving it to CPU **without advancing the clock** leaves State Presence showing "Ready 0" (the time spent isn't picked up).
- Fix the **time-accounting** so State Presence records time correctly.
- Add the rule that a **newly created process cannot be dispatched to the CPU in the same clock cycle it was created** — it must spend at least one cycle in Ready first (a newly admitted process enters the Ready queue and is dispatched on a subsequent scheduling decision). Fold this rule into the transition-set validation in F7.
- **Confirm this is pedagogically sound** before implementing; if the correct model differs, implement the correct version and explain.

### F9. Step completion gating (reconfirm + alerts)
A scenario step is completable **if and only if** (a) the knowledge check is answered **correctly** AND (b) the instructions/required transitions have been fully followed. Until both hold, the **Complete Step button stays inactive**. If the user attempts to click it prematurely, show a **clear, relevant alert** stating exactly what's still missing (which condition is unmet). This must not be bypassable.

---

## Section G — State diagram spec for "Valid attempts" (rebuild from the reference image)

Recreate the attached process-state diagram as a **responsive inline SVG (or lightweight component)** using **project colors and terminology**. Match the reference layout. (If possible, attach the reference image in the Claude Code session too.)

Nodes (circles with centered labels), positioned like the reference:
- **Ready** — blue (`sky-500`), left.
- **CPU** — green, center.
- **I/O** — yellow, below-center.
- **Terminated** — red, right.

Directed edges with labels (use the project's own event/transition names where they differ from the reference):
- Entry arrow into **Ready**, labeled "New process".
- **Ready → CPU**, labeled "Dispatch".
- **CPU → Ready** (curved, over the top), labeled "Preempt".
- **CPU → Terminated**, labeled "Terminate".
- **CPU → I/O**, labeled per the project's wait/I-O-request event (reference text: "Resource or wait request").
- **I/O → Ready**, labeled per the project's I/O-complete event (reference text: "Resource granted or wait completed").

Colors must exactly match the project's state colors (Ready/blue, CPU/green, I/O/yellow, Terminated/red). Make it scale cleanly across breakpoints. Place it in the Valid attempts section.

> NOTE FOR CLAUDE CODE: the user's instruction "place it below Terminated" is ambiguous. Default to rendering the full diagram as the content of the Valid attempts section. If "below Terminated" refers to a specific existing layout element, flag it rather than guessing.

---

## Final deliverables

1. Reconnaissance summary of files touched per item.
2. All sections implemented; prior-round behavior intact.
3. **Pedagogical-review notes** for Section F (F7, F8 especially): what you confirmed correct, and any place you deviated from the literal instruction to stay pedagogically correct, with reasoning.
4. Grep/search proof for project-wide items: no imperative/"you will" copy remains (A), no "Infant" reference remains (F6), typography roles consistent (B).
5. The Event Catalog matches the engine's actual emitted events (F5).
6. Passing build/lint (and tests if present), plus a concise per-item changelog.

Ask before changing the scenario schema in a way that affects persisted/saved state, or before removing state that has other consumers.

---

## Round 3 — Refactoring-UI Visual Pass + Drag-and-Drop

A visual refactor based on *Refactoring UI* (see `REFACTORING-UI-REVIEW.md`), applied one item at a time. Each item was verified loop-free under a hard memory cap (`systemd-run --user --scope -p MemoryMax=2G -p MemorySwapMax=0`) before committing, because an earlier attempt at items 1–2 had caused a system-wide OOM. Production builds stayed bounded (~650 MB) throughout.

> **Note on the dev-mode OOM:** `next dev` (Turbopack) for this `-exp` checkout balloons past 6 GB on first compile and is OOM-killed — but this is **pre-existing**. The base commit (`90d0745`, before any of these changes) reproduces it identically, and every production `next build` succeeds at ~650 MB. The refactor is not the cause. Use a production build (`next build` + `next start`) to preview.

### 1. Use fewer borders
Collapsed the three-deep border nesting in the Sandbox (Card border → inner gray box → dashed drop zone) down to **one separation method per level**: the Card keeps its border, lanes / event queue / action log / metric boxes keep `bg-gray-50`, and inner content separates with spacing only. All dashed and redundant middle-box borders removed. Lightened the global `--border` token `oklch(0.83)` → `oklch(0.89)` (literal value only — never references another token, to avoid a circular `@theme` chain).
**Files:** `components/process-scheduling-simulation.tsx`, `app/globals.css`
**Commit:** `refactor(ui): use fewer borders — separate with background + space`

### 2. Yellow/sky button text contrast (WCAG)
The `warning` (→ I/O) variant was `bg-yellow-500` with white text (fails WCAG) — changed the label to `text-yellow-950` (dark on yellow), keeping the yellow fill. Also darkened the borderline `ready` variant `sky-500` → `sky-600` so its white text clears contrast. *(The sky part was later reverted in change 8 by design.)*
**Files:** `components/ui/button.tsx`
**Commit:** `fix(a11y): yellow/sky button text contrast (WCAG)`

### 3. Unify the shadow light source
Button hover shadows were offset down-right (`6px 9px…`) while Cards use a straight-down `shadow-sm`, implying two light sources. Set the button hover-shadow x-offset to `0` (straight down) to match the Cards. Per-hue shadow tints unchanged — only the direction is unified.
**Files:** `components/ui/button.tsx`
**Commit:** `style(buttons): unify shadow light source to straight-down`

### 4. De-emphasize info icons + tint text on colored panels
Recolored the ~14 tooltip ⓘ icons from `text-blue-600` to `text-muted-foreground`, and removed them entirely from self-explanatory headings (Controls, Action Log). Kept the blue Instructions-alert icon tinted to its own panel hue. Changed grey body text on colored panels (green-50 completion card / scenario header) from `text-muted-foreground` to `text-green-700`; alert bodies already used tinted `*-800` text.
**Files:** `components/process-scheduling-simulation.tsx`, `components/scenario-evaluation.tsx`, `components/guided-scenarios.tsx`
**Commit:** `style(ui): de-emphasize info icons; tint text on colored panels`

### 5. One meaning per color — difficulty badges off state hues
Difficulty badges were green/yellow/red, colliding with the Ready/CPU/I-O/Terminated state hues. Recolored them to a neutral **slate** ramp distinguished by intensity, locking sky/green/yellow/red to states only. (Blue's overload as "informational" was already removed in change 4.)
**Files:** `components/guided-scenarios.tsx`, `components/scenario-evaluation.tsx`
**Commit:** `style(ui): one meaning per color — difficulty badges off state hues`

### 6. Roomier move-panel buttons (whitespace)
The Move Process buttons were cramped (`text-xs px-1 py-1`, `gap-1`). Bumped to `text-sm px-3 py-2` in a `gap-2` grid for comfortable hit areas. *(This panel was later removed entirely in change 9.)*
**Files:** `components/process-scheduling-simulation.tsx`
**Commit:** `style(ui): roomier move-panel buttons (whitespace)`

### 7. Widen type-scale weight ladder for hierarchy
The `subsection-title` and `item-label` tiers were only 100 font-weight apart. Widened the ladder to **800 / 700 / 500** (panel / subsection / item-label). Font **sizes were left untouched** because they drive the tuned fixed-height layout — hierarchy now comes from weight, not size.
**Files:** `app/globals.css`
**Commit:** `style(ui): widen type-scale weight ladder for hierarchy`

### 8. Revert Create Process button to sky-500
The `ready` button variant carries the semantic Ready-state colour: a created process enters the Ready queue, and the Ready lane + Ready chips are `sky-500`. Reverted the change-2 contrast darkening (`sky-600`) for this variant so the Create Process button matches the state colour again. The yellow-button fix from change 2 is untouched.
**Files:** `components/ui/button.tsx`
**Commit:** `revert(buttons): keep Create Process (ready variant) at sky-500`

### 9. Drag-and-drop process moves (mouse + touch)
Removed the "Move Process" button panel. Processes are now moved by **dragging a chip onto a lane** (CPU / Ready / I/O / Terminated). Built on **Pointer Events** so it works with mouse, pen, and touch (phones) — not HTML5 `draggable`. Details:
- chips use `touch-action: none` + pointer capture so dragging a chip doesn't scroll the page;
- the drop lane is resolved by hit-testing the pointer position (`elementFromPoint` → `data-lane-state`);
- the hovered lane highlights in its own state hue;
- the drag preview is portaled to `<body>` with `pointer-events: none` so it never blocks hit-testing.
A quick **tap still selects** a chip (keyboard `G/I/R/T` still work); a real drag suppresses the trailing click. Moves still pass through engine validation.
**Files:** `components/process-scheduling-simulation.tsx`
**Commit:** `feat(sandbox): drag-and-drop process moves (mouse + touch)`

---

## Round 4 — Dev-server OOM Root Cause: Turbopack, not the UI

### Symptom
`pnpm dev` froze the whole machine (RAM filled, swap thrashed, OS killed the browser/terminal). Earlier rounds blamed the Refactoring-UI pass (darkened `--border` OKLCH token, info-icon/tooltip changes) and treated it as a "circular CSS token / ResizeObserver loop." That diagnosis was wrong — the freeze persisted on clean, committed code when running the dev server.

### Root cause
The OOM is **Turbopack's dev compiler** on this **Next.js 16.2.0 / Node v26** setup — it balloons past 2 GB while compiling `/`. It is **not** related to any UI/CSS change.

Reproduced under a hard memory cap (`systemd-run --user --scope -p MemoryMax=2G -p MemorySwapMax=0`), so a runaway only killed its own scope:

| Command | Result |
|---|---|
| `next dev` (Turbopack) | **oom-kill at 2 GB** compiling `/` |
| `next dev` (Turbopack), `globals.css` stripped to just `@import "tailwindcss";` | **still oom-kill at 2 GB** — exonerates all CSS |
| `next dev --webpack` | HTTP 200, memory flat ~0.7–1 GB across requests |
| `next build` (Turbopack) | clean in ~1.6 s |

Stripping the stylesheet to one line still OOMs, and `next build` uses Turbopack yet compiles the identical code fine. The only variable that flips OOM→stable is the **Turbopack dev path**. Earlier verification passed because it used the production build, which never exercises that path.

### Fix
Pin the dev server to the webpack compiler:

```diff
- "dev": "next dev",
+ "dev": "next dev --webpack",
```

Verified via the real `pnpm dev` under the cap: server stays up, all requests 200, memory stable at 705 MB (peak 862 MB), no oom-kill. Static review confirmed the committed app code is loop-free (no circular `@theme` tokens, no `ResizeObserver`, parent callbacks are `useCallback([])`-stable).

**Note:** to revisit Turbopack later (Next patch, or pinning Node to an LTS — v26 is bleeding-edge), re-test under the memory cap before dropping `--webpack`.

**Files:** `package.json`
**Commit:** `fix(dev): use webpack dev server — Turbopack dev OOMs on Next 16.2/Node 26`

---

## Round 5 — Sandbox Panel Styling Polish

All changes in `components/process-scheduling-simulation.tsx`.

### 1. Greyer generative panels — `bg-gray-50` → `bg-gray-100`

The nine grey "generative" panels were one shade too light (`bg-gray-50`, `#f9fafb`). Stepped them up one notch to `bg-gray-100` (`#f3f4f6`) for clearer separation from the white cards:

Event Request queue, CPU / Ready / I/O / Terminated lanes, State Presence (Relative), Action Log, Invalid Transition Attempts, State Transition History.

(The pre-existing `bg-gray-100` event-color helper at the top of the file was unrelated and left as-is.)

### 2. Fixed height for State Presence & Action Log — `max-h-*` → `h-*`

Both boxes used `max-h-32 sm:max-h-48`, so they grew with each generation and the layout jumped. Changed to a constant `h-32 sm:h-48`; `overflow-y-auto` is kept, so content scrolls inside the box instead of expanding the panel.

```diff
- <div className="max-h-32 sm:max-h-48 overflow-y-auto ... bg-gray-100">   {/* State Presence */}
+ <div className="h-32 sm:h-48 overflow-y-auto ... bg-gray-100">
- <div className="max-h-32 sm:max-h-48 overflow-y-auto ... bg-gray-100">   {/* Action Log */}
+ <div className="h-32 sm:h-48 overflow-y-auto ... bg-gray-100">
```

### 3. State Presence — placeholder moved inside the fixed-height box

Previously the empty-state ("No process data yet…") was a separate `<p>` rendered *outside* the grey box; on the first generation the layout jumped from a short paragraph to the full box. Restructured so the box is always present at `h-32 sm:h-48` and the empty/populated branch lives **inside** it — constant height from the start.

### 4. Action Log placeholder text size — `text-xs sm:text-sm` → `text-xs`

The "No activity yet…" placeholder bumped to `text-sm` on wider screens, making it larger than every other panel's placeholder. Pinned to `text-xs` to match Event Request and State Presence.

### 5. Placeholder alignment — left-aligned, vertically centered

The fixed-height boxes centered their placeholder horizontally (`text-center`) and pushed it down with `py-*`, inconsistent with the lanes. Unified the three fixed-height boxes (Event Request, State Presence, Action Log) to `h-full flex items-center text-xs` — **left-aligned, vertically centered** in the box.

```diff
- <div className="text-center text-muted-foreground py-4 sm:py-8 text-xs">No active events</div>
+ <div className="h-full flex items-center text-muted-foreground text-xs">No active events</div>
- <p className="text-xs text-muted-foreground">No process data yet. …</p>
+ <p className="h-full flex items-center text-xs text-muted-foreground">No process data yet. …</p>
- <div className="text-center text-muted-foreground py-4 text-xs">No activity yet. …</div>
+ <div className="h-full flex items-center text-muted-foreground text-xs">No activity yet. …</div>
```

The CPU/Ready/I/O/Terminated lanes (reference style) and the Invalid Transitions / State Transition History boxes (which shrink to content when empty, no tall gap) were already left-aligned and left untouched.

**Files:** `components/process-scheduling-simulation.tsx`, `CLAUDE.md`

---

## Round 6 — Guided Tour (first-run animated walkthrough)

Added a state-driven onboarding tour to the Sandbox that walks a new user through a full
process life cycle for **P0**: Ready → CPU → I/O → Ready → CPU → Terminated. Each step
highlights the real control to use (pulse animation) with an anchored instruction popup, and
each lane transition is demonstrated by a ghost **P0** chip animating between the *actual*
lanes. Replaces the earlier one-off "Drag a process…" text hint.

### 1. Tour engine — `TOUR_STEPS` + step machine

`TOUR_STEPS` (module-level in `process-scheduling-simulation.tsx`) is an ordered list of 16
steps. Each step:

```ts
interface TourStep {
  id: string
  target: { kind: "button"; button: "advance" | "create" | "revert" }
        | { kind: "event"; event: "create_request" | "io_needed" | "io_done" | "terminate" }
        | { kind: "drag"; from: SimulationProcess["state"]; to: SimulationProcess["state"] }
  message: string
  done: (s) => boolean   // advance to next step when this is satisfied by real engine state
}
```

A `useEffect` runs on every `simulationState` change and advances `tourStep` past any step
whose `done` predicate is met — so the tour only moves forward when the user performs the
actual action (helpers `evActive`, `evSelected`, `p0State`).

### 2. Why there's an extra "Advance Clock once" step (step 4)

`SimulationEngine.moveProcess` rejects dispatching a freshly-created process in the same clock
cycle it was created (`readyEnteredTime === currentTime && history.length === 1`). The tour
therefore inserts an explicit "Advance Clock once before dispatching P0" step between Create
Process and the first Ready → CPU drag, or the drag would fail. `create_request`/`io_done` are
probabilistic, so those steps just keep Advance Clock pulsing until the event appears. The
final **Revert Clock** step completes when the clock moves backwards (detected via
`tourBaselineTime`).

### 3. Animations

- **Click cue:** `.tour-target-btn` (control buttons — larger/more opaque ring) and
  `.tour-target` (event chips — softer) apply pulsing `box-shadow` keyframes (`app/globals.css`).
  Buttons use a stronger pulse because the blue "info" buttons washed out the softer ring.
  No static outline (removed on request).
- **Drag cue:** a ghost `P0` chip (`.drag-hint-ghost`) animates between the two real lanes for
  the current transition. Lane centres are measured live (`getBoundingClientRect`, recomputed
  on resize) into `hintGeom` and fed to the keyframe as CSS vars `--hx0/--hy0/--hx1/--hy1`.

### 4. Instruction popup — responsive

Portalled to `document.body`. On `< 640px` there's no room beside a full-width control, so it
pins as a **bottom banner** (full width − 16px); at `≥ 640px` it anchors beside the target and
clamps to the viewport on both axes. The target keeps pulsing so association survives the
banner placement.

### 5. Lifecycle / controls

- `tourActive` defaults `true`; the tour renders only on the live Sandbox tab (`isActiveTab`),
  never in the embedded Scenarios simulation.
- Every popup has a **Stop guide** button (`setTourActive(false)`).
- **Reset** restarts the tour from the beginning (`tourStep = 0`, `tourActive = true`,
  `tourBaselineTime = null`).

### 6. Event Catalog elongation

Made the Controls column a `flex flex-col` and the Event Catalog card `flex-1` so it stretches
to fill the grid row — its bottom now aligns with the sandbox and Metrics & Log cards. The
inner list keeps a `min-h-[11.875rem]` floor so it doesn't collapse on stacked mobile layouts.

**Files:** `components/process-scheduling-simulation.tsx`, `app/globals.css`, `CLAUDE.md`

---

## Round 7 — Tour polish: layout alignment, scrollable catalog, colour-coded ghost

Follow-ups to the guided tour and the surrounding layout.

### 1. Three-column equal-height alignment (xl)

At `xl` the **Controls column**, **Sandbox card**, and **Metrics & Log card** share one grid
row. Metrics & Log is the shortest, so it's marked `self-start` (sizes to content) and a
`useLayoutEffect` + `ResizeObserver` measures it and **caps the other two to its height** so all
three bottoms line up:

```ts
// ponytail: CSS grid grows a row to its tallest child, never shrinks to the shortest — hence JS.
const apply = () => {
  const h = window.innerWidth >= 1280 ? `${metricsCardRef.current.offsetHeight}px` : ""
  controlsColRef.current.style.height = h
  sandboxCardRef.current.style.height = h
}
```

Refs: `metricsCardRef`, `controlsColRef`, `sandboxCardRef`. Only applied at `≥ 1280px`; below that
the three are on separate rows and the inline height is cleared. Both capped elements use
`overflow-hidden`.

### 2. Event Catalog scrolls internally

With the column capped, the catalog list needs to shrink and scroll rather than clip. Switched
the `min-h-[11.875rem]` floor to `min-h-0` all the way up the flex chain (catalog `Card`
`flex-1 min-h-0` → `CardContent` `flex-1 flex flex-col min-h-0` → list `flex-1 min-h-0
overflow-y-auto`) so `overflow-y-auto` engages instead of the column clipping.

### 3. Colour-coded tour ghost chip

The drag ghost was always blue; now it matches the state colour coding (ready=sky,
running=green, blocked=yellow, terminated=red — via `STATE_COLOR`, mirroring `getProcessColor`).
The chip holds the **source-state** colour while picked up/dragging and flips to the
**target-state** colour on drop:

```
Ready→CPU: blue → green   CPU→I/O: green → yellow
I/O→Ready: yellow → blue  CPU→Terminated: green → red
```

Implemented with the `.drag-hint-chip-color` class + `drag-hint-color` keyframe (flip at ~70%,
synced to the 2.8s motion) and CSS vars `--hc0` (from) / `--hc1` (to) set on the ghost from the
current drag step.

### 4. Button pulse tuning

The control-button pulse uses a dedicated `.tour-target-btn` (larger, more opaque ring) because
the softer event-chip `.tour-target` washed out on the blue "info" buttons. Colour kept the
original sky-blue; no static outline (removed on request). Popup made responsive: bottom banner
under 640px, anchored-and-clamped above it.

**Files:** `components/process-scheduling-simulation.tsx`, `app/globals.css`, `CLAUDE.md`

---

## Round 8 — Guided-scenario tours (per-step animations reusing the sandbox tour)

Extended the tour (pulses, colour-coded ghost drags, anchored popup) to **Guided Scenarios** so
every actionable step animates the controls the user should touch, driven by live sim state.

### 1. Reusable tour renderer — `externalTourCues` prop

Rather than a second renderer, `ProcessSchedulingSimulation` gained an optional
`externalTourCues?: TourStep[]` prop. When provided it replaces the built-in `TOUR_STEPS`, and:

- runs even though the embedded sim is `isActiveTab=false`;
- resets its cue index whenever the prop identity changes (one memoized array per scenario step);
- hides the **Stop guide** button (scenario tours can't be skipped — per request).

`TourStep` / `TourTarget` are now `export`ed. A `usingExternalTour` flag gates the differences;
the sandbox path (`externalTourCues == null`) is unchanged. The step machine, ghost geometry,
popup, and pulse classes all read from `tourSteps` (external or `TOUR_STEPS`) and `tourRunning`.

### 2. Per-step cue builder — `cuesForStep(step)`

In `guided-scenarios.tsx`, one builder keyed by `expectedAction` produces the cue list for a
step, using the step's own `instructionBullets` as popup text:

| expectedAction | cues |
|---|---|
| `create_process` / `create_multiple_processes` | pulse Advance → pulse create_request → pulse Create Process |
| `move_to_cpu` | ghost-drag Ready→CPU |
| `preempt_process` | ghost-drag CPU→Ready |
| `move_to_io` | pulse io_needed → ghost-drag CPU→I/O |
| `move_to_ready` | pulse io_done → ghost-drag I/O→Ready |
| `terminate_process` | pulse Advance → pulse terminate → ghost-drag CPU→Terminated |
| `read_intro` / `read_summary` / other | none |

Cues use **generic predicates** (`anyState`, `evActiveAny`, `evSelAny`) so they work with
multiple processes. State-driven, so advance/revert clock needs no saved index.
`currentTourCues` (memoized on `[selectedScenario, currentStep]`) is passed to the embedded sim.

### 3. Gating unchanged

Step completion still requires the quiz answered correctly **and** `validation(state)` (plus the
`cpuIdleBlocked` rule) — already enforced in `handleCompleteStep`; no change.

### Known follow-ups (deferred)

- Some cue popup texts (from `instructionBullets`) don't line up 1:1 with the exact on-screen
  control wording — to be reconciled later.
- `move_to_cpu`: a freshly-created process needs one clock tick before dispatch; the drag cue
  shows with the bullet telling the user to advance first, but the pulse is on the drag, not the
  Advance button.

**Files:** `components/process-scheduling-simulation.tsx`, `components/guided-scenarios.tsx`, `CLAUDE.md`

---

## Round 9 — Tour popup caret, phone stacking order, sandbox spacing/alignment

Visual polish on the tour popup and the sandbox card's internal layout.

### 1. Tour popup caret (tooltip arrow)

The anchored instruction popup got a **caret** (a rotated-square "diamond" nub) so it points at
the control it describes. It **auto-flips**: left edge (pointing left) when the popup sits to the
right of the target, right edge when it flips to the left — stored as `tourPopup.caret` from
`place()`. The mobile bottom banner has no caret (`caret: null`). Rendered with a 10px square,
`rotate(45deg)`, the popup's border colour on its two outward edges + white fill, half-overlapping
the edge.

### 2. Phone stacking order — Event Requests → Processes → Valid Transitions

On phones the sandbox sub-sections stacked E → Valid Transitions → Processes. Fixed with
**`display: contents`**: the left-column wrapper is `contents sm:flex`, so on phones its children
join the parent grid as direct items; `max-sm:order-last` on the two Valid Transitions pieces moves
them below Processes. All gated to `max-sm:` / overridden by `sm:*`, so **desktop is byte-for-byte
unchanged**.

### 3. Sandbox spacing + alignment

- Increased the spacing between the process-state lanes: `gap-3` → **`gap-4`** (12 → 16px) on both
  sandbox columns.
- Re-tuned the Event Requests box height `h-[10.3125rem]` → **`h-[10.5625rem]`** (165 → 169px) so its
  bottom stays aligned with **Ready** after the gap grew (box ≈ CPU-lane + gap + Ready-lane; Valid
  Transitions is `flex-1` so it re-aligned with Terminated for free).
- Trimmed the inter-section gaps on desktop: `sm:-mt-0.5` on the Valid Transitions header (−2px
  between Event Requests and Valid Transitions) and `sm:-mt-1` on the diagram button (−4px between
  the Valid Transitions heading and its diagram).
- Briefly trialled centering the diagram (`YMax` → `YMid`) and reverted it; `preserveAspectRatio`
  stays `xMidYMax meet`.

**Files:** `components/process-scheduling-simulation.tsx`, `CLAUDE.md`

**Commit:**
```
feat(sandbox): tour popup caret + phone stacking order + lane spacing

- Add an auto-flipping caret (diamond nub) to the anchored guided-tour popup
  so it points at its target; none on the mobile banner.
- Reorder sandbox sub-sections on phones to Event Requests -> Processes ->
  Valid Transitions via display:contents + max-sm:order-last (desktop unchanged).
- Widen process-lane spacing gap-3 -> gap-4; re-tune Event Requests height to
  169px to keep its bottom on Ready; -mt nudges trim inter-section gaps.
```

## Round 10 — Pedagogy layer: lessons, validations, controlled progression, learning records, analytics

**Rationale.** The next-generation Virtual Labs direction is pedagogy-first: prerequisite lessons in front of the experiment, a validation closing every task, progression gated on demonstrated understanding rather than completion, and analytics computed from learning records designed in from day one. This round adds that layer around the existing experiment without changing the simulator, scenarios, or evaluation behaviour.

**Key diffs.**
- New `lib/lesson-plan.ts`: the whole course as typed data — objectives LO1–LO6, lesson graph L1 → L2 → {L3, L4} → EXP → ASMT, tasks + validation items (`mcq`/`multi`/`order`), experiment challenges mapped to scenarios s1–s4, mastery check (pass ≥ 5/6).
- New `lib/learning-records.ts`: `record()` emits `{timestamp, user, action, object, metadata}`; pseudonymous learner id; path mode (guided/partial/open); persistence, hooks, JSON export. Keys `os-vlab-learning-records-v1`, `os-vlab-learner-v1`, `os-vlab-path-mode-v1`.
- New `lib/lesson-progress.ts`: progress store (`os-vlab-lesson-progress-v1`); `lockState(node, mode)`; `withUnlockTracking()`; `syncExperimentProgress()`; `experimentGateOpen()`.
- New `components/lessons.tsx` (Lessons tab: course map, lesson player, mastery check, mode selector) and `components/analytics-dashboard.tsx` (Analytics tab: funnel, hardest validations, misconception signals, time per node, record stream, export, synthetic cohort).
- `app/page.tsx`: five tabs (Lessons default, Analytics last); all tab switches — clicks and `Alt+N` — routed through gated `handleTabChange` (records `viewed`/`blocked`); `Alt+4`/`Alt+5` added for the new tabs; scenario-completion sync effect; Reset All clears pedagogy stores.
- `components/process-scheduling-simulation.tsx`: `showAlert` emits an `attempted-invalid` record with the refusal reason on every error alert (misconception bridge, 3 lines).
- `lib/lesson-plan.ts` item-bank wording: two distractors made more professional ("Both run simultaneously" duplicate avoided; "on the monitor" → "in the ready queue").

**Files:** `lib/lesson-plan.ts`, `lib/learning-records.ts`, `lib/lesson-progress.ts`, `components/lessons.tsx`, `components/analytics-dashboard.tsx`, `app/page.tsx`, `components/process-scheduling-simulation.tsx`, `CLAUDE.md`, `CHANGES.md`

**Commit:**
```
feat: add lesson-first pedagogy layer with learning records and analytics

Lessons tab (course map, task validations, mastery check), controlled
progression over guided/partial/open path modes with tab gating,
{timestamp, user, action, object, metadata} learning-record stream,
Analytics tab computed from records only, and an attempted-invalid
misconception bridge in the simulator alert path. Experiment node
challenges reuse guided scenarios s1-s4.
```

## Round 11 — Hide taxonomy metadata from learners; capture the learner name before the first record

**Rationale.** Two learner-facing UX defects in the Round-10 pedagogy layer. (A) LO codes and Bloom levels (LO1–LO6, "Understand/Apply/Analyse") are authoring/traceability metadata, but leaked into the Lessons UI in three places — worst on the course-map cards, where `requires L3 + L4 · LO3, LO4, LO5` read as if the LO codes were prerequisites. (B) Learner-name capture didn't support real per-learner tracking: the input lived inside the Lessons header, so the `launched` record (fired on Lessons mount) was always emitted before a name could be typed and got baked with the default `"Learner"`; the input saved only on blur; and `byUser()` in the dashboard pinned each learner's display name from their *first* record, so real users showed as "Learner" forever even after renaming.

**Key diffs.**
- `lib/lesson-plan.ts`: additive `blurb` field on `LessonNode`/`ExperimentNode`/`AssessmentNode` — a plain-language one-liner per node for the course-map card (e.g. L3: "what triggers a state change, and which moves the model won't allow"). `los`/`bloom` data unchanged; they remain instructor-facing (design docs + Analytics).
- `components/lessons.tsx`: removed all learner-facing LO/Bloom display — the `· LO…` tail on card prereq lines (prereqs now sit on their own line, with a separate `Covers: {blurb}` line below), the `measures LOx (Bloom)` chip on validation items, the objectives footer under the course map, and the `measures LOx` / `LO1–LO6` mentions in the mastery-check views (the failed-retake view now lists the objective *texts* only). Also removed the header learner-name input (capture moved to the app shell).
- `app/page.tsx`: new session-entry gate — a `SessionEntry` card replaces the tabs until the learner confirms a name or explicitly continues as "Learner"; confirmation calls `setLearnerName()` exactly once *before* any tab content mounts, so the session's first record (`launched`) already carries the right name. A stored non-default name pre-fills the form as "Continue as X" with a "Not you?" edit hint. Confirmation is remembered per browser session (`sessionStorage` key `os-vlab-session-entered-v1`), so mid-session reloads skip the prompt. `handleTabChange` no-ops (no records) until entry. Reset All additionally calls `clearLearner()` and clears the session flag, so a fresh prompt appears.
- `lib/learning-records.ts`: new `clearLearner()` (removes `os-vlab-learner-v1`).
- `components/analytics-dashboard.tsx`: `byUser()` now updates the stored display name on every record for an id (stream is chronological, so the latest name wins) — real learners who rename behave like synthetic cohort personas: one consistent, current name.

**Files:** `lib/lesson-plan.ts`, `lib/learning-records.ts`, `components/lessons.tsx`, `components/analytics-dashboard.tsx`, `app/page.tsx`, `CLAUDE.md`, `CHANGES.md`

**Commit:**
```
fix: hide LO/Bloom metadata from learners; capture name before first record

Course-map cards show a plain-language "Covers:" blurb (new per-node
field) instead of LO codes, prereqs sit on their own line, and all
LO/Bloom mentions are gone from the lesson player and mastery check
(Analytics keeps them — instructor-facing). A session-entry gate in the
app shell confirms the learner name before any tab (and any record())
mounts, replacing the blur-saved input in the Lessons header; byUser()
in the dashboard now tracks the latest name per learner id.
```

## Round 12 — Lessons overview: from flat card grid to a syllabus graph / progress tracker

**Rationale.** The Lessons overview was a responsive 6-card grid. It failed as an overview on three counts: the course's dependency structure (L1 → L2 → {L3, L4 either order} → EXP → ASMT) was invisible in an arbitrary grid arrangement; there was no way to survey what's *inside* a lesson without entering it (no syllabus); and it was weak as a progress check (no per-node fraction, no overall progress, no "continue where I left off"). This round replaces the grid entirely with a vertical syllabus graph that doubles as a progress tracker, following the design docs' requirement to both split material into small pieces *and* signal structure so learners always know where they are.

**Key diffs.**
- `components/lessons.tsx`: removed `NodeCard` and the `grid sm:grid-cols-2 lg:grid-cols-3`; added `SyllabusNode` (expandable card: status pill, requires-line, `Covers:` blurb, progress fraction, expand chevron, and a Start/Continue/Review action button that is the *only* thing entering the node), plus `SubItem`/`VBar` presentational helpers. The map branch now renders a **progress header** ("N of 6 stages complete" + thin bar + a single Continue control) and a vertical flow: L1 → L2 → labelled "either order" fork bar → L3/L4 two-column row → merge → EXP → ASMT. Connectors are plain styled divs — **no SVG edges** (deliberate, to avoid expand-triggered edge reflow; see the ResizeObserver notes in CLAUDE.md). Expanded lessons list task titles with ✓/▸/○ state; EXP lists its four challenges (challenge title — scenario title) with ✓ from `completedScenarios`; ASMT shows meta only and never the question stems.
- `upNext()` + `enterNode()` helpers: single computation of the next actionable step (in-progress lesson → "Continue"; else first `open`/`warn` not-done node in graph order → "Start"; else "Course complete"), shared by the header Continue button and the one node auto-expanded on mount, so they always agree. Entering still routes through the unchanged gated `openNode`.
- Expand/collapse (`openNodes` set + `toggleNode`) emits **zero** records; `openNode`, `lockState`, and all record emissions are untouched. The subtitle jargon line ("Lesson-first path · every task ends in a validation") is gone; the mode pills were factored into `modePills`, reused by the simpler lesson/assessment sub-view header.
- `components/guided-scenarios.tsx`: new `export const SCENARIO_TITLES` (scenarioId → title, derived from `GUIDED_SCENARIOS`) so the EXP syllabus names its scenarios from a single source of truth.
- No changes to `lib/lesson-plan.ts` data, the lesson player, mastery check, analytics, or progression logic — everything above is derived from existing data and props.

**Files:** `components/lessons.tsx`, `components/guided-scenarios.tsx`, `CLAUDE.md`, `CHANGES.md`

**Commit:**
```
feat: replace Lessons card grid with a syllabus graph progress tracker

The course overview is now a single vertical flow of expandable nodes
with a visible L3/L4 fork/merge (plain-div connectors, no SVG edges),
a progress header with "N of 6 stages complete" and one Continue
button, per-node progress fractions, and expand-to-preview syllabus
(lesson tasks, EXP challenges with scenario titles, ASMT meta only —
never its question stems). Continue button and the auto-expanded node
share one upNext() computation; expanding emits no learning records.
Adds SCENARIO_TITLES export from guided-scenarios as the syllabus's
scenario-title source.
```

## Round 13 — Lab intro (aim & objectives) + colour pass on the pedagogy surfaces

**Rationale.** Two UX requests. First, the landing experience never said what the lab is *for* — a lab needs an aim and objectives up front, like any physical lab manual. Second, the Lessons and Analytics tabs read almost entirely black-and-white: the theme's `--primary` is greyscale (`oklch(0.205 0 0)`), so everything keyed to `text-primary`/`bg-primary` renders black. The fix stays inside the palette the lab already owns — the process-state colours (sky = ready, green = running, amber = blocked, red = terminated) used by the simulator, pills, and analytics bars.

**Key diffs.**
- `components/lessons.tsx`:
  - New **lab intro card** at the top of the syllabus overview: three columns — Aim (sky Target), What you'll learn (green BookOpen), What you'll do (amber FlaskConical) — written in plain language (no LO codes), covering purpose, content, and activities.
  - `SyllabusNode` gets a kind-coloured icon in its `id · kind` line (lesson = sky BookOpen, experiment = green FlaskConical, assessment = amber GraduationCap).
  - Sky accents where "current/selected" was black: overall progress bar, quiz option selection (border/fill/hover), order-item position numbers + chips, task-rail current row, lesson kicker, validation chip (was `bg-foreground`), `SubItem` current icon. Amber accents for the keyfact callout (was `border-primary`) and the mastery-check kicker.
- `components/analytics-dashboard.tsx`: KPI cards get `border-t-2` accents (sky/green/amber/slate); the "Derived from the record stream only" kicker is sky; first-attempt correctness is banded (red < 50 %, amber < 70 %, green otherwise); record-stream verbs are outcome-coloured via a new `actionColor()` (green = completed/passed/unlocked, red = failed/blocked/attempted-invalid, amber = warned/skipped).
- `app/page.tsx`: the session-entry gate opens with a one-sentence purpose line ("interactive lab on how an OS manages processes… lessons → simulator → mastery check") before the records notice.
- No data, progression, or record changes anywhere — presentation only.

**Files:** `components/lessons.tsx`, `components/analytics-dashboard.tsx`, `app/page.tsx`, `CLAUDE.md`, `CHANGES.md`

**Commit:**
```
feat: add lab aim/objectives intro and state-palette colour accents

Syllabus overview opens with an Aim / What you'll learn / What you'll
do card and the entry gate states the lab's purpose. Lessons and
Analytics pick up minimal colour from the existing process-state
palette (sky/green/amber/red): kind icons on syllabus nodes, sky
selection/progress states in the lesson player, amber keyfact callout,
KPI top-border accents, banded first-attempt %, and outcome-coloured
verbs in the record stream. Presentation only - no data or record
changes.
```

## Round 14 — Restyle the Lessons overview in the app's own design dialect

**Rationale.** User feedback on Round 13: the Lessons page — especially the new Aim/objectives intro — felt "off from the rest of the project". Root cause: the intro used a bespoke dialect (three columns of tiny font-mono uppercase kickers) while the rest of the app speaks in `panel-title` card headers with icons, tinted info panels (the green "Step Objectives" box, blue info alerts in Guided Scenarios), numbered coloured lists, and green `variant="success"` CTAs.

**Key diffs.**
- `components/lessons.tsx`, syllabus overview: the separate flex header + intro card were merged into **one course header Card** in the shared dialect — `CardHeader` with a `panel-title` GraduationCap title and an **Aim:** sentence (mode pills to the right), `CardContent` with two objective panels ("What you'll learn" / "What you'll do") — plain-bordered with numbered items after feedback that fully tinted panels were too colourful; colour is limited to the icon and item numbers (green / sky) followed by a green progress bar ("Progress: N of 6 stages complete") and the Continue button, now `variant="success"` with a Play icon (matching "Start Guided Learning"). "Course complete" became an outline badge.
- `SyllabusNode`: titles bumped to `text-base font-bold`; Start/Continue action buttons use the light-blue `variant="ready"` (sky-500, the Ready-state colour) with Play — per user feedback, only the header "Start course"/Continue CTA stays green `success` (Review stays outline); cards are `flex h-full flex-col` with the button row on `mt-auto`, so the side-by-side L3/L4 buttons align at the bottom regardless of content height. Lesson/assessment sub-view headers use `panel-title` + GraduationCap.
- CLAUDE.md notes the dialect so future Lessons styling matches it.

**Files:** `components/lessons.tsx`, `CLAUDE.md`, `CHANGES.md`

**Commit:**
```
style: align Lessons overview with the app's shared design dialect

Merge the overview header and intro into one course header card:
panel-title + GraduationCap, an Aim: sentence, green/blue tinted
objective panels matching the Scenarios "Step Objectives" pattern,
green progress bar, a green header CTA, and sky ready-variant
Start/Continue buttons with Play icons on the syllabus nodes.
```

## Round 15 — Session-entry gate themed as process admission

**Rationale.** User feedback: the "Who's learning today?" page was too plain. Instead of decorating it arbitrarily, the gate now teaches the lab's first concept before the first lesson: the learner *is* a brand-new process being admitted. Colour comes from the state palette the whole lab already uses.

**Key diffs.**
- `app/page.tsx` `SessionEntry`: a life-cycle chip strip (New → Ready → CPU → I/O Wait → Terminated, colours mirroring `STATE_CHIP_COLORS` via a local `ENTRY_STRIP`) sits at the top; the **New** chip pulses and carries the typed name **live** as you type ("you" until then), with a "↑ you are here" caption. Copy reframed: "you are the newest process on this machine, sitting in New… name yours to join the Ready queue." Card gets a sky top-accent (`border-t-4 border-t-sky-500`); the title gets a sky Cpu icon; the input gets a sky focus ring; the submit is `variant="ready"` (sky — semantically "joins Ready") labelled `Admit "X" to the Ready queue` (still `Continue as X` for returning learners). Anonymous ghost option unchanged; capture semantics (one `setLearnerName` before anything mounts) untouched.

**Files:** `app/page.tsx`, `CLAUDE.md`, `CHANGES.md`

**Commit:**
```
style: theme the session-entry gate as process admission

The name gate now opens with a live life-cycle chip strip - the
pulsing New chip carries the typed name in real time - and admission
copy ("name your process to join the Ready queue"), a sky top-accent,
sky-focus input, and a ready-variant submit button. Capture semantics
unchanged.
```

## Round 16 — The learner-as-process journey, integrated across the app

**Rationale.** User feedback on Round 15: extend the "you are the process" vibe from the entry gate to the whole project. Rather than sprinkling decorations, the metaphor became a real, persistent instrument: the learner's session *is* a process, and its position on the life cycle is displayed live in the app header — the same graphic language the gate introduced.

**Key diffs.**
- `app/page.tsx`: the gate's inline chip strip was extracted into a shared `LifeStrip` component (active chip carries the learner's name; others dimmed; `JOURNEY_MEANING` tooltip; optional pulse used only on the gate). The app header now renders it (≥ `lg`, only once entered) at a computed `journeyIdx`: guided-gate lock notice → **I/O Wait**, mastery check done → **Terminated**, inside a lesson or on an experiment tab → **CPU (Running)**, otherwise → **Ready**. The lock notice itself now teaches the mapping: "You're blocked — like a process waiting on I/O…".
- `components/lessons.tsx`: new optional `onViewChange` prop reports the internal view (map/lesson/asmt) to the shell so "inside a lesson" registers as Running; completion surfaces speak the metaphor — the header badge reads "Course complete · exit 0" and the mastery card adds "your process has terminated cleanly — exit code 0".
- Presentation only: no records, progression, or data changes; the strip derives from state the shell already had (plus the one-view callback).

**Files:** `app/page.tsx`, `components/lessons.tsx`, `CLAUDE.md`, `CHANGES.md`

**Commit:**
```
feat: show the learner's session as a live process on the life cycle

Extract the entry gate's chip strip into a shared LifeStrip and render
it in the app header: the learner's named chip moves through Ready /
Running / I/O Wait / Terminated as they browse, work, hit guided-mode
gates, or finish the course. LessonsTab reports its view via a new
onViewChange prop; lock-notice and completion copy carry the metaphor
("blocked - like a process waiting on I/O", "Course complete - exit 0").
```

## Round 17 — Revert Round 16

**Rationale.** User request: revert to the previous version. All Round 16 changes (shared `LifeStrip` in the app header, `journeyIdx` derivation, `onViewChange` prop on `LessonsTab`, "blocked — like a process waiting on I/O" lock notice, "exit 0" completion copy) were backed out. The codebase is back to the end of Round 15: the process-admission theme exists only on the session-entry gate.

**Files:** `app/page.tsx`, `components/lessons.tsx`, `CLAUDE.md`, `CHANGES.md`

**Commit:**
```
revert: back out the header learner-journey strip (Round 16)

Restore the pre-Round-16 state: the life-cycle chip strip appears only
on the session-entry gate; lock-notice and completion copy return to
their previous wording; LessonsTab loses the onViewChange prop.
```

## Round 18 — Concise tab tooltips; declarative-voice sweep of the pedagogy layer

**Rationale.** User re-raised the project's copy-voice rule (originally "Section A — Global copy/voice: remove ALL imperative statements", enforced in an early round): no imperative/command voice, no second-person "you will learn" promises, anywhere. The pedagogy layer added in Rounds 10–15 had reintroduced violations, and the tab tooltips had grown verbose. The rule is now also written into `CLAUDE.md` (new "Copy voice" section, with the two standing exemptions: button/CTA action labels and guided-scenario step directives) so future rounds keep it.

**Key diffs.**
- `app/page.tsx`: all five tab tooltips rewritten concise + declarative (e.g. Scenarios → "Step-by-step guided scenarios pairing instructions with knowledge checks in a live simulation."). Session gate copy converted ("the newest process on this machine is the learner…", "Every process needs a name before the OS admits it to the Ready queue", "The name is attached to every learning record…", placeholder "Process name…", caption "↑ this session's process"); the guided-gate lock notice → "…the Scenarios, Sandbox and Evaluation tabs unlock once lessons L3 and L4 are complete."
- `components/lessons.tsx`: intro card — "What you'll learn"/"What you'll do" → **Objectives**/**Activities** with noun-phrase items; Aim sentence declarative; order-quiz placeholder → "the steps below appear here in the order selected…"; multi-select hint → "more than one option may apply"; wrong-answer feedback → "Not quite. Hint: …"; locked-node notice → "…unlocks once X is complete"; experiment notice → "…its challenges are passed by completing the four listed scenarios"; failed-mastery view now lists the **lessons** covering weak objectives ("Lessons worth revisiting before the retake: L3 · …") instead of the LO texts (whose Bloom verbs are imperative by convention) — `loById` import dropped.
- `lib/lesson-plan.ts` (voice-only; no answers, keys, or structure changed): "Run the same editor twice and you get…" → "Running the same editor twice yields…"; "Notice the shape:" → "The shape is consistent:"; "the simulator lets you attempt" → "these moves can be attempted"; "Try to dispatch… and the simulator refuses" → "Dispatching… is refused"; two "Select all that apply." stem tails dropped (the multi-select hint covers it); order stem → "The steps of a context switch…, in order:"; EXP blurb and the four challenge descs made declarative.
- `components/analytics-dashboard.tsx`: empty state → "records appear once a lesson is worked through, and a synthetic cohort can be generated…".

**Files:** `app/page.tsx`, `components/lessons.tsx`, `lib/lesson-plan.ts`, `components/analytics-dashboard.tsx`, `CLAUDE.md`, `CHANGES.md`

**Commit:**
```
copy: concise declarative tab tooltips; imperative-voice sweep

Re-apply the project's declarative-voice rule to the pedagogy layer:
tab tooltips shortened, session-gate and lesson-flow copy converted
from imperative/second-person to declarative, quiz stems and lesson
prose de-imperativized (voice only), failed-mastery view lists lessons
to revisit instead of imperative LO texts. Rule + exemptions (button
labels, guided-step directives) documented in CLAUDE.md.
```

## Round 19 — Entry-gate chip legibility (tinted inactive chips)

**Rationale.** User flag: white 10px text inside the gate's life-cycle chips washes out on bright screens — `opacity-35` dimmed background *and* text together on inactive chips. Of three offered options (tinted dark-on-light, outline, all-solid-with-ring) the user chose tinted.

**Key diffs.**
- `app/page.tsx` `ENTRY_STRIP`: each state gains a `tint` class (`bg-slate-100 text-slate-700`, `bg-sky-100 text-sky-800`, …matching the app's badge pattern). Inactive chips render the tint (dark text on light fill, no opacity); only the active **New** chip stays solid with white text + pulse.

**Files:** `app/page.tsx`, `CHANGES.md`

**Commit:**
```
fix: readable inactive chips on the session gate

Replace whole-chip opacity dimming (which washed out the white labels)
with badge-style tints - light state-colour fill, dark state-colour
text - keeping only the active New chip solid white-on-colour.
```

## Round 20 — Restore the Round-15 tone on the session gate

**Rationale.** The Round-18 declarative sweep flattened the entry gate's copy, but its second-person process-admission voice ("right now *you* are the newest process on this machine") is the page's point and was explicitly liked. User request: keep the fun tone there.

**Key diffs.**
- `app/page.tsx` `SessionEntry`: Round-15 copy restored — "↑ you are here", "right now *you* are the newest process… Name yours to join the Ready queue", "Your name is attached…", placeholder "Name your process…", "Not you? Edit the name above before continuing." Round-19 tinted-chip legibility styling is kept.
- `CLAUDE.md` copy-voice rule: the session gate added as a third documented exemption so future voice sweeps don't de-personalize it again.

**Files:** `app/page.tsx`, `CLAUDE.md`, `CHANGES.md`

**Commit:**
```
copy: restore the playful admission voice on the session gate

Bring back the Round-15 second-person copy on SessionEntry and add the
gate as a documented exemption to the declarative-voice rule, keeping
the Round-19 tinted-chip legibility fix.
```

## Round 21 — Remove Scenario 0 (tutorial)

**Rationale.** User request: remove Scenario 0 from the Guided Scenarios tab.

**Key diffs.**
- `components/guided-scenarios.tsx`: deleted the `s0-tutorial` entry (`GUIDED_SCENARIOS` array) in full — its 11 steps (`s0-intro` through `s0-summary`). No other file referenced `s0-tutorial` or any `s0-*` step id, so removal is clean. `GUIDED_SCENARIOS.length` reads (progress counter, next/previous-scenario navigation, "of N scenarios completed") are all dynamic and now reflect 9 scenarios instead of 10 automatically.
- `lib/scenario-engine.ts`'s separate `PREDEFINED_SCENARIOS` (used by the Evaluation tab) is unrelated and untouched.

**Files:** `components/guided-scenarios.tsx`, `CHANGES.md`

**Commit:**
```
feat: remove the Scenario 0 tutorial from Guided Scenarios

Delete the s0-tutorial entry and its 11 steps entirely; no other file
referenced it. Scenario counts and next/previous navigation are
derived from GUIDED_SCENARIOS.length, so they adjust automatically.
```
