"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Download, Users, Trash2 } from "lucide-react"
import { ASSESSMENT, EXPERIMENT, LESSONS, NODES } from "@/lib/lesson-plan"
import {
  appendRecords,
  clearSyntheticRecords,
  exportRecordsJson,
  getRecords,
  record,
  useRecordsVersion,
  type LearningRecord,
} from "@/lib/learning-records"

/* ── analytics selectors — computed from the record stream only ── */

const STAGES: { id: string; label: string; test: (rs: LearningRecord[]) => boolean }[] = [
  { id: "start", label: "Started the course", test: (rs) => rs.some((r) => r.action === "launched") },
  ...LESSONS.map((l) => ({
    id: l.id,
    label: `${l.id} · ${l.title}`,
    test: (rs: LearningRecord[]) => rs.some((r) => r.action === "completed" && r.object.id === l.id),
  })),
  { id: "EXP", label: "Experiment complete", test: (rs) => rs.some((r) => r.action === "completed" && r.object.id === "EXP") },
  { id: "ASMT", label: "Mastery check passed", test: (rs) => rs.some((r) => r.action === "passed" && r.object.id === "ASMT") },
]

function byUser(recs: LearningRecord[]) {
  const m = new Map<string, { name: string; recs: LearningRecord[] }>()
  recs.forEach((r) => {
    if (!m.has(r.user.id)) m.set(r.user.id, { name: r.user.name, recs: [] })
    const u = m.get(r.user.id)!
    u.name = r.user.name // stream is chronological — a rename mid-session means the latest name wins
    u.recs.push(r)
  })
  return m
}

/** Colour-code record verbs by outcome: green = progress, red = friction, amber = caution. */
function actionColor(action: string): string {
  if (action === "completed" || action === "passed" || action === "unlocked") return "text-green-600"
  if (action === "failed" || action === "blocked" || action === "attempted-invalid") return "text-red-600"
  if (action === "warned" || action === "skipped") return "text-amber-600"
  return ""
}

