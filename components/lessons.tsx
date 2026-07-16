"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  FlaskConical,
  GraduationCap,
  Lock,
  Play,
  RotateCcw,
  Target,
  Unlock,
} from "lucide-react"
import {
  ASSESSMENT,
  EXPERIMENT,
  LESSONS,
  STATE_CHIP_COLORS,
  nodeById,
  type CourseNode,
  type LessonNode,
  type QuizItem,
} from "@/lib/lesson-plan"
import { SCENARIO_TITLES } from "@/components/guided-scenarios"
import {
  record,
  usePathMode,
  setPathMode,
  type PathMode,
} from "@/lib/learning-records"
import {
  getProgress,
  updateProgress,
  lockState,
  missingPrereqs,
  useProgressVersion,
  withUnlockTracking,
} from "@/lib/lesson-progress"

/* ── helpers ─────────────────────────────────────────────────── */

function Bold({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-foreground">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

function StateChip({ label }: { label: string }) {
  const color = STATE_CHIP_COLORS[label]
  if (!color) return <span>{label}</span>
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-mono font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  )
}

interface ItemUiState {
  sel: number[]
  order: number[]
  feedback: { ok: boolean; text: string } | null
  attempts: number
}
const freshUi = (): ItemUiState => ({ sel: [], order: [], feedback: null, attempts: 0 })

function gradeItem(item: QuizItem, ui: ItemUiState): boolean {
  if (item.type === "mcq") return ui.sel[0] === item.answer
  if (item.type === "multi") {
    const a = [...(item.answer as number[])].sort().join(",")
    return [...ui.sel].sort((x, y) => x - y).join(",") === a
  }
  return ui.order.join(",") === (item.answer as number[]).join(",")
}

/* ── validation item renderer (shared by lessons & assessment) ─ */

function ItemBody({
  item,
  ui,
  setUi,
  locked,
}: {
  item: QuizItem
  ui: ItemUiState
  setUi: (u: ItemUiState) => void
  locked: boolean
}) {
  if (item.type === "order") {
    return (
      <div className="max-w-2xl">
        <div className="mb-2 flex min-h-11 flex-wrap items-center gap-2 rounded-lg border-2 border-dashed border-border p-2">
          {ui.order.length === 0 ? (
            <span className="px-1 font-mono text-xs text-muted-foreground">
              the steps below appear here in the order selected…
            </span>
          ) : (
            ui.order.map((idx, pos) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-500/5 px-3 py-1 text-sm"
              >
                <span className="font-mono text-xs font-semibold text-sky-600">{pos + 1}</span>
                {item.options[idx]}
              </span>
            ))
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {item.options.map((o, i) => (
            <button
              key={i}
              type="button"
              disabled={locked || ui.order.includes(i)}
              onClick={() => setUi({ ...ui, order: [...ui.order, i], feedback: null })}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-sky-400 disabled:pointer-events-none disabled:opacity-35"
            >
              {o}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 h-7 text-xs"
          disabled={locked || ui.order.length === 0}
          onClick={() => setUi({ ...ui, order: [], feedback: null })}
        >
          Clear
        </Button>
      </div>
    )
  }

  const multi = item.type === "multi"
  const toggle = (i: number) => {
    if (locked) return
    const sel = multi ? (ui.sel.includes(i) ? ui.sel.filter((x) => x !== i) : [...ui.sel, i]) : [i]
    setUi({ ...ui, sel, feedback: null })
  }
  return (
    <div className="max-w-2xl space-y-2">
      {item.options.map((o, i) => {
        const selected = ui.sel.includes(i)
        return (
          <button
            key={i}
            type="button"
            role={multi ? "checkbox" : "radio"}
            aria-checked={selected}
            disabled={locked}
            onClick={() => toggle(i)}
            className={`flex w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${
              selected ? "border-sky-500 bg-sky-500/10" : "border-border bg-card hover:border-sky-400"
            } disabled:pointer-events-none`}
          >
            <span
              className={`h-4 w-4 shrink-0 border-2 ${multi ? "rounded" : "rounded-full"} ${
                selected ? "border-sky-500 bg-sky-500" : "border-muted-foreground/40"
              }`}
            />
            {item.chips ? <StateChip label={o} /> : <span>{o}</span>}
          </button>
        )
      })}
      {multi && (
        <p className="font-mono text-xs text-muted-foreground">more than one option may apply</p>
      )}
    </div>
  )
}

/* ── syllabus graph pieces ───────────────────────────────────── */

type LockUi = "done" | "open" | "warn" | "locked"

/** Vertical connector segment between graph nodes. */
function VBar() {
  return <div className="mx-auto h-5 w-0.5 bg-border" aria-hidden />
}

function statePill(state: LockUi) {
  return state === "done" ? (
    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">completed</Badge>
  ) : state === "locked" ? (
    <Badge variant="secondary" className="gap-1">
      <Lock className="h-3 w-3" /> locked
    </Badge>
  ) : state === "warn" ? (
    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">prereqs pending</Badge>
  ) : (
    <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">available</Badge>
  )
}

/** One task/challenge row inside an expanded node. Non-interactive by design. */
function SubItem({ state, label, meta }: { state: "ok" | "now" | "todo"; label: string; meta?: string }) {
  return (
    <div className="flex items-start gap-2 py-1 text-sm">
      {state === "ok" ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
      ) : state === "now" ? (
        <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
      )}
      <span className={state === "todo" ? "text-muted-foreground" : ""}>{label}</span>
      {meta && <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-muted-foreground">{meta}</span>}
    </div>
  )
}

function SyllabusNode({
  id,
  kind,
  title,
  prereqs,
  blurb,
  state,
  fraction,
  actionLabel,
  expanded,
  onToggle,
  onAction,
  children,
}: {
  id: string
  kind: string
  title: string
  prereqs: string[]
  blurb: string
  state: LockUi
  fraction: string | null
  actionLabel: string
  expanded: boolean
  onToggle: () => void
  onAction: () => void
  children: ReactNode
}) {
  const locked = state === "locked"
  // Kind accents reuse the lab's process-state palette (sky/green/amber).
  const kindIcon =
    kind === "lesson" ? (
      <BookOpen className="h-3.5 w-3.5 text-sky-600" />
    ) : kind === "experiment" ? (
      <FlaskConical className="h-3.5 w-3.5 text-green-600" />
    ) : (
      <GraduationCap className="h-3.5 w-3.5 text-amber-600" />
    )
  return (
    <Card
      className={`flex h-full flex-col p-0 transition-shadow ${state === "done" ? "border-green-200 bg-green-50/40 dark:bg-green-950/20" : ""}`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())}
        className="cursor-pointer rounded-t-lg p-4 hover:bg-muted/40"
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {kindIcon}
            {id} · {kind}
          </span>
          <div className="flex items-center gap-2">
            {fraction && <span className="font-mono text-[11px] text-muted-foreground">{fraction}</span>}
            {statePill(state)}
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
              aria-hidden
            />
          </div>
        </div>
        <h3 className={`text-base font-bold ${locked ? "text-muted-foreground" : ""}`}>{title}</h3>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {prereqs.length ? `requires ${prereqs.join(" + ")}` : "no prerequisites"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Covers: {blurb}</p>
      </div>

      {expanded && (
        <div className={`border-t border-dashed border-border px-4 py-3 ${locked ? "opacity-60" : ""}`}>
          {children}
        </div>
      )}

      <div className="mt-auto px-4 pb-4">
        <Button
          size="sm"
          variant={state === "done" ? "outline" : "ready"}
          onClick={onAction}
          className={locked ? "opacity-50" : ""}
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          {actionLabel}
        </Button>
      </div>
    </Card>
  )
}

/* ── main component ──────────────────────────────────────────── */

let launchedThisSession = false

export function LessonsTab({
  completedScenarios,
  onNavigate,
}: {
  completedScenarios: string[]
  onNavigate: (tab: string) => void
}) {
  const mode = usePathMode()
  useProgressVersion()
  const [route, setRoute] = useState<{ view: "map" | "lesson" | "asmt"; lessonId?: string }>({
    view: "map",
  })
  const [ui, setUi] = useState<ItemUiState>(freshUi())
  const [notice, setNotice] = useState<string | null>(null)
  const [openNodes, setOpenNodes] = useState<Set<string>>(new Set())
  const didInitOpen = useRef(false)
  const [asmt, setAsmt] = useState<{ idx: number; answers: Record<string, boolean>; attempt: number; finished: boolean; lastScore: number }>({ idx: 0, answers: {}, attempt: 1, finished: false, lastScore: 0 })

  useEffect(() => {
    if (!launchedThisSession) {
      launchedThisSession = true
      record("launched", { type: "course", id: "plm", name: "Process Life Cycle" }, {})
    }
  }, [])

  // Auto-expand the "up next" node once on mount (client-only, so real progress
  // from localStorage is already loaded). Expanding is purely presentational.
  useEffect(() => {
    if (didInitOpen.current) return
    didInitOpen.current = true
    const n = upNext()
    if (n) setOpenNodes(new Set([n.node.id]))
  }, [])

  const toggleNode = (id: string) =>
    setOpenNodes((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  const openNode = (
    node: { id: string; kind: string; title: string; prereqs: string[] },
    go: () => void,
  ) => {
    const state = lockState(node as any, mode)
    if (state === "locked") {
      record(
        "blocked",
        { type: node.kind, id: node.id, name: node.title },
        { missing: missingPrereqs(node as any).join("+") },
      )
      setNotice(
        `${node.id} is locked in guided mode — it unlocks once ${missingPrereqs(node as any).join(" and ")} ${missingPrereqs(node as any).length > 1 ? "are" : "is"} complete.`,
      )
      return
    }
    if (state === "warn") {
      record(
        "warned",
        { type: node.kind, id: node.id, name: node.title },
        { missing: missingPrereqs(node as any).join("+") },
      )
      if (
        !window.confirm(
          `Recommended prerequisites (${missingPrereqs(node as any).join(", ")}) are incomplete. Continue anyway? This choice is recorded.`,
        )
      )
        return
    }
    const p = getProgress(node.id)
    if (!p.startedAt) {
      updateProgress(node.id, { startedAt: Date.now() })
      record("started", { type: node.kind, id: node.id, name: node.title }, {})
    } else {
      record("viewed", { type: node.kind, id: node.id, name: node.title }, {})
    }
    go()
  }

  /* Enter a node through the gated openNode path, dispatching by kind. */
  const enterNode = (node: CourseNode) => {
    if (node.kind === "experiment") {
      openNode(node, () => {
        setNotice("Experiment opened in the Scenarios tab — its challenges are passed by completing the four listed scenarios.")
        onNavigate("guided-scenarios")
      })
    } else if (node.kind === "assessment") {
      openNode(node, () => {
        setUi(freshUi())
        setAsmt({ idx: 0, answers: {}, attempt: getProgress("ASMT").attempt ?? 1, finished: false, lastScore: 0 })
        setRoute({ view: "asmt" })
      })
    } else {
      openNode(node, () => {
        setUi(freshUi())
        setRoute({ view: "lesson", lessonId: node.id })
      })
    }
  }

  // The learner's next actionable step — drives both the header Continue button
  // and the auto-expanded node, so they always agree.
  const GRAPH_ORDER = ["L1", "L2", "L3", "L4", "EXP", "ASMT"]
  const upNext = (): { node: CourseNode; verb: "Start" | "Continue" } | null => {
    for (const l of LESSONS) {
      const p = getProgress(l.id)
      if (p.startedAt && !p.done) return { node: l, verb: "Continue" }
    }
    for (const id of GRAPH_ORDER) {
      const node = nodeById(id)
      if (!node || getProgress(id).done) continue
      const st = lockState(node, mode)
      if (st === "open" || st === "warn") {
        return { node, verb: getProgress(id).startedAt ? "Continue" : "Start" }
      }
    }
    return null
  }

  /* ── lesson flow handlers ── */
  const lesson = route.lessonId ? (LESSONS.find((l) => l.id === route.lessonId) as LessonNode) : null
  const lp = lesson ? getProgress(lesson.id) : null
  const task = lesson && lp ? lesson.tasks[Math.min(lp.taskIdx, lesson.tasks.length - 1)] : null
  const item = task && lp ? task.validation.items[Math.min(lp.itemIdx, task.validation.items.length - 1)] : null

  const submitLessonItem = () => {
    if (!lesson || !lp || !task || !item) return
    const ok = gradeItem(item, ui)
    const attempts = ui.attempts + 1
    const res = lp.results[item.id] ?? { attempts: 0, firstTry: false }
    if (res.attempts === 0) res.firstTry = ok
    res.attempts += 1
    lp.results[item.id] = res
    updateProgress(lesson.id, { results: lp.results })
    record(
      "answered",
      { type: "validation-item", id: item.id, name: task.validation.id },
      {
        lo: item.lo,
        correct: ok,
        attempt: attempts,
        response: item.type === "order" ? ui.order.join(">") : ui.sel.join("+"),
      },
    )
    setUi({
      ...ui,
      attempts,
      feedback: ok
        ? { ok: true, text: item.expl }
        : {
            ok: false,
            text:
              (mode === "guided" ? "Not quite. Hint: " : "Not quite. ") +
              item.expl.split(".")[0] +
              ".",
          },
    })
  }

  const advanceLessonItem = (skipped = false) => {
    if (!lesson || !lp || !task || !item) return
    if (skipped) {
      record("skipped", { type: "validation-item", id: item.id, name: task.validation.id }, { lo: item.lo })
    }
    setUi(freshUi())
    if (lp.itemIdx < task.validation.items.length - 1) {
      updateProgress(lesson.id, { itemIdx: lp.itemIdx + 1 })
      return
    }
    record("completed", { type: "task", id: task.id, name: task.title }, { validation: task.validation.id })
    if (lp.taskIdx < lesson.tasks.length - 1) {
      updateProgress(lesson.id, { taskIdx: lp.taskIdx + 1, itemIdx: 0 })
      return
    }
    // lesson complete
    const items = lesson.tasks.flatMap((t) => t.validation.items)
    const firstTry = items.filter((it) => lp.results[it.id]?.firstTry).length
    withUnlockTracking(() => {
      updateProgress(lesson.id, {
        done: true,
        doneAt: Date.now(),
        firstTry,
        itemsTotal: items.length,
      })
      record(
        "completed",
        { type: "lesson", id: lesson.id, name: lesson.title },
        {
          durationMs: lp.startedAt ? Date.now() - lp.startedAt : undefined,
          firstTryCorrect: firstTry,
          items: items.length,
        },
      )
    })
    setNotice(`${lesson.id} completed — ${firstTry}/${items.length} first-try correct. New paths may have unlocked.`)
    setRoute({ view: "map" })
  }

  /* ── assessment handlers ── */
  const answerAsmt = () => {
    const q = ASSESSMENT.items[asmt.idx]
    const ok = ui.sel[0] === q.answer
    const answers = { ...asmt.answers, [q.id]: ok }
    record(
      "answered",
      { type: "assessment-item", id: q.id, name: "ASMT" },
      { lo: q.lo, correct: ok, attempt: asmt.attempt },
    )
    setUi(freshUi())
    if (asmt.idx < ASSESSMENT.items.length - 1) {
      setAsmt({ ...asmt, idx: asmt.idx + 1, answers })
      return
    }
    const score = Object.values(answers).filter(Boolean).length
    if (score >= ASSESSMENT.passScore) {
      withUnlockTracking(() => {
        updateProgress("ASMT", { done: true, doneAt: Date.now(), score, attempt: asmt.attempt })
        record(
          "passed",
          { type: "assessment", id: "ASMT", name: ASSESSMENT.title },
          { score, of: ASSESSMENT.items.length, attempt: asmt.attempt },
        )
        record("completed", { type: "course", id: "plm", name: "Process Life Cycle" }, {})
      })
    } else {
      record(
        "failed",
        { type: "assessment", id: "ASMT", name: ASSESSMENT.title },
        { score, of: ASSESSMENT.items.length, attempt: asmt.attempt },
      )
    }
    setAsmt({ ...asmt, answers, finished: true, lastScore: score })
  }

  /* ═══════════ render ═══════════ */

  const modeBtn = (m: PathMode, label: string, hint: string) => (
    <button
      key={m}
      type="button"
      onClick={() => setPathMode(m)}
      title={hint}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        mode === m ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70"
      }`}
    >
      {label}
    </button>
  )

  const modePills = (
    <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
      {modeBtn("guided", "Fully guided", "Prerequisites and validations enforced")}
      {modeBtn("partial", "Partially guided", "Recommended path; gates become recorded warnings")}
      {modeBtn("open", "Open", "Everything unlocked; telemetry continues")}
    </div>
  )

  // Simple header for the lesson/assessment sub-views.
  const header = (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h2 className="panel-title mr-auto flex items-center gap-2">
        <GraduationCap className="h-5 w-5" />
        Process Life Cycle — Course
      </h2>
      {modePills}
    </div>
  )

  const noticeBar = notice && (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      {notice}
    </div>
  )

  /* ── SYLLABUS GRAPH (course overview) ── */
  if (route.view === "map") {
    const stagesDone = GRAPH_ORDER.filter((id) => getProgress(id).done).length
    const anyStarted = GRAPH_ORDER.some((id) => {
      const p = getProgress(id)
      return p.startedAt || p.done
    })
    const next = upNext()

    const actionLabelFor = (id: string) => {
      const p = getProgress(id)
      return p.done ? "Review" : p.startedAt ? "Continue" : "Start"
    }

    const lessonNode = (l: LessonNode) => {
      const p = getProgress(l.id)
      const total = l.tasks.reduce((a, t) => a + t.validation.items.length, 0)
      const fraction = p.done
        ? `${total} of ${total} · first-try ${p.firstTry}/${p.itemsTotal}`
        : `${Object.keys(p.results).length} of ${total} checks`
      return (
        <SyllabusNode
          key={l.id}
          id={l.id}
          kind="lesson"
          title={l.title}
          prereqs={l.prereqs}
          blurb={l.blurb}
          state={lockState(l, mode)}
          fraction={fraction}
          actionLabel={actionLabelFor(l.id)}
          expanded={openNodes.has(l.id)}
          onToggle={() => toggleNode(l.id)}
          onAction={() => enterNode(l)}
        >
          <div className="space-y-0.5">
            {l.tasks.map((t, i) => {
              const st = p.done || i < p.taskIdx ? "ok" : p.startedAt && i === p.taskIdx ? "now" : "todo"
              const n = t.validation.items.length
              return <SubItem key={t.id} state={st} label={t.title} meta={`${n} check${n > 1 ? "s" : ""}`} />
            })}
          </div>
        </SyllabusNode>
      )
    }

    const expDone = EXPERIMENT.challenges.filter((c) => completedScenarios.includes(c.scenarioId)).length
    const expNode = (
      <SyllabusNode
        id="EXP"
        kind="experiment"
        title={EXPERIMENT.title}
        prereqs={EXPERIMENT.prereqs}
        blurb={EXPERIMENT.blurb}
        state={lockState(EXPERIMENT, mode)}
        fraction={`${expDone} of ${EXPERIMENT.challenges.length} challenges`}
        actionLabel={actionLabelFor("EXP")}
        expanded={openNodes.has("EXP")}
        onToggle={() => toggleNode("EXP")}
        onAction={() => enterNode(EXPERIMENT)}
      >
        <div className="space-y-0.5">
          {EXPERIMENT.challenges.map((c) => {
            const done = completedScenarios.includes(c.scenarioId)
            return (
              <SubItem
                key={c.id}
                state={done ? "ok" : "todo"}
                label={`${c.title} — ${SCENARIO_TITLES[c.scenarioId] ?? c.scenarioId}`}
              />
            )
          })}
        </div>
      </SyllabusNode>
    )

    const ap = getProgress("ASMT")
    const asmtScored = ap.done || ap.score !== undefined
    const asmtNode = (
      <SyllabusNode
        id="ASMT"
        kind="assessment"
        title={ASSESSMENT.title}
        prereqs={ASSESSMENT.prereqs}
        blurb={ASSESSMENT.blurb}
        state={lockState(ASSESSMENT, mode)}
        fraction={asmtScored ? `best ${ap.score}/${ASSESSMENT.items.length} · attempt ${ap.attempt}` : null}
        actionLabel={actionLabelFor("ASMT")}
        expanded={openNodes.has("ASMT")}
        onToggle={() => toggleNode("ASMT")}
        onAction={() => enterNode(ASSESSMENT)}
      >
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            {ASSESSMENT.items.length} questions · one per topic · no feedback until the end · pass mark{" "}
            {ASSESSMENT.passScore}/{ASSESSMENT.items.length}
          </p>
          {asmtScored && (
            <p className="font-mono text-xs">
              Best score {ap.score}/{ASSESSMENT.items.length} · attempt {ap.attempt}
            </p>
          )}
        </div>
      </SyllabusNode>
    )

    const continueControl = next ? (
      <Button variant="success" onClick={() => enterNode(next.node)}>
        <Play className="mr-2 h-4 w-4" />
        {!anyStarted
          ? "Start course"
          : next.verb === "Continue"
            ? `Continue ${next.node.id}: ${next.node.title}`
            : `Start ${next.node.title}`}
      </Button>
    ) : (
      <Badge variant="outline" className="border-green-600 px-3 py-1.5 text-sm text-green-600">
        <CheckCircle2 className="mr-1 h-4 w-4" /> Course complete
      </Badge>
    )

    return (
      <div>
        {/* Course header: aim, objectives and progress — the lab's front page. */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <CardTitle className="panel-title flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Process Life Cycle — Course
                </CardTitle>
                <p className="text-muted-foreground">
                  <strong className="text-foreground">Aim:</strong> how an operating system manages a process
                  through its life cycle — from creation, through running and waiting, to termination — explored
                  hands-on in a live simulator.
                </p>
              </div>
              {modePills}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Target className="h-4 w-4 flex-shrink-0 text-green-600" />
                  <span className="text-sm font-semibold">Objectives</span>
                </div>
                <ul className="space-y-1">
                  {[
                    "What a process is and how the OS keeps track of it",
                    "The states a process moves through, and the events that trigger each move",
                    "Why only one process runs at a time, and how the CPU changes hands",
                  ].map((o, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-0.5 flex-shrink-0 font-semibold text-green-600">{i + 1}.</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 flex-shrink-0 text-sky-600" />
                  <span className="text-sm font-semibold">Activities</span>
                </div>
                <ul className="space-y-1">
                  {[
                    "Four short lessons, each closed by quick checks",
                    "Four hands-on simulator challenges driving real processes through the life cycle",
                    "A short mastery check at the end",
                  ].map((o, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-0.5 flex-shrink-0 font-semibold text-sky-600">{i + 1}.</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-44 flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${(stagesDone / GRAPH_ORDER.length) * 100}%` }}
                  />
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Progress: {stagesDone} of {GRAPH_ORDER.length} stages complete
                </p>
              </div>
              {continueControl}
            </div>
          </CardContent>
        </Card>
        {noticeBar}

        <div className="mx-auto max-w-2xl">
          {lessonNode(LESSONS[0])}
          <VBar />
          {lessonNode(LESSONS[1])}
          <VBar />
          {/* fork: L3 and L4 in either order */}
          <div className="flex items-center gap-2 py-1" aria-hidden>
            <div className="h-0.5 flex-1 bg-border" />
            <span className="whitespace-nowrap text-[10px] uppercase tracking-wider text-muted-foreground">
              L3 &amp; L4 · either order
            </span>
            <div className="h-0.5 flex-1 bg-border" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {lessonNode(LESSONS[2])}
            {lessonNode(LESSONS[3])}
          </div>
          {/* merge back to a single path */}
          <VBar />
          {expNode}
          <VBar />
          {asmtNode}
        </div>
      </div>
    )
  }

  /* ── LESSON VIEW ── */
  if (route.view === "lesson" && lesson && lp && task && item) {
    const canSubmit = item.type === "order" ? ui.order.length === item.options.length : ui.sel.length > 0
    const passed = ui.feedback?.ok === true
    return (
      <div>
        {header}
        {noticeBar}
        <div className="grid items-start gap-4 lg:grid-cols-[240px_1fr]">
          <Card className="p-3">
            {lesson.tasks.map((t, i) => {
              const state = i < lp.taskIdx ? "ok" : i === lp.taskIdx ? "now" : "todo"
              return (
                <div
                  key={t.id}
                  className={`flex items-start gap-2.5 rounded-md px-2 py-2 text-sm ${
                    state === "now" ? "bg-sky-500/10 font-medium" : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-mono ${
                      state === "ok"
                        ? "border-green-600 bg-green-600 text-white"
                        : state === "now"
                          ? "border-sky-600 text-sky-600"
                          : "border-border"
                    }`}
                  >
                    {state === "ok" ? "✓" : i + 1}
                  </span>
                  <span>
                    {t.title}
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {t.validation.items.length} check{t.validation.items.length > 1 ? "s" : ""}
                    </span>
                  </span>
                </div>
              )
            })}
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 gap-1 text-xs"
              onClick={() => setRoute({ view: "map" })}
            >
              <ArrowLeft className="h-3 w-3" /> Course map
            </Button>
          </Card>

          <Card className="p-5 sm:p-7">
            <p className="font-mono text-[11px] uppercase tracking-widest text-sky-600">
              {lesson.id} · task {lp.taskIdx + 1} of {lesson.tasks.length} · {task.id}
            </p>
            <h3 className="mb-3 mt-1 text-lg font-bold">{task.title}</h3>
            {task.content.map((p, i) => (
              <p key={i} className="mb-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                <Bold text={p} />
              </p>
            ))}
            <div className="my-4 max-w-3xl rounded-r-lg border-l-4 border-amber-400 bg-amber-500/10 px-4 py-2.5 text-sm">
              <Bold text={task.keyfact} />
            </div>

            <div className="mt-5 border-t border-dashed border-border pt-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded bg-sky-600 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-white">
                  Validation {task.validation.id} · item {lp.itemIdx + 1}/{task.validation.items.length}
                </span>
              </div>
              <p className="mb-3 max-w-3xl text-sm font-semibold">{item.q}</p>
              <ItemBody item={item} ui={ui} setUi={setUi} locked={passed} />

              {ui.feedback && (
                <div
                  className={`mt-4 flex max-w-2xl items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
                    ui.feedback.ok
                      ? "border-green-200 bg-green-50 text-green-900"
                      : "border-red-200 bg-red-50 text-red-900"
                  }`}
                >
                  <span className="font-mono font-bold">{ui.feedback.ok ? "✓" : "✗"}</span>
                  <span>{ui.feedback.text}</span>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {passed ? (
                  <Button onClick={() => advanceLessonItem()} className="gap-1">
                    Continue <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button onClick={submitLessonItem} disabled={!canSubmit}>
                    Check answer
                  </Button>
                )}
                {!passed && ui.feedback && mode !== "guided" && (
                  <Button variant="outline" onClick={() => advanceLessonItem(true)}>
                    Skip (recorded)
                  </Button>
                )}
                {ui.attempts > 0 && (
                  <span className="font-mono text-xs text-muted-foreground">
                    attempt {ui.attempts}
                    {mode === "guided" && !passed ? " · guided mode requires a correct answer" : ""}
                  </span>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  /* ── ASSESSMENT VIEW ── */
  if (route.view === "asmt") {
    const done = getProgress("ASMT")
    if (done.done) {
      return (
        <div>
          {header}
          <Card className="max-w-xl p-6">
            <GraduationCap className="mb-2 h-6 w-6 text-green-600" />
            <h3 className="text-lg font-bold">Mastery demonstrated</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Score {done.score}/{ASSESSMENT.items.length} (attempt {done.attempt}). Every course objective has
              been evidenced by at least one validated response.
            </p>
            <Button variant="outline" size="sm" className="mt-4 gap-1" onClick={() => setRoute({ view: "map" })}>
              <ArrowLeft className="h-3 w-3" /> Course map
            </Button>
          </Card>
        </div>
      )
    }
    if (asmt.finished) {
      const pass = asmt.lastScore >= ASSESSMENT.passScore
      const weak = [...new Set(ASSESSMENT.items.filter((q) => !asmt.answers[q.id]).map((q) => q.lo))]
      return (
        <div>
          {header}
          <Card className="max-w-xl p-6">
            <h3 className="text-lg font-bold">
              {pass ? "Passed ✓" : `Not yet — the mastery gate is ${ASSESSMENT.passScore}/${ASSESSMENT.items.length}`}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              You scored {asmt.lastScore}/{ASSESSMENT.items.length} on attempt {asmt.attempt}.
            </p>
            {!pass && (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  Lessons worth revisiting before the retake:{" "}
                  <strong>
                    {LESSONS.filter((l) => l.los.some((lo) => weak.includes(lo)))
                      .map((l) => `${l.id} · ${l.title}`)
                      .join(", ")}
                  </strong>
                </p>
                <div className="mt-4 flex gap-2">
                  <Button
                    className="gap-1"
                    onClick={() => {
                      updateProgress("ASMT", { attempt: asmt.attempt + 1 })
                      setAsmt({ idx: 0, answers: {}, attempt: asmt.attempt + 1, finished: false, lastScore: 0 })
                      setUi(freshUi())
                    }}
                  >
                    <RotateCcw className="h-4 w-4" /> Retake (attempt {asmt.attempt + 1})
                  </Button>
                  <Button variant="outline" onClick={() => setRoute({ view: "map" })}>
                    Review lessons first
                  </Button>
                </div>
              </>
            )}
            {pass && (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setRoute({ view: "map" })}>
                Back to course map
              </Button>
            )}
          </Card>
        </div>
      )
    }
    const q = ASSESSMENT.items[asmt.idx]
    return (
      <div>
        {header}
        <Card className="max-w-2xl p-5 sm:p-7">
          <p className="font-mono text-[11px] uppercase tracking-widest text-amber-600">
            Mastery check · question {asmt.idx + 1} of {ASSESSMENT.items.length} · attempt {asmt.attempt}
          </p>
          <p className="mb-4 mt-2 text-sm font-semibold">{q.q}</p>
          <ItemBody item={q} ui={ui} setUi={setUi} locked={false} />
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            No feedback until the end · pass mark {ASSESSMENT.passScore}/{ASSESSMENT.items.length}
          </p>
          <Button className="mt-4 gap-1" disabled={ui.sel.length === 0} onClick={answerAsmt}>
            {asmt.idx === ASSESSMENT.items.length - 1 ? "Submit assessment" : "Lock in & next"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Card>
      </div>
    )
  }

  /* fallback */
  return (
    <div>
      {header}
      <Card className="flex max-w-md items-center gap-3 p-5">
        <FlaskConical className="h-5 w-5 text-primary" />
        <Button variant="outline" size="sm" onClick={() => setRoute({ view: "map" })}>
          <Unlock className="mr-1 h-3 w-3" /> Open course map
        </Button>
      </Card>
    </div>
  )
}
