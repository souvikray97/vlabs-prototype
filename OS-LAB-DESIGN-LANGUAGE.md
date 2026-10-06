# OS Lab — Design Language & Experiment Conversion Guide

**Purpose.** Process Life Cycle Management (PLM) is the finalized reference experiment of the OS Virtual Lab. Every other OS experiment (Context Switching, Non-Preemptive Scheduling, Bounded Buffer, Peterson's Solution, Banker's Algorithm, Dining Philosophers) is converted to the same design. A learner moving between experiments should see the same shell, the same pedagogy flow, the same components and the same look. **Only the experiment's content and internals change.**

**How to use this file.** When given an experiment path plus this file, read this file fully, then read the PLM source named in §9, then convert the target experiment. Do not redesign anything listed under "Fixed". Anything listed under "Varies" is where the new experiment's own content goes.

**Reference sources** (all under `/home/vlabs/Apex/Work/Docs/Vlabs_Technical_design/`):

| What | Where |
|---|---|
| Design docs D1–D5 (rationale, content model, build, demo) | `Vlabs_Technical_design/D1…D5-*.docx` (older drafts in `v1/`, `v2/`: ignore) |
| The finished PLM app (the template) | `Vlabs_Technical_design/Deliverable-5-Prototype-Process-life-cycle-exp/Process-life-cycle-exp/` |
| PLM maintainer guide (architecture, conventions) | `…/Process-life-cycle-exp/CLAUDE.md` |
| PLM change log (why every design decision was made, Rounds 1–21) | `…/Process-life-cycle-exp/CHANGES.md` |
| UI critique that drove the visual rules | `…/Process-life-cycle-exp/REFACTORING-UI-REVIEW.md` |

The code is the source of truth where this file and the code disagree. Read the PLM file, then update this guide.

---

## 1. Fixed vs. varies