function median(a: number[]) {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const ALL_ITEMS = [
  ...LESSONS.flatMap((l) =>
    l.tasks.flatMap((t) => t.validation.items.map((it) => ({ node: l.id, item: it }))),
  ),
  ...ASSESSMENT.items.map((it) => ({ node: "ASMT", item: it })),
]

/* ── synthetic cohort (clearly labelled) ─────────────────────── */

const SYN_NAMES = ["Asha", "Ravi", "Meera", "Kiran", "Divya", "Arjun", "Sana", "Vikram", "Neha", "Rahul", "Ishita", "Manoj", "Priya", "Aditya", "Lakshmi", "Farhan", "Tara", "Nikhil", "Anu", "Dev", "Pooja", "Sameer", "Ritu", "Varun", "Zoya"]
const SYN_REASONS = [
  "Only a running process can request I/O — it needs the CPU to issue the call.",
  "A blocked process must re-enter the ready queue; it cannot jump straight to the CPU.",
  "The CPU is occupied — dispatch refused (CPU exclusivity).",
  "Exit is an instruction executed on the CPU; a Ready process cannot terminate itself.",
]

function generateCohort() {
  const out: LearningRecord[] = []
  const now = Date.now()
  for (let u = 0; u < 25; u++) {
    const id = "syn-" + (u + 1)
    const name = SYN_NAMES[u] + " (sim)"
    const r = Math.random()
    const persona = r < 0.45 ? "completer" : r < 0.7 ? "steady" : r < 0.85 ? "struggler" : "dropout"
    const skill = persona === "completer" ? 0.9 : persona === "steady" ? 0.78 : persona === "struggler" ? 0.55 : 0.65
    const dropAt = persona === "dropout" ? ["L2", "L3", "L3", "L4", "EXP"][Math.floor(Math.random() * 5)] : persona === "struggler" && Math.random() < 0.4 ? "EXP" : null
    let t = now - (1 + Math.random() * 6) * 86400000
    const push = (action: string, object: LearningRecord["object"], metadata: Record<string, unknown> = {}) => {
      t += (20 + Math.random() * 140) * 1000
      out.push({ timestamp: new Date(t).toISOString(), user: { id, name }, action, object, metadata: { mode: "guided", synthetic: true, ...metadata } })
    }
    push("launched", { type: "course", id: "plm", name: "Process Life Cycle" })
    let alive = true
    for (const l of LESSONS) {
      if (!alive) break
      if (dropAt === l.id && Math.random() < 0.8) {
        push("started", { type: "lesson", id: l.id, name: l.title })
        alive = false
        break
      }
      const t0 = t
      push("started", { type: "lesson", id: l.id, name: l.title })
      l.tasks.forEach((task) =>
        task.validation.items.forEach((it) => {
          const hard = it.id === "V3.2-Q1" || it.id === "V4.2-Q1" ? 0.22 : 0
          let ok = Math.random() < skill - hard
          let attempt = 1
          push("answered", { type: "validation-item", id: it.id, name: task.validation.id }, { lo: it.lo, correct: ok, attempt })
          while (!ok && attempt < 3) {
            attempt++
            ok = Math.random() < skill + 0.2
            push("answered", { type: "validation-item", id: it.id, name: task.validation.id }, { lo: it.lo, correct: ok, attempt })
          }
        }),
      )
      push("completed", { type: "lesson", id: l.id, name: l.title }, { durationMs: t - t0 + (persona === "struggler" ? 240000 : 0) })
    }
    if (!alive) continue
    const t0 = t
    push("started", { type: "experiment", id: "EXP", name: EXPERIMENT.title })
    const nInv = persona === "struggler" ? 2 + Math.floor(Math.random() * 3) : Math.floor(Math.random() * 2)
    for (let k = 0; k < nInv; k++) {
      const reason = SYN_REASONS[Math.random() < 0.5 ? 0 : Math.floor(Math.random() * SYN_REASONS.length)]
      push("attempted-invalid", { type: "simulator", id: "sandbox", name: "process simulator" }, { reason })
    }
    EXPERIMENT.challenges.forEach((c) => push("passed", { type: "challenge", id: c.id, name: c.title }, { lo: c.lo, scenario: c.scenarioId }))
    if (dropAt === "EXP" && Math.random() < 0.7) continue
    push("completed", { type: "experiment", id: "EXP", name: EXPERIMENT.title }, { durationMs: t - t0 })
    let score = 0
    ASSESSMENT.items.forEach((it) => {
      const ok = Math.random() < skill + 0.05
      if (ok) score++
      push("answered", { type: "assessment-item", id: it.id, name: "ASMT" }, { lo: it.lo, correct: ok, attempt: 1 })
    })
    if (score >= ASSESSMENT.passScore) {
      push("passed", { type: "assessment", id: "ASMT", name: ASSESSMENT.title }, { score, of: ASSESSMENT.items.length, attempt: 1 })
      push("completed", { type: "course", id: "plm", name: "Process Life Cycle" })
    } else {
      push("failed", { type: "assessment", id: "ASMT", name: ASSESSMENT.title }, { score, of: ASSESSMENT.items.length, attempt: 1 })
    }
  }
  appendRecords(out)
  record("generated-cohort", { type: "records", id: "synthetic", name: "cohort" }, { learners: 25, records: out.length })
}

/* ── small presentational bits ───────────────────────────────── */

function Bar({ pct, color = "bg-sky-500" }: { pct: number; color?: string }) {
  return (
    <div className="h-5 overflow-hidden rounded border border-border bg-muted">
      <div className={`h-full rounded-sm ${color}`} style={{ width: `${Math.max(2, pct)}%` }} />
    </div>
  )
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{note}</p>
      {children}
    </Card>
  )
}

/* ── main component ──────────────────────────────────────────── */

