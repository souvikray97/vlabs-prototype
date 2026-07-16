"use client"

import { useEffect, useState } from "react"
import { EXPERIMENT, NODES, nodeById, type CourseNode } from "@/lib/lesson-plan"
import { record, getPathMode, type PathMode } from "@/lib/learning-records"

/**
 * Lesson progress + controlled learner progression.
 *
 * lockState() is the single source of truth for what a learner may open:
 * a pure function of (dependency graph, validated progress, path mode).
 */

export interface NodeProgress {
  done: boolean
  startedAt?: number
  doneAt?: number
  taskIdx: number
  itemIdx: number
  firstTry: number
  itemsTotal: number
  results: Record<string, { attempts: number; firstTry: boolean }>
  score?: number
  attempt?: number
}

const PROGRESS_KEY = "os-vlab-lesson-progress-v1"

let progress: Record<string, NodeProgress> = {}
let loaded = false
const listeners = new Set<() => void>()

function isBrowser() {
  return typeof window !== "undefined"
}

function load() {
  if (loaded || !isBrowser()) return
  try {
    progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}") || {}
  } catch {
    progress = {}
  }
  loaded = true
}

function persist() {
  if (!isBrowser()) return
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
  } catch {}
}

function notify() {
  listeners.forEach((fn) => fn())
}

export function getProgress(nodeId: string): NodeProgress {
  load()
  if (!progress[nodeId]) {
    progress[nodeId] = { done: false, taskIdx: 0, itemIdx: 0, firstTry: 0, itemsTotal: 0, results: {} }
  }
  return progress[nodeId]
}

export function updateProgress(nodeId: string, patch: Partial<NodeProgress>) {
  const p = getProgress(nodeId)
  Object.assign(p, patch)
  persist()
  notify()
}

export function resetAllProgress() {
  progress = {}
  persist()
  notify()
}

export function subscribeProgress(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** React hook: bump on any progress change. */
export function useProgressVersion(): number {
  const [v, setV] = useState(0)
  useEffect(() => subscribeProgress(() => setV((x) => x + 1)), [])
  return v
}

/* ── controlled progression ──────────────────────────────────── */

export type LockState = "done" | "open" | "warn" | "locked"

export function prereqsMet(node: CourseNode): boolean {
  return node.prereqs.every((p) => getProgress(p).done)
}

export function missingPrereqs(node: CourseNode): string[] {
  return node.prereqs.filter((p) => !getProgress(p).done)
}

export function lockState(node: CourseNode, mode: PathMode = getPathMode()): LockState {
  if (getProgress(node.id).done) return "done"
  if (mode === "open") return "open"
  if (mode === "partial") {
    return prereqsMet(node) ? "open" : node.kind === "lesson" ? "open" : "warn"
  }
  // fully guided
  return prereqsMet(node) ? "open" : "locked"
}

function openSet(mode: PathMode): Set<string> {
  const s = new Set<string>()
  NODES.forEach((n) => {
    if (!getProgress(n.id).done && lockState(n, mode) !== "locked") s.add(n.id)
  })
  return s
}

/** Call around a completion: records `unlocked` for each newly reachable node. */
export function withUnlockTracking(fn: () => void) {
  const mode = getPathMode()
  const before = openSet(mode)
  fn()
  NODES.forEach((n) => {
    if (!getProgress(n.id).done && lockState(n, mode) !== "locked" && !before.has(n.id)) {
      record(
        "unlocked",
        { type: n.kind, id: n.id, name: n.title },
        { prereqs: n.prereqs.join("+") || "none" },
      )
    }
  })
}

/** True when the experiment tabs should be reachable in guided mode. */
export function experimentGateOpen(mode: PathMode = getPathMode()): boolean {
  if (mode !== "guided") return true
  return prereqsMet(EXPERIMENT) || getProgress("EXP").done
}

/* ── experiment ↔ guided-scenario sync ───────────────────────── */

/**
 * The experiment node's challenges are the lab's existing guided scenarios.
 * Called whenever the completed-scenario list changes: newly completed
 * challenges emit `passed`; when all challenges are done the experiment
 * emits `completed` and the Mastery Check unlocks.
 */
export function syncExperimentProgress(completedScenarios: string[]) {
  if (!isBrowser()) return
  const exp = getProgress("EXP")
  const doneSet = new Set(completedScenarios)
  let changed = false

  for (const c of EXPERIMENT.challenges) {
    const key = "challenge:" + c.id
    const already = exp.results[key]?.firstTry === true
    if (!already && doneSet.has(c.scenarioId)) {
      exp.results[key] = { attempts: 1, firstTry: true }
      record(
        "passed",
        { type: "challenge", id: c.id, name: c.title },
        { lo: c.lo, scenario: c.scenarioId },
      )
      changed = true
    }
  }

  const allDone = EXPERIMENT.challenges.every((c) => exp.results["challenge:" + c.id]?.firstTry)
  if (allDone && !exp.done) {
    withUnlockTracking(() => {
      exp.done = true
      exp.doneAt = Date.now()
      const duration = exp.startedAt ? exp.doneAt - exp.startedAt : undefined
      updateProgress("EXP", exp)
      record(
        "completed",
        { type: "experiment", id: "EXP", name: EXPERIMENT.title },
        duration !== undefined ? { durationMs: duration, challenges: EXPERIMENT.challenges.length } : { challenges: EXPERIMENT.challenges.length },
      )
    })
    changed = true
  }

  if (changed) {
    persist()
    notify()
  }
}

/** Convenience for dashboards: how many course nodes are complete. */
export function completedNodeCount(): number {
  return NODES.filter((n) => getProgress(n.id).done).length
}

export { nodeById }
