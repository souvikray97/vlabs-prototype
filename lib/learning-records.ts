"use client"

import { useEffect, useState } from "react"

/**
 * Learning records — the telemetry backbone of the pedagogy layer.
 *
 * Every learner action emits one record of the shape
 *   { timestamp, user, action, object, metadata }
 * The analytics dashboard is computed from this stream and nothing else.
 * The shape maps one-to-one onto xAPI statements (actor/verb/object/result),
 * so a Learning Record Store can be adopted later by adding a serialiser.
 */

export interface LearningRecord {
  timestamp: string
  user: { id: string; name: string }
  action: string
  object: { type: string; id: string; name: string }
  metadata: Record<string, unknown>
}

export type PathMode = "guided" | "partial" | "open"

const RECORDS_KEY = "os-vlab-learning-records-v1"
const LEARNER_KEY = "os-vlab-learner-v1"
const MODE_KEY = "os-vlab-path-mode-v1"
const MAX_RECORDS = 8000

let records: LearningRecord[] = []
let loaded = false
const listeners = new Set<() => void>()

function isBrowser() {
  return typeof window !== "undefined"
}

function load() {
  if (loaded || !isBrowser()) return
  try {
    records = JSON.parse(localStorage.getItem(RECORDS_KEY) || "[]")
    if (!Array.isArray(records)) records = []
  } catch {
    records = []
  }
  loaded = true
}

function persist() {
  if (!isBrowser()) return
  try {
    if (records.length > MAX_RECORDS) records = records.slice(-MAX_RECORDS)
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records))
  } catch {
    /* storage full — analytics degrade gracefully */
  }
}

function notify() {
  listeners.forEach((fn) => fn())
}

/* ── learner identity (pseudonymous) ─────────────────────────── */

export function getLearner(): { id: string; name: string } {
  if (!isBrowser()) return { id: "server", name: "Learner" }
  try {
    const raw = localStorage.getItem(LEARNER_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* fall through */
  }
  const learner = { id: "u-" + Math.random().toString(36).slice(2, 8), name: "Learner" }
  try {
    localStorage.setItem(LEARNER_KEY, JSON.stringify(learner))
  } catch {}
  return learner
}

/** Forget the stored learner (id + name) — used by Reset All so a fresh session-entry prompt appears. */
export function clearLearner() {
  if (!isBrowser()) return
  try {
    localStorage.removeItem(LEARNER_KEY)
  } catch {}
  notify()
}

export function setLearnerName(name: string) {
  if (!isBrowser()) return
  const learner = getLearner()
  learner.name = name.trim() || "Learner"
  try {
    localStorage.setItem(LEARNER_KEY, JSON.stringify(learner))
  } catch {}
  notify()
}

/* ── path mode (guided / partial / open) ─────────────────────── */

export function getPathMode(): PathMode {
  if (!isBrowser()) return "guided"
  const m = localStorage.getItem(MODE_KEY)
  return m === "partial" || m === "open" ? m : "guided"
}

export function setPathMode(mode: PathMode) {
  if (!isBrowser()) return
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {}
  record("mode-changed", { type: "course", id: "plm", name: "Process Life Cycle" }, { newMode: mode })
  notify()
}

/** React hook: current path mode, re-rendering on change. */
export function usePathMode(): PathMode {
  const [mode, setModeState] = useState<PathMode>("guided")
  useEffect(() => {
    setModeState(getPathMode())
    const fn = () => setModeState(getPathMode())
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  return mode
}

/* ── the record stream ───────────────────────────────────────── */

export function record(
  action: string,
  object: { type: string; id: string; name: string },
  metadata: Record<string, unknown> = {},
): LearningRecord | null {
  if (!isBrowser()) return null
  load()
  const entry: LearningRecord = {
    timestamp: new Date().toISOString(),
    user: getLearner(),
    action,
    object,
    metadata: { mode: getPathMode(), ...metadata },
  }
  records.push(entry)
  persist()
  notify()
  return entry
}

/** Append pre-built records (used by the synthetic-cohort generator). */
export function appendRecords(entries: LearningRecord[]) {
  if (!isBrowser()) return
  load()
  records.push(...entries)
  persist()
  notify()
}

export function getRecords(): LearningRecord[] {
  load()
  return records
}

export function clearSyntheticRecords() {
  load()
  records = records.filter((r) => !r.metadata?.synthetic)
  persist()
  notify()
}

export function clearAllRecords() {
  records = []
  persist()
  notify()
}

export function subscribeRecords(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** React hook: bump on every new record so dashboards stay live. */
export function useRecordsVersion(): number {
  const [v, setV] = useState(0)
  useEffect(() => subscribeRecords(() => setV((x) => x + 1)), [])
  return v
}

export function exportRecordsJson() {
  if (!isBrowser()) return
  record("exported", { type: "records", id: "all", name: "learning records" }, { count: records.length })
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = "plm-learning-records.json"
  a.click()
  URL.revokeObjectURL(a.href)
}