export function AnalyticsDashboard() {
  useRecordsVersion()
  const [filter, setFilter] = useState("all")
  const recs = getRecords()
  const synCount = recs.filter((r) => r.metadata?.synthetic).length

  const users = useMemo(() => byUser(recs), [recs])
  const counts = STAGES.map((st) => {
    let c = 0
    users.forEach((u) => {
      if (st.test(u.recs)) c++
    })
    return c
  })
  const maxC = Math.max(...counts, 1)

  const answered = recs.filter((r) => r.action === "answered")
  const accuracy = answered.length
    ? Math.round((100 * answered.filter((r) => r.metadata.correct === true).length) / answered.length)
    : 0

  const difficulty = ALL_ITEMS.map(({ node, item }) => {
    let firstOk = 0,
      attempted = 0,
      attempts = 0
    users.forEach((u) => {
      const ans = u.recs.filter((r) => r.action === "answered" && r.object.id === item.id)
      if (ans.length) {
        attempted++
        attempts += ans.length
        if (ans[0].metadata.correct === true) firstOk++
      }
    })
    return { node, id: item.id, lo: item.lo, attempted, attempts, rate: attempted ? Math.round((100 * firstOk) / attempted) : null }
  })
    .filter((r) => r.attempted > 0)
    .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101))
    .slice(0, 10)

  const misconceptions = useMemo(() => {
    const m = new Map<string, number>()
    recs
      .filter((r) => r.action === "attempted-invalid")
      .forEach((r) => {
        const key = String(r.metadata.reason ?? "invalid transition")
        m.set(key, (m.get(key) ?? 0) + 1)
      })
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [recs])
  const maxM = misconceptions.length ? misconceptions[0][1] : 1

  const times = NODES.map((n) => {
    const ds = recs
      .filter((r) => r.action === "completed" && r.object.id === n.id && typeof r.metadata.durationMs === "number")
      .map((r) => (r.metadata.durationMs as number) / 60000)
    return { id: n.id, med: ds.length ? median(ds) : null }
  }).filter((r) => r.med !== null) as { id: string; med: number }[]
  const maxT = Math.max(...times.map((r) => r.med), 1)

  const verbs = ["all", ...new Set(recs.map((r) => r.action))]
  const shown = recs.filter((r) => filter === "all" || r.action === filter).slice(-40).reverse()

  if (recs.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Every number on this page is computed from the learning-record stream —{" "}
          <code className="font-mono text-xs">{"{timestamp, user, action, object, metadata}"}</code> — and nothing
          else. No records yet: records appear once a lesson is worked through, and a synthetic cohort can be
          generated to preview the dashboards.
        </p>
        <Button className="mt-4 gap-1" onClick={generateCohort}>
          <Users className="h-4 w-4" /> Generate synthetic cohort (25 learners)
        </Button>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-widest text-sky-600">
          Derived from the record stream only
        </p>
        <h2 className="text-lg font-bold sm:text-xl">Learning analytics</h2>
      </div>

      {/* KPIs — top accents reuse the lab's process-state palette */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { l: "Learners", v: users.size, d: synCount ? "incl. synthetic cohort" : "live only", c: "border-t-sky-500" },
          { l: "Course completions", v: counts[counts.length - 1], d: "passed the mastery check", c: "border-t-green-500" },
          { l: "Answer accuracy", v: accuracy + "%", d: "all validation responses", c: "border-t-amber-500" },
          { l: "Records captured", v: recs.length, d: `${recs.length - synCount} live · ${synCount} synthetic`, c: "border-t-slate-400" },
        ].map((k) => (
          <Card key={k.l} className={`border-t-2 p-4 ${k.c}`}>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{k.l}</p>
            <p className="text-2xl font-bold">{k.v}</p>
            <p className="text-xs text-muted-foreground">{k.d}</p>
          </Card>
        ))}
      </div>

      {/* Funnel */}
      <Section title="Progression funnel" note="Where learners are on the dependency path — and where they drop off.">
        <div className="space-y-1.5">
          {STAGES.map((st, i) => {
            const drop = i > 0 && counts[i - 1] > 0 ? Math.round((100 * (counts[i - 1] - counts[i])) / counts[i - 1]) : 0
            return (
              <div key={st.id} className="grid grid-cols-[170px_1fr_100px] items-center gap-3 text-xs sm:grid-cols-[220px_1fr_120px]">
                <span className="truncate font-medium">{st.label}</span>
                <Bar pct={(100 * counts[i]) / maxC} />
                <span className="text-right font-mono text-muted-foreground">
                  {counts[i]}
                  {i > 0 ? ` · −${drop}%` : ""}
                </span>
              </div>
            )
          })}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Hardest validations */}
        <Section title="Hardest validations" note="First-attempt correctness per check, worst first — candidates for lesson revision or item review.">
          {difficulty.length === 0 ? (
            <p className="text-xs text-muted-foreground">No validation answers recorded yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-1.5 pr-2">Item</th>
                  <th className="py-1.5 pr-2">LO</th>
                  <th className="py-1.5 pr-2">Learners</th>
                  <th className="py-1.5">First-attempt correct</th>
                </tr>
              </thead>
              <tbody>
                {difficulty.map((r, i) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-1.5 pr-2 font-mono">{r.id}</td>
                    <td className="py-1.5 pr-2 font-mono">{r.lo}</td>
                    <td className="py-1.5 pr-2">{r.attempted}</td>
                    <td className="py-1.5">
                      <span
                        className={`font-semibold ${
                          (r.rate ?? 100) < 50 ? "text-red-600" : (r.rate ?? 100) < 70 ? "text-amber-600" : "text-green-600"
                        }`}
                      >
                        {r.rate}%
                      </span>{" "}
                      {i < 2 && (r.rate ?? 100) < 70 && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] text-amber-800">
                          hardest check
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Misconceptions + time */}
        <div className="space-y-4">
          <Section title="Misconception signals" note="Refused simulator moves, straight from attempted-invalid records.">
            {misconceptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No invalid transitions attempted yet — each refused move in the Sandbox or Scenarios becomes a
                misconception record.
              </p>
            ) : (
              <div className="space-y-1.5">
                {misconceptions.map(([reason, n]) => (
                  <div key={reason} className="grid grid-cols-[1fr_140px_44px] items-center gap-2 text-xs">
                    <span className="truncate" title={reason}>
                      {reason}
                    </span>
                    <Bar pct={(100 * n) / maxM} color="bg-red-500/80" />
                    <span className="text-right font-mono text-muted-foreground">{n}×</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
          <Section title="Median time per node" note="From completed.durationMs — checks effort estimates and locates friction.">
            {times.length === 0 ? (
              <p className="text-xs text-muted-foreground">No completions with duration yet.</p>
            ) : (
              <div className="space-y-1.5">
                {times.map((r) => (
                  <div key={r.id} className="grid grid-cols-[52px_1fr_110px] items-center gap-2 text-xs">
                    <span className="font-mono">{r.id}</span>
                    <Bar pct={(100 * r.med) / maxT} color="bg-yellow-500/80" />
                    <span className="text-right font-mono text-muted-foreground">{r.med.toFixed(1)} min median</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* Record stream */}
      <Section title="Record stream" note="The raw event stream — latest 40, filterable, exportable for offline analysis or LRS ingestion.">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs"
            aria-label="Filter records by action"
          >
            {verbs.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={exportRecordsJson}>
            <Download className="h-3 w-3" /> Export JSON (xAPI-mappable)
          </Button>
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={generateCohort}>
            <Users className="h-3 w-3" /> {synCount ? "Regenerate" : "Generate"} synthetic cohort (25)
          </Button>
          {synCount > 0 && (
            <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={clearSyntheticRecords}>
              <Trash2 className="h-3 w-3" /> Clear cohort
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-1.5">Time</th>
                <th className="px-2 py-1.5">User</th>
                <th className="px-2 py-1.5">Action</th>
                <th className="px-2 py-1.5">Object</th>
                <th className="px-2 py-1.5">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i} className="border-b border-border/40">
                  <td className="px-2 py-1.5 font-mono text-muted-foreground">{r.timestamp.slice(11, 19)}</td>
                  <td className="px-2 py-1.5 font-mono">{r.user.name}</td>
                  <td className={`px-2 py-1.5 font-mono font-semibold ${actionColor(r.action)}`}>{r.action}</td>
                  <td className="px-2 py-1.5 font-mono">
                    {r.object.type}:{r.object.id}
                  </td>
                  <td className="max-w-[280px] truncate px-2 py-1.5 font-mono text-muted-foreground">
                    {JSON.stringify(r.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