| Fixed (identical in every experiment) | Varies (per experiment) |
|---|---|
| App shell: header, five tabs, tab order, tooltips style, Reset All, shortcuts dialog | Header title; tab tooltip wording |
| Session-entry gate (name capture before anything records) | Its theming copy/chips (each experiment's core metaphor, see §4.2) |
| Pedagogy engine: `lesson-progress.ts`, `learning-records.ts`, player components, quiz engine, analytics dashboard code | `lib/lesson-plan.ts` content only |
| Course shape: lessons → experiment → mastery check; guided / partial / open path modes | Number of lessons, their titles, tasks, quiz items |
| Record schema `{timestamp, user, action, object, metadata}` and action vocabulary | The domain objects/ids inside records (`course:<id>`, item ids, refusal reasons) |
| Visual tokens: colours, type scale, buttons, borders, shadows, spacing | The domain colours (the equivalent of PLM's process-state palette) |
| Copy voice rules (§6) | The words themselves |
| Experiment-area vocabulary: **Scenarios**, **Sandbox**, **Evaluation** | What the simulator draws and does |

---

## 2. Tech stack and project skeleton (match PLM exactly)

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 (`@import "tailwindcss"`, `@theme inline`) · shadcn/ui primitives in `components/ui/` (never hand-edit; generated) · `lucide-react` icons · Geist Sans/Mono via `geist` · `@vercel/analytics`. Package manager **pnpm**. Path alias `@/` = repo root.

PLM skeleton to reproduce:

```
app/layout.tsx            Geist fonts, metadata title "<Experiment> - OS Virtual Lab", <Analytics/>
app/page.tsx              the app shell (header + gate + 5 tabs)
app/globals.css           tokens + shared type classes + tour animations (copy PLM's, §3)
components/lessons.tsx    Lessons tab (syllabus map, lesson player, mastery check, path-mode selector)
components/analytics-dashboard.tsx
components/guided-scenarios.tsx     Scenarios tab
components/<experiment>-simulation.tsx   Sandbox tab (the only truly experiment-specific UI)
components/scenario-evaluation.tsx  Evaluation tab
components/keyboard-shortcuts-dialog.tsx
lib/lesson-plan.ts        ← the experiment's course, as pure data
lib/lesson-progress.ts    lockState(), unlock tracking, experiment sync
lib/learning-records.ts   record(), learner identity, path mode, export
lib/<experiment>-engine.ts   the simulation engine (pure, no side effects)
lib/scenario-engine.ts    timed/scored evaluation wrapper
lib/export-utils.ts       CSV/JSON helpers
hooks/use-keyboard-shortcuts.ts, use-persistence.ts, use-mobile.ts, use-toast.ts
CLAUDE.md, CHANGES.md     maintained per round (see §8)
```

Keep `next.config.mjs` as PLM's (`ignoreBuildErrors: true`). PLM pins `pnpm dev` to `--webpack` because Turbopack dev OOMs on Next 16.2.0 / Node 26; carry that over if the same machine is used.

---

## 3. Visual system (tokens: copy, do not reinvent)

Copy `app/globals.css` from PLM and `components/ui/button.tsx`. The rules behind them:

**Colour**
- Chrome is **greyscale** (`--primary` is near-black). Do not use `--primary` for accents.
- Accent colours are the **domain-state palette**: in PLM sky = Ready, green = CPU/Running, yellow/amber = I/O Wait, red = Terminated, slate = New. **One meaning per colour**: a state hue is never reused as chrome (PLM Round 3: difficulty badges were moved to a neutral slate ramp for this reason). Each new experiment defines its own small palette (e.g. Banker's: safe = green, unsafe/denied = red, waiting = yellow, available/neutral = sky), mapped once in a constant like PLM's `STATE_CHIP_COLORS` and reused by the diagram, chips, quiz chips and entry gate.
- Pedagogy-surface colours: node-kind icons lesson = sky `BookOpen`, experiment = green `FlaskConical`, assessment = amber `GraduationCap`; amber key-fact callout; sky quiz selection/progress; banded first-attempt % colouring; record-stream verbs coloured by outcome (green progress, red friction, amber caution). Restraint rule: colour limited to icons, numbers and thin accents. Fully tinted panels were rejected as "too colourful".
- Text on tinted panels uses a darker shade of the panel's own hue (`text-green-700` on `bg-green-50`), never grey. Yellow buttons use dark text (`text-yellow-950`) for WCAG.
- Active tab: `bg-white text-black border border-blue-300 shadow-sm`. Inactive: `bg-gray-400/60 text-gray-800 hover:bg-gray-400` on a `bg-gray-300` bar (must stay distinguishable on bright/4K screens).

**Borders and depth**
- Few borders. One separation method per nesting level (border **or** background **or** spacing). Cards keep a border; inner boxes use `bg-gray-100`/`bg-gray-50` + padding; no dashed or nested-triple borders.
- `--border` / `--input` = `oklch(0.89 0 0)`, literal value only (never reference another token: circular `@theme` chain).
- Single light source: shadows fall straight down (x-offset 0). Cards `shadow-sm`.

**Type scale (shared classes, same role → same size/weight everywhere)**
- `.panel-title` 800 weight, text-lg → sm:text-xl
- `.subsection-title` 700, text-sm → sm:text-base
- `.item-label` 500, text-xs → sm:text-sm
- Hierarchy comes from weight + colour, not extra sizes (sizes drive tuned fixed-height layouts).
- Root font-size scales up at ≥1920 / 2560 / 3840 / 5120 / 7680px (17 → 28px) so rem-based UI stays legible on 4K+. Breakpoints `3xl 1920`, `4xl 2560`, `5xl 3840` are defined. Container max-widths step up with them (see `app/page.tsx`).

**Buttons** (`components/ui/button.tsx` variants; never scale/translate on hover, only shadow and colour transition)
`default`, `destructive`, `info` (blue; clock controls), `success` (green; the one header CTA), `ready` (sky-500, primary start/admit actions), `warning` (yellow, dark text), `outline` (`border-2 border-gray-400`), `secondary`, `ghost`, `link`. Hover shadow is a tinted straight-down shadow in the variant's own hue.

**Headings in cards.** `CardHeader` + `CardTitle` with `.panel-title` and a leading Lucide icon (match the Scenarios-tab header style). No bespoke monospace "kicker" layouts. Info ⓘ tooltip icons are `text-muted-foreground` (grey), used only where a heading is non-obvious, not on every heading.

**Layout and responsiveness**
- Container: `container mx-auto px-2 sm:px-4 max-w-7xl 2xl:max-w-[90rem] 3xl:max-w-[104rem] 4xl:max-w-[120rem] 5xl:max-w-[150rem]`.
- Phone: tabs shorten labels (`Guided`, `Sand`, `Eval`) and everything stacks in a sensible reading order (PLM sandbox: Event Requests → Processes → Valid Transitions). `max-sm:` tweaks only; `sm:*` overrides keep desktop untouched.
- Sandbox is a three-column equal-height grid at ≥ xl (Controls | Sandbox | Metrics & Log) where the shortest card sets the height and others scroll internally (PLM does this with `ResizeObserver`). Fixed-height scroll boxes (`h-32 sm:h-48`) so the page never grows as the simulation produces output. Reuse this pattern for the experiment's own panels.
- Respect `prefers-reduced-motion` on every animation.

**Interaction conventions**
- Drag-and-drop with **Pointer Events** (mouse/pen/touch), `touch-action: none`, pointer capture, drop target by `elementFromPoint` hit-test + `data-*` attribute, preview portalled to `<body>`; tap = select, keyboard equivalents exist. Use this wherever an experiment moves things between regions.
- First-run **guided tour** driven by real simulation state (not timers): `TourStep { target, message, done(state) }`, pulsing `.tour-target(-btn)`, portalled popup with auto-flipping caret, **Stop guide** in Sandbox, hidden in Scenarios. Reusable through the `externalTourCues` prop.
- Invalid action ⇒ **refuse with a written reason** (never a silent no-op) and record `attempted-invalid`.

---

## 4. Application shell (`app/page.tsx`)

### 4.1 Tabs and header
Five tabs, in this order, all through one gated `handleTabChange`:

| # | Tab | Value | Shortcut | Gated in fully-guided mode? |
|---|---|---|---|---|
| 1 | Lessons (default, entry point) | `lessons` | `Alt+4` | no |
| 2 | Scenarios | `guided-scenarios` | `Alt+2` | yes |
| 3 | Sandbox | `sandbox` | `Alt+1` | yes |
| 4 | Evaluation | `evaluation` | `Alt+3` | yes |
| 5 | Analytics | `analytics` | `Alt+5` | no |

Header: `<h1>` experiment title (e.g. "Banker's Algorithm") on the left; on the right the Keyboard-Shortcuts dialog button and an outlined **Reset All** button (`RotateCcw` icon, label hidden on phones, tooltip). `?` toggles the shortcuts dialog. Tooltips on tabs are one concise declarative sentence each, with no mention of keyboard shortcuts.

Sandbox, Scenarios and Evaluation are mounted with `forceMount` and hidden with a `hidden` class so their state survives tab switches; the embedded simulator inside Scenarios is **always** `isActiveTab={false}` and driven through a `SimulationHandle` ref (otherwise shortcuts double-register).

Persistence: `os-virtual-lab-state` (schema version 1; mismatch clears), debounced 500 ms save. Pedagogy stores are separate: `os-vlab-learning-records-v1`, `os-vlab-learner-v1`, `os-vlab-path-mode-v1`, `os-vlab-lesson-progress-v1`, and `sessionStorage` `os-vlab-session-entered-v1`.

### 4.2 Session-entry gate
Rendered **instead of** the tabs until a name is confirmed (or "Continue anonymously as Learner"). `setLearnerName()` is called exactly once, before any tab mounts, so the first record (`launched`) already carries the name. A stored non-default name pre-fills ("Continue as X" / "Not you?"); reloads skip the prompt via `sessionStorage`; Reset All clears identity and the flag. There is no name input anywhere else.

Visual: `Card` `max-w-md`, `border-t-4 border-t-sky-500`, a chip strip across the top whose **first chip pulses and carries the typed name live**, "↑ you are here" caption, title with icon, one purpose paragraph, input (sky focus ring), `variant="ready"` submit, ghost "anonymously" button. Inactive chips are tinted dark-on-light (`bg-sky-100 text-sky-800`), never dimmed by opacity.

**Per experiment:** keep the structure and the *idea*: the gate teaches the experiment's first concept by making the learner part of it. PLM: the learner is a new process admitted to Ready. For another experiment, pick the equivalent metaphor and map the chip strip to that experiment's own state sequence (e.g. Banker's: a process arriving and declaring its maximum claim; Bounded Buffer: a producer/consumer joining; etc.). The gate's second-person playful voice is a deliberate exemption from the declarative rule (§6).

### 4.3 Lock notice
When a gated tab is clicked in fully-guided mode, record `blocked` with the missing prerequisites and show an amber banner (`border-amber-200 bg-amber-50 text-amber-900`) above the tab content saying which lessons unlock it and that a less guided path is available in Lessons.

---

## 5. Pedagogy layer (D2/D3/D4 condensed)

### 5.1 Principles
P1 start from objectives · P2 progress on understanding, not completion · P3 small tasks each closed by a check · P4 guidance is a setting (guided / partial / open) · P5 every action leaves a record, analytics come from records only · P6 AI assists, teachers decide.

### 5.2 Course = one data module (`lib/lesson-plan.ts`)
Types (reuse verbatim): `QuizItem {id, lo, type: "mcq"|"multi"|"order", chips?, q, options, answer, expl}`, `LessonTask {id, title, content[], keyfact, validation{id, items[]}}`, `LessonNode {id, kind:"lesson", title, prereqs, los, blurb, minutes, tasks}`, `ExperimentNode {id:"EXP", challenges[{id,title,desc,scenarioId,lo}], …}`, `AssessmentNode {id:"ASMT", passScore, items[], …}`, `LearningObjective {id, bloom, text}`. Exports `COURSE, LOS, LESSONS, EXPERIMENT, ASSESSMENT, NODES, nodeById, loById` and the domain chip-colour map (`STATE_CHIP_COLORS`, keyed by option label).

**`COURSE`** (added in the Banker's conversion; `components/lessons.tsx` renders from it so the player carries no experiment text): `{id, title, aim, objectives[3], activities[3], graphOrder[], layout[]}`. `layout` is the syllabus, top to bottom: a node id, or `{label, ids[]}` for a fork of nodes that can be taken in either order. PLM layout: `L1, L2, {L3,L4}, EXP, ASMT`; Banker's: `L1, L2, {L3,L4}, L5, EXP, ASMT` (a diamond with a join). A converted experiment copies `lessons.tsx` from the **Banker's** repo (or PLM's with this change applied), not the pre-`COURSE` PLM version.

**Shape of every course** (PLM: L1 → L2 → {L3, L4} → EXP → ASMT; Banker's: L1 → L2 → {L3, L4} → L5 → EXP → ASMT):
- 3–5 lessons, each ~8–10 min, **2 tasks per lesson**, each task = short content (paragraphs, `**bold**` supported) + one key-fact callout + exactly one validation of 2–3 items. At least one lesson pair branches (a real dependency graph, not a chain); no cycles.
- One **experiment** node requiring the relevant lessons. Its challenges are **existing guided scenarios reused as-is** (scenario validators already check real simulator actions). PLM uses 4 challenges (normal run, exclusivity, blocking round-trip, invalid-move exploration). Remaining scenarios stay available as practice, not gates.
- One **Mastery Check**: one single-choice item per objective, no feedback until submit, pass mark = all-but-one (5 of 6 in PLM), retakes allowed and counted; failure lists the **lessons** worth revisiting (via LO traceability).
- 5–6 objectives with checkable Bloom verbs ("given X, determine Y", never "understand X").

**Hard rules**
1. Coverage: every LO measured by ≥ 2 lesson items and exactly 1 mastery item.
2. Traceability: each item names exactly one LO. An item that can't is rejected.
3. Every lesson item has an explanation (shown right or wrong). Mastery items have `expl: ""`.
4. Teach toward the simulator: use the exact state names, event names and refusal messages the build shows; lessons wrap the experiment, they don't replace it.
5. Include at least one **invalid-action** lesson task (why the model forbids it); the simulator's refusal text feeds misconception analytics.
6. Include at least one `order` item and one `multi` item per course; use `chips: true` on state-prediction items so options render as domain-coloured chips.
7. Taxonomy metadata (`los`, `bloom`, `lo`) **stays in the data and in records, and must never render in the learner-facing Lessons flow.** Cards show prerequisites on one line and `Covers: {blurb}` on another. LO codes may appear only in the instructor-facing Analytics tab.

### 5.3 Progression (identical in every experiment)
`lockState(node, mode)` → `done | open | warn | locked`:
- done → `done`; mode `open` → `open`;
- `partial` → prereqs met ? `open` : (lesson ? `open` : `warn`);
- `guided` → prereqs met ? `open` : `locked`.

Wrong answer: guided = hint + required retry (attempts counted); partial/open = retry or skip (skip recorded). Node complete when all checks passed (guided) or passed/skipped (others). `withUnlockTracking()` emits `unlocked` for every newly reachable node. `experimentGateOpen(mode)` gates Scenarios/Sandbox/Evaluation tabs in guided mode until the experiment's prerequisite lessons are done. **Recording never switches off**, including on the open path. `syncExperimentProgress(completedScenarios)` passes challenges when their scenarios complete and completes EXP when all are done, which opens the Mastery Check.

### 5.4 Lessons tab UI (`components/lessons.tsx`)
- **Course header card**: `panel-title` + icon title, an **Aim:** sentence, two plain-bordered panels **Objectives** / **Activities** (colour only on icon + item numbers: green / sky), green progress bar "Progress: N of M stages complete", and the single `variant="success"` **Continue** button (the only green button in the tab).
- **Syllabus graph**: one vertical flow of expandable `SyllabusNode` cards joined by plain `div` connectors (`VBar`, labelled fork bar "L3 & L4 · either order"). **No SVG edges** (expand-triggered reflow burned the project). Collapsed card = status pill, requires-line, `Covers:` blurb, progress fraction; expanded lists task titles with ✓/▸/○ (lesson), challenges with ✓ from completed scenarios (experiment), meta only for assessment (never its questions). Locked nodes are expandable read-only. Card Start/Continue buttons use `variant="ready"`. Expanding **emits no records**; entering a node does.
- `upNext()`: in-progress lesson → "Continue"; else first open/warn not-done node in graph order → "Start"; else "Course complete". Header button and the auto-expanded node both use it.
- **Lesson player**: task rail, content, key-fact callout, the validation. Correct → explanation + Continue. Mastery check: items shown without feedback, then pass/fail view.
- **Path-mode selector** (guided / partial / open) lives in this tab only.
- The experiment card deep-links into Scenarios via `onNavigate`.

### 5.5 Quiz engine
Single choice (with optional domain-coloured chips), multi-select ("more than one option may apply" hint), ordering (click steps into sequence). Exact-match grading. Every submission records `answered` with LO, correctness, attempt number, response; first attempt flagged. Task completes on its last item; lesson on its last task, recording duration and first-try tally.

### 5.6 Records and analytics
Record: `{timestamp, user:{id,name}, action, object:{type,id,name}, metadata}` (maps 1:1 to xAPI). Actions: `launched, started, viewed, answered, skipped, completed, unlocked, blocked, warned, attempted-invalid, passed, failed, mode-changed, exported` (+ `generated-cohort`). Planned: `transitioned` (every valid simulator move). Metadata is stamped with path mode. Stores are versioned localStorage, capped at 8000 records, with live subscription hooks.

**Misconception bridge (mandatory in every simulator):** every refused move/action in the Sandbox *and* in a scenario's embedded simulator calls `record("attempted-invalid", {type:"simulator"…}, {reason})` with the engine's own refusal text. In PLM this is three lines in the `showAlert` helper for `type === "error"`.

**Analytics tab** is computed from records and *nothing else*: progression funnel with per-stage drop-off (stages mirror the course map), hardest checks (first-attempt correctness), misconception signals (refusal reasons), median time per node, filterable record stream, JSON export, and a labelled **synthetic-cohort generator** (25 learners: completers, steady, strugglers, dropouts; two built-in hard items; `metadata.synthetic: true`; one-click clear). Instructor-facing, so LO codes are allowed here. The component is generic: only `ALL_ITEMS`, the node list and the `SYN_REASONS` refusal strings are experiment-specific. Update those three when converting.

---

## 6. Copy voice (project-wide rule)

All learner-facing copy is **declarative**: it states what a feature is or what can be done.
- No imperatives ("Complete L3 to unlock…" → "…unlocks once L3 is complete").
- No second-person promises ("you will learn…", "What you'll learn" → "Objectives").
- Tooltips are concise (one sentence).
- **Exemptions only:** (1) action labels on buttons/CTAs ("Start", "Check answer", "Admit “X” to the Ready queue"); (2) guided-scenario step directives (`instruction`, `instructionBullets`, tour cue text: literal directions for a required action); (3) the session-entry gate's playful second-person voice.
- Scenario/evaluation page headings need no subtitle sentences. Remove "Learn X through…" style subtitles.
- Use the labels the learner sees on screen, not the engine's internal vocabulary (PLM's engine says `infant/blocked/io_done`; the UI and lessons say New/I-O Wait/I-O complete). Keep a note of the mapping for maintainers.

---

## 7. Scenarios, Sandbox, Evaluation (the three experiment tabs)

**Scenarios (`guided-scenarios.tsx`)**: ordered scenarios, beginner → advanced, each with steps:

```ts
GuidedStep { id, title, description, stepObjectives?, instruction, instructionBullets?, hint?,
             quiz?, expectedAction, validation(state)=>boolean, feedback{success,error}, …experiment-specific flags }
```
Renderer order: Step Objectives (numbered green list) → Instruction (+ numbered bullets, `**bold**` via `renderBold`) → Hint toggle → Knowledge-Check quiz → warnings → Feedback → buttons. **A step completes iff the quiz is answered correctly AND the required actions are validated against live engine state.** Until both hold the Complete Step button stays inactive; premature clicks show an alert naming exactly what is missing. Accept any valid ordering where several exist rather than one hard-coded path. Per-step tour cues are generated from `expectedAction` (`cuesForStep`). Scenarios have a list view with difficulty badges (neutral slate ramp, never state hues), progress counter, next/previous navigation, and persisted completed list. Export `SCENARIO_TITLES` and `SCENARIO_SHORTCUT_DEFS`.

**Sandbox (`<experiment>-simulation.tsx`)**: `forwardRef` exposing a `SimulationHandle` (advance, step back/revert, create/perform action, select next event, cancel selection, move-to-state). Regions: **Controls** (incl. Advance Clock with forward icon, **Revert Clock**; Current Time lives in the display, not Controls) | **Sandbox** (the visual model with lanes/regions, Event Requests + **Event Catalog** listing exactly the events the engine can emit, Valid Attempts as a coloured state/relation diagram in project colours) | **Metrics & Log** (State Presence, Action Log, Invalid Transition Attempts, State Transition History; fixed-height scroll boxes). No legend when colours already carry meaning. Engine is a pure state machine with `snapshot()/restore()` for step-back. Rule examples to keep as the pattern: refuse illegal moves with a reason; one action per clock-cycle semantics where the model requires it.

**Evaluation (`scenario-evaluation.tsx`)**: timed, scored scenarios on a `ScenarioEngine` wrapper; results persisted; exportable breakdown per attempt; distinct icon from Instructions (e.g. clipboard-check); same heading size as Scenarios. Stays alongside the Mastery Check (they don't replace each other).

**Keyboard shortcuts** (same keys wherever the action exists): `Space`/`A` advance, `Z` step back, `C` create, `E` next event, `G`/`I`/`R`/`T` move actions, `Esc` deselect, `Shift+R` reset, `Enter` check & complete step, `H` hint, `B` back to list, `Alt+1–5` tabs, `?` dialog. Shortcuts are blocked while an interactive element has focus and only active on their own tab. Adapt the action letters to the experiment's verbs but keep the structure and the dialog grouping.

---

## 8. Conversion procedure for a new experiment

Given an existing experiment folder (it will typically be a v0-style app with tabs such as tutorial / guided scenarios / manual simulator / evaluation / instructions):

1. **Recon first.** List the experiment's files, its engine/logic, its simulator UI, scenarios, evaluation, tutorial text. Note what is domain logic (keep) vs. shell/UI (replace).
2. **Copy the PLM scaffold** (§2 skeleton, tokens, `ui/`, hooks, pedagogy `lib/` files unchanged, `lessons.tsx`, `analytics-dashboard.tsx`, `keyboard-shortcuts-dialog.tsx`, shell in `app/page.tsx`). Do not rewrite these. Only parameterize the experiment-specific strings.
3. **Preserve the domain engine.** Move the experiment's logic into `lib/<experiment>-engine.ts` as a pure class. Add `snapshot/restore` if step-back is needed. Do not change algorithmic behaviour.
4. **Port the simulator** into the Sandbox layout of §7, restyled to the tokens of §3, with drag/tap interaction, fixed-height scroll panels, Event/Action log, invalid-attempt panel, `SimulationHandle`, tour.
5. **Port scenarios** into the `GuidedStep` format with live-state validators and quizzes; **port evaluation** onto `ScenarioEngine`. Fold old tutorial/instruction tabs into Lessons (their content becomes lesson tasks) and the Sandbox Instructions alert. The old tutorial tab does not survive as a tab.
6. **Author `lib/lesson-plan.ts`** per §5.2: objectives → lesson graph → tasks/items → challenge↔scenario mapping → mastery items → traceability matrix. Write it as data against the experiment's real simulator vocabulary. Draft the traceability table (LO → lesson items → mastery item → challenge) in `CHANGES.md` for review.
7. **Wire the refusal bridge** (§5.6) and `syncExperimentProgress` scenario ids.
8. **Update the shell**: title, metadata, gate theming (§4.2), tab tooltips, lock-notice wording, record object ids (`course:<id>`), analytics `ALL_ITEMS` / `SYN_REASONS`.
9. **Voice sweep** (§6) and **responsive check** at phone / md / xl / 4K widths.
10. **Verify**: `pnpm exec tsc --noEmit`, `pnpm build`, `pnpm dev`, then walk the D5 demo script (§10) end to end in the browser, including a refused move appearing in Analytics.
11. **Write `CLAUDE.md` and `CHANGES.md`** for the converted project (§9).

**Surgical-change discipline** (carried from the user's global rules): change only what the conversion requires; keep domain algorithms and their tests/behaviour intact; match the PLM code style; flag (don't silently fix) unrelated problems found in the old code; ask before any schema change affecting persisted state; state assumptions and ask when a design choice has no precedent in PLM.

**Pedagogical correctness gate.** Before implementing mechanics or lessons, check them for subject-matter correctness. If a requested/legacy mechanic is wrong or misleading, implement the correct version and flag the deviation with reasoning.

---

## 9. Maintenance convention (each converted repo)

Each repo carries `CLAUDE.md` (architecture, conventions, constraints, shortcuts) and `CHANGES.md` (append `## Round N — <title>`: rationale, key diffs, **Files:**, and a **Commit:** block with a ≤72-char imperative subject + optional body). Whenever a change is made after reading the project, update both. Treat that as part of "done".

**Read these PLM files before converting** (in this order): this guide → PLM `CLAUDE.md` → `app/page.tsx` → `lib/lesson-plan.ts` (data shape) → `lib/lesson-progress.ts` → `lib/learning-records.ts` → `components/lessons.tsx` → `components/guided-scenarios.tsx` (structure only) → `components/process-scheduling-simulation.tsx` (layout/drag/tour patterns) → `app/globals.css`, `components/ui/button.tsx` → skim `CHANGES.md` Rounds 1–3 and 10–21 for rationale.

---

## 10. Definition of done (acceptance checklist)

- [ ] Shell identical to PLM: header, 5 tabs in order, gate, Reset All, shortcuts dialog, lock banner.
- [ ] Guided mode blocks the experiment tabs (clicks **and** `Alt+N`) until the prerequisite lessons are done; the block is recorded.
- [ ] Course is pure data in `lib/lesson-plan.ts`; the player/engine files contain no experiment-specific strings.
- [ ] Every LO has ≥ 2 lesson items + 1 mastery item; every item names one LO; every lesson item has an explanation; no LO/Bloom text visible to learners.
- [ ] Experiment challenges map to real guided scenarios; completing them completes EXP and opens the Mastery Check; pass mark applied; failure lists lessons to revisit.
- [ ] Every refused simulator action writes `attempted-invalid` with the engine's reason; it shows in Analytics within about a second.
- [ ] Analytics reads records only; synthetic cohort generator populates funnel, hardest checks, misconceptions.
- [ ] Tokens, type scale, buttons, borders, shadows, tab colours match PLM; domain colours follow one-meaning-per-colour.
- [ ] Copy follows §6 with exactly the three exemptions.
- [ ] Phone → 4K layouts hold; reduced-motion respected.
- [ ] `tsc --noEmit` and `pnpm build` pass; walked the demo script: start in guided mode → click Scenarios (blocked) → L1 wrong-then-right answer → complete lessons (parallel branch unlocks) → four challenge scenarios incl. forbidden moves → Mastery Check → Analytics (one live learner) → generate cohort → export JSON.
- [ ] `CLAUDE.md` + `CHANGES.md` written, with commit messages.

---

## 11. Experiment status log

Update this table as experiments are converted.

| Experiment | Status | Notes |
|---|---|---|
| Process Life Cycle (PLM) | **Done: reference/template** | Course L1→L2→{L3,L4}→EXP→ASMT; 6 LOs; 4 challenges (scenarios s1–s4); mastery 5/6 |
| Banker's Algorithm | **Done (2026-10-06)** | `/home/vlabs/Downloads/vlabs_pushed/bankersalgorithm-final`. Course L1→L2→{L3,L4}→L5→EXP→ASMT; 6 LOs; 4 challenges (s1–s4) + 2 practice scenarios; mastery 5/6; 4 scored evaluations. Engine `lib/bankers-engine.ts`. See that repo's `CHANGES.md` Round 1 (legacy defects, deviations, traceability) |
| Context Switching | Pending | |
| Non-Preemptive Scheduling | Pending | |
| Bounded Buffer | Pending | |
| Peterson's Solution | Pending | |
| Dining Philosophers | Pending | |

---

## 12. Lessons from the Banker's Algorithm conversion (read before the next one)

1. **Verify the legacy content, do not port it.** Three of the five original Banker's scenarios stated the wrong safe/unsafe verdict, the evaluation scored 100 % unconditionally, and the request check ran on stale React state. Put the algorithm in a pure `lib/<experiment>-engine.ts`, then check every number you plan to teach against it with a scratch script (`node --experimental-strip-types verify.mts` works on the engine file because it has no imports). Record the defects in `CHANGES.md`.
2. **Engine shape that worked:** a class with a typed **event log** (`SimEvent[]`), a history stack (`revert()`), `load()`, and pure helper functions; the UI never owns domain state. Scenario validators and evaluation tasks are predicates over `{view, selected, eventsSince}`, so they cannot drift from what the simulator really did. Put the refusal-reason strings in the engine module (`REFUSAL_REASONS`) and import them in both the Sandbox and the Analytics synthetic cohort.
3. **Refusal categories, not free text, are the misconception key.** Record `attempted-invalid` with `reason` = a fixed category string and `detail` = the specific message (numbers, vectors); the Analytics panel groups by `reason`. PLM's refusals were fixed strings by accident; numeric domains must do this on purpose.
4. **Not every experiment moves things between regions.** Drag-and-drop, ResizeObserver equal-height columns and the portalled tour popup were skipped for Banker's (see its `CHANGES.md`); the tour became an inline callout. Document each skipped pattern in the experiment's `CHANGES.md` and keep the *behaviour* (cue advances only on real state, Stop guide in Sandbox only).
5. **Embedded simulator layout.** In Scenarios/Evaluation the simulator sits in a ~60 % column, so use a two-region layout there (Controls + Sandbox, Metrics & Log below) and keep the three-column layout for the Sandbox tab (`source` prop).
6. **Grid tracks.** A bare `grid` on mobile widens to the widest table's min-content and clips controls. Use `grid-cols-[minmax(0,1fr)]` as the base track on every parent that holds a wide table.
7. **Latent PLM bugs fixed in the Banker's copy (backport to PLM):** (a) `analytics-dashboard.tsx` memoised `byUser(getRecords())` on a mutable array, so the synthetic cohort never appeared until remount; memos now depend on `useRecordsVersion()`. (b) `STATE_CHIP_COLORS` is domain-specific: never leave PLM's state names in a copied `lesson-plan.ts`. (c) `CLAUDE.md` in PLM says persistence schema version 1; `hooks/use-persistence.ts` uses 2.
8. **Tooling gotchas.** `pnpm dev` fails with `ERR_PNPM_IGNORED_BUILDS` until `pnpm-workspace.yaml` has `allowBuilds: sharp: false`. `geist` must be added (`pnpm add geist`). Controlled number inputs: show `value || ""` with `placeholder="0"` and select-on-focus, otherwise typing produces `00`.
9. **Browser-level check that worked here.** `selenium-webdriver` (npm, installed in a scratch dir) + `/snap/bin/geckodriver` + headless Firefox; drive the real UI, take screenshots, and read them. Helpers: visible-only clicks (the forceMounted hidden tabs contain duplicate buttons), `getText()` returns CSS-uppercased text, type into controlled inputs with small sleeps. Run it before calling a conversion done: it found the stale-memo bug, the phone-width clipping and a squeezed embedded simulator that `tsc` and `next build` could not.
10. **Lesson authoring tips.** Scramble `order` options so the answer is not `[0,1,2,3]`; include one `multi` and one `order` item; make outcome chips (`chips: true`) the options for classification items; keep mastery items fresh numbers (not the lesson examples) and state every lesson example numerically so the learner can re-derive it in the Sandbox.
