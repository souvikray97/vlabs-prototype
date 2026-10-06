"use client"

import { useState, useCallback, useEffect, useLayoutEffect, useRef, forwardRef, useImperativeHandle, type PointerEvent as ReactPointerEvent, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { RotateCcw, AlertCircle, Clock, Cpu, Activity, Info, History, Download, BarChart3, Undo2, Redo2, Network, ListTree, MousePointer2 } from "lucide-react"
import { ProcessStateDiagram } from "@/components/process-state-diagram"
import { exportActionLogCSV, exportActionLogJSON, exportStateHistoryCSV, exportStateHistoryJSON } from "@/lib/export-utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { SimulationEngine, type SimulationProcess, type SimulationEvent, type EngineSnapshot } from "@/lib/simulation-engine"
import { record } from "@/lib/learning-records"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useKeyboardShortcuts, type ShortcutDef, type ShortcutAction } from "@/hooks/use-keyboard-shortcuts"

export interface SimulationHandle {
  advanceClock: () => void
  stepBack: () => void
  createProcess: () => void
  selectNextEvent: () => void
  cancelSelection: () => void
  moveSelectedToState: (state: SimulationProcess["state"]) => void
}

export const SIMULATION_SHORTCUT_DEFS: ShortcutDef[] = [
  { key: "a", label: "Advance Clock", description: "Advance simulation clock one tick", category: "Simulation" },
  { key: "z", label: "Step Back", description: "Undo last clock advance", category: "Simulation" },
  { key: "c", label: "Create Process", description: "Create a new process (needs a create_request event selected)", category: "Simulation" },
  { key: "e", label: "Select Next Event", description: "Cycle through active events in the queue", category: "Simulation" },
  { key: "Escape", label: "Deselect / Close diagram", description: "Close the enlarged Valid attempts diagram, or cancel the current process / event selection", category: "Simulation" },
  { key: "g", label: "Dispatch to CPU", description: "Move selected process to the CPU (Running)", category: "Simulation" },
  { key: "i", label: "Move to I/O", description: "Move selected process to I/O Wait", category: "Simulation" },
  { key: "r", label: "Move to Ready", description: "Preempt selected process back to Ready", category: "Simulation" },
  { key: "t", label: "Terminate", description: "Terminate the selected process", category: "Simulation" },
  { key: "r", shift: true, label: "Reset Simulation", description: "Reset all processes and events (Sandbox) / Reset Scenario (Scenarios tab)", category: "Simulation" },
]

// Every event type the engine can emit (see SimulationEngine.generateEvents / loadScenario).
// Kept in sync with the SimulationEvent["name"] union so the catalog never drifts from reality.
const EVENT_CATALOG: Array<{
  name: string
  type: "external" | "internal"
  description: string
  color: string
}> = [
  {
    name: "create_request",
    type: "external",
    description: "A request to admit a new process. Acting on it moves the process into the Ready queue.",
    color: "bg-sky-100 text-sky-800 border-sky-200",
  },
  {
    name: "io_needed",
    type: "internal",
    description: "A running process requests I/O. It enables the CPU → I/O Wait transition.",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
  },
  {
    name: "io_done",
    type: "internal",
    description: "An I/O operation has completed. It enables the I/O Wait → Ready transition.",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
  },
  {
    name: "terminate",
    type: "external",
    description: "A running process is eligible to finish. It enables the CPU → Terminated transition.",
    color: "bg-red-100 text-red-800 border-red-200",
  },
]

// ── Guided tour ────────────────────────────────────────────────────────────────
// A first-run walkthrough that takes P0 through a full life cycle
// (Ready → CPU → I/O → Ready → CPU → Terminated). Each step is gated on real engine
// state, so the tour advances only when the user performs the actual action. The
// matching control gets a click-pulse and an anchored popup; transitions show a ghost
// chip animating between the real lanes.
const TOUR_PID = 0

export type TourTarget =
  | { kind: "button"; button: "advance" | "create" | "revert" }
  | { kind: "event"; event: "create_request" | "io_needed" | "io_done" | "terminate" }
  | { kind: "drag"; from: SimulationProcess["state"]; to: SimulationProcess["state"] }

export interface TourStep {
  id: string
  target: TourTarget
  message: string
  done: (s: ReturnType<SimulationEngine["getState"]>) => boolean
}

const evActive = (s: ReturnType<SimulationEngine["getState"]>, name: string) =>
  s.events.some((e) => e.processId === TOUR_PID && e.name === name && e.state === "active")
const evSelected = (s: ReturnType<SimulationEngine["getState"]>, name: string) => {
  const ev = s.selectedEvent !== null ? s.events[s.selectedEvent] : null
  return !!ev && ev.name === name && ev.processId === TOUR_PID
}
const p0 = (s: ReturnType<SimulationEngine["getState"]>) => s.processes[TOUR_PID]
const p0State = (s: ReturnType<SimulationEngine["getState"]>) => p0(s)?.state

// Per-state chip colours (match getProcessColor / the lane headings): the tour ghost chip
// animates from the source-state colour to the target-state colour as it's "dropped".
const STATE_COLOR: Record<string, string> = {
  ready: "#0ea5e9", // sky-500
  running: "#22c55e", // green-500
  blocked: "#eab308", // yellow-500
  terminated: "#ef4444", // red-500
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "advance-create",
    target: { kind: "button", button: "advance" },
    message: "Click Advance Clock until a create_request event for P0 appears in the queue.",
    done: (s) => evActive(s, "create_request"),
  },
  {
    id: "select-create",
    target: { kind: "event", event: "create_request" },
    message: "Click the create_request event to select it.",
    done: (s) => evSelected(s, "create_request") || p0State(s) !== "new",
  },
  {
    id: "create",
    target: { kind: "button", button: "create" },
    message: "Click Create Process to admit P0 into the Ready queue.",
    done: (s) => p0State(s) !== "new",
  },
  {
    id: "advance-dispatch",
    target: { kind: "button", button: "advance" },
    message: "A newly created process must wait one tick. Click Advance Clock once before dispatching P0.",
    done: (s) => p0State(s) === "ready" && s.currentTime > (p0(s)?.readyEnteredTime ?? 0),
  },
  {
    id: "drag-ready-cpu-1",
    target: { kind: "drag", from: "ready", to: "running" },
    message: "Drag P0 from Ready onto the CPU lane to dispatch it.",
    done: (s) => p0State(s) === "running",
  },
  {
    id: "advance-io-needed",
    target: { kind: "button", button: "advance" },
    message: "Click Advance Clock until an io_needed event for P0 appears (about 2 ticks).",
    done: (s) => evActive(s, "io_needed"),
  },
  {
    id: "select-io-needed",
    target: { kind: "event", event: "io_needed" },
    message: "Click the io_needed event to select it.",
    done: (s) => evSelected(s, "io_needed") || p0State(s) === "blocked",
  },
  {
    id: "drag-cpu-io",
    target: { kind: "drag", from: "running", to: "blocked" },
    message: "Drag P0 from the CPU lane to the I/O lane.",
    done: (s) => p0State(s) === "blocked",
  },
  {
    id: "advance-io-done",
    target: { kind: "button", button: "advance" },
    message: "Click Advance Clock until an io_done event for P0 appears.",
    done: (s) => evActive(s, "io_done"),
  },
  {
    id: "select-io-done",
    target: { kind: "event", event: "io_done" },
    message: "Click the io_done event to select it.",
    done: (s) => evSelected(s, "io_done") || p0State(s) === "ready",
  },
  {
    id: "drag-io-ready",
    target: { kind: "drag", from: "blocked", to: "ready" },
    message: "Drag P0 from the I/O lane back to Ready.",
    done: (s) => p0State(s) === "ready",
  },
  {
    id: "drag-ready-cpu-2",
    target: { kind: "drag", from: "ready", to: "running" },
    message: "Drag P0 from Ready onto the CPU lane again.",
    done: (s) => p0State(s) === "running",
  },
  {
    id: "advance-terminate",
    target: { kind: "button", button: "advance" },
    message: "Click Advance Clock until a terminate event for P0 appears.",
    done: (s) => evActive(s, "terminate"),
  },
  {
    id: "select-terminate",
    target: { kind: "event", event: "terminate" },
    message: "Click the terminate event to select it.",
    done: (s) => evSelected(s, "terminate") || p0State(s) === "terminated",
  },
  {
    id: "drag-cpu-terminated",
    target: { kind: "drag", from: "running", to: "terminated" },
    message: "Drag P0 from the CPU lane to the Terminated lane.",
    done: (s) => p0State(s) === "terminated",
  },
  {
    id: "revert",
    target: { kind: "button", button: "revert" },
    message: "Finally, click Revert Clock to undo the last clock advance — then the tour is complete.",
    done: () => false, // completed via step-back detection (clock decreases)
  },
]

interface ProcessSchedulingSimulationProps {
  onEngineReady?: (engine: SimulationEngine) => void
  onStateChange?: (state: ReturnType<SimulationEngine["getState"]>) => void
  shortcutsEnabled?: boolean
  isActiveTab?: boolean
  // When provided (Guided Scenarios), the tour renders these cues instead of the built-in
  // sandbox lifecycle tour — even though the embedded sim is isActiveTab=false. Memoize per
  // scenario step so its identity change resets the cue index.
  externalTourCues?: TourStep[] | null
}

export const ProcessSchedulingSimulation = forwardRef<SimulationHandle, ProcessSchedulingSimulationProps>(
function ProcessSchedulingSimulation({ onEngineReady, onStateChange, shortcutsEnabled = true, isActiveTab = true, externalTourCues = null }: ProcessSchedulingSimulationProps, _forwardedRef) {
  const [engine] = useState(() => new SimulationEngine())
  const [simulationState, setSimulationState] = useState(() => engine.getState())

  useEffect(() => {
    onEngineReady?.(engine)
  }, [engine, onEngineReady])
  const [alert, setAlert] = useState<{ message: string; type: "error" | "success" | "info" } | null>(null)
  const [selectedProcess, setSelectedProcess] = useState<number | null>(null)
  const [diagramZoomed, setDiagramZoomed] = useState(false)

  // ── Guided tour state ──────────────────────────────────────────────────────
  const [tourActive, setTourActive] = useState(true)
  const [tourStep, setTourStep] = useState(0)
  const tourBaselineTime = useRef<number | null>(null) // clock at the revert step, to detect step-back
  // top set → anchored beside the target (desktop); bottom set → pinned banner (phones).
  // caret = which edge the pointer nub sits on (points back at the target); null on the mobile banner.
  const [tourPopup, setTourPopup] = useState<{ left: number; width: number; top: number | null; bottom: number | null; caret: "left" | "right" | null } | null>(null)
  // Ghost-chip geometry for drag steps: a P0 chip animates between the live lanes. We
  // measure the real lane positions (relative to their wrapper) so it tracks the layout.
  const [hintGeom, setHintGeom] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const lanesWrapRef = useRef<HTMLDivElement>(null)
  const cpuLaneRef = useRef<HTMLDivElement>(null)
  const readyLaneRef = useRef<HTMLDivElement>(null)
  const blockedLaneRef = useRef<HTMLDivElement>(null)
  const terminatedLaneRef = useRef<HTMLDivElement>(null)
  const advanceBtnRef = useRef<HTMLButtonElement>(null)
  const createBtnRef = useRef<HTMLButtonElement>(null)
  const revertBtnRef = useRef<HTMLButtonElement>(null)
  const eventChipRef = useRef<HTMLDivElement>(null)
  // Equal-height: cap the (taller) Controls column + Sandbox card to the Metrics card's height
  // so all three bottoms align. CSS grid can only grow a row to its tallest child, never shrink
  // to the shortest, so this is measured in JS. Only at xl, where the three share a row.
  const metricsCardRef = useRef<HTMLDivElement>(null)
  const controlsColRef = useRef<HTMLDivElement>(null)
  const sandboxCardRef = useRef<HTMLDivElement>(null)
  const historyStack = useRef<EngineSnapshot[]>([])
  const [historyLength, setHistoryLength] = useState(0)
  // Scoped to this instance so auto-scroll targets the right Event Requests list even when a
  // second (embedded) simulation is mounted on the Scenarios tab.
  const eventQueueRef = useRef<HTMLDivElement>(null)

  const refreshState = useCallback(() => {
    const newState = engine.getState()
    setSimulationState(newState)
    onStateChange?.(newState)
  }, [engine, onStateChange])

  const showAlert = useCallback((message: string, type: "error" | "success" | "info" = "error", force = false) => {
    if (type === "error") {
      // Every refused move is a misconception signal for the analytics layer.
      record(
        "attempted-invalid",
        { type: "simulator", id: "sandbox", name: "process simulator" },
        { reason: message },
      )
    }
    if (type === "error" || force) {
      setAlert({ message, type })
      const duration = type === "error" ? 4000 : 3000
      setTimeout(() => setAlert(null), duration)
    }
  }, [])

  const handleReset = useCallback(() => {
    engine.reset()
    historyStack.current = []
    setHistoryLength(0)
    refreshState()
    setAlert(null)
    setSelectedProcess(null)
    // Restart the guided tour from the beginning on reset.
    tourBaselineTime.current = null
    setTourStep(0)
    setTourActive(true)
    showAlert("Sandbox reset - all processes and events cleared", "info", true)
  }, [engine, refreshState, showAlert])

  const handleAdvanceClock = useCallback(() => {
    historyStack.current.push(engine.snapshot())
    setHistoryLength(historyStack.current.length)
    const result = engine.advanceClock()
    refreshState()
    if (!result.success) {
      showAlert(`Clock advance failed: ${result.message}.`, "error")
    } else {
      showAlert(`Clock advanced to time ${result.message.split(" ").pop()}`, "success", true)
    }
  }, [engine, refreshState, showAlert])

  const handleStepBack = useCallback(() => {
    const snap = historyStack.current.pop()
    if (!snap) return
    setHistoryLength(historyStack.current.length)
    engine.restore(snap)
    refreshState()
    showAlert("Stepped back to previous state", "info", true)
  }, [engine, refreshState, showAlert])

  const handleCreateProcess = useCallback(() => {
    const result = engine.createProcess()
    refreshState()
    if (!result.success) {
      showAlert(`Process creation failed: ${result.message}`, "error")
    } else {
      showAlert(`New process created and added to Ready`, "success", true)
    }
  }, [engine, refreshState, showAlert])

  const handleEventSelect = useCallback((eventId: number) => {
    engine.selectEvent(eventId)
    refreshState()
  }, [engine, refreshState])

  const handleProcessMove = useCallback((processId: number, destination: SimulationProcess["state"]) => {
    // "new" is never a move target — the engine only accepts the four life-cycle destinations.
    const result = engine.moveProcess(processId, destination as "ready" | "running" | "blocked" | "terminated")
    refreshState()
    if (!result.success) {
      showAlert(result.message, "error")
    } else {
      showAlert(`Process P${processId} successfully moved to ${destination} state`, "success", true)
    }
    setSelectedProcess(null)
  }, [engine, refreshState, showAlert])

  // ── Drag-and-drop moving (pointer events → works with mouse, touch and pen) ───────────
  // A process chip is dragged onto a lane (CPU / Ready / I/O / Terminated) to request that
  // transition; the engine still validates it. Pointer events unify mouse + touch, so this
  // works on phones. Lanes carry data-lane-state; the drop target is resolved by hit-testing
  // the point under the pointer.
  const dragInfo = useRef<{ id: number; pointerId: number; moved: boolean; startX: number; startY: number } | null>(null)
  const suppressClick = useRef(false)
  const [dragProcess, setDragProcess] = useState<SimulationProcess | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [dragOverState, setDragOverState] = useState<SimulationProcess["state"] | null>(null)

  const laneFromPoint = useCallback((x: number, y: number): SimulationProcess["state"] | null => {
    const lane = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest("[data-lane-state]") as HTMLElement | null
    return (lane?.dataset.laneState as SimulationProcess["state"]) ?? null
  }, [])

  const handleChipPointerDown = useCallback((e: ReactPointerEvent, process: SimulationProcess) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    suppressClick.current = false
    dragInfo.current = { id: process.id, pointerId: e.pointerId, moved: false, startX: e.clientX, startY: e.clientY }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch {}
    setDragProcess(process)
    setDragPos({ x: e.clientX, y: e.clientY })
  }, [])

  const handleChipPointerMove = useCallback((e: ReactPointerEvent) => {
    const info = dragInfo.current
    if (!info || info.pointerId !== e.pointerId) return
    if (!info.moved && Math.hypot(e.clientX - info.startX, e.clientY - info.startY) < 6) return
    info.moved = true
    e.preventDefault()
    setDragPos({ x: e.clientX, y: e.clientY })
    setDragOverState(laneFromPoint(e.clientX, e.clientY))
  }, [laneFromPoint])

  const endChipDrag = useCallback((e: ReactPointerEvent, commit: boolean) => {
    const info = dragInfo.current
    if (!info || info.pointerId !== e.pointerId) return
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
    if (commit && info.moved) {
      const target = laneFromPoint(e.clientX, e.clientY)
      if (target) handleProcessMove(info.id, target)
      suppressClick.current = true // a real drag happened — don't let the trailing click also select
    }
    dragInfo.current = null
    setDragProcess(null)
    setDragOverState(null)
  }, [laneFromPoint, handleProcessMove])

  const handleChipClick = useCallback((processId: number) => {
    if (suppressClick.current) { suppressClick.current = false; return }
    setSelectedProcess(processId)
  }, [])

  // Per-state highlight applied to a lane while a compatible chip hovers over it.
  const laneHighlight = (state: SimulationProcess["state"]): string => {
    if (dragOverState !== state) return ""
    switch (state) {
      case "running": return "bg-green-100 ring-2 ring-inset ring-green-400"
      case "ready": return "bg-sky-100 ring-2 ring-inset ring-sky-400"
      case "blocked": return "bg-yellow-100 ring-2 ring-inset ring-yellow-400"
      case "terminated": return "bg-red-100 ring-2 ring-inset ring-red-400"
      default: return ""
    }
  }

  const renderChip = (process: SimulationProcess) => (
    <div
      key={process.id}
      onPointerDown={(e) => handleChipPointerDown(e, process)}
      onPointerMove={handleChipPointerMove}
      onPointerUp={(e) => endChipDrag(e, true)}
      onPointerCancel={(e) => endChipDrag(e, false)}
      onClick={() => handleChipClick(process.id)}
      className={`px-1 sm:px-2 py-1 rounded text-white font-bold cursor-grab active:cursor-grabbing transition-all hover:scale-105 text-xs flex-shrink-0 touch-none select-none ${getProcessColor(process.state)} ${selectedProcess === process.id ? "ring-2 ring-offset-1 ring-blue-500" : ""} ${dragProcess?.id === process.id ? "opacity-40" : ""}`}
    >
      {process.name}
    </div>
  )

  const handleSelectNextEvent = useCallback(() => {
    const state = engine.getState()
    const active = state.events.filter((e: SimulationEvent) => e.state === "active")
    if (active.length === 0) return
    const currentIdx = active.findIndex((e: SimulationEvent) => e.id === state.selectedEvent)
    const nextIdx = (currentIdx + 1) % active.length
    handleEventSelect(active[nextIdx].id)
  }, [engine, handleEventSelect])

  const handleCancelSelection = useCallback(() => {
    setSelectedProcess(null)
  }, [])

  // Escape closes the enlarged Valid attempts diagram. A dedicated listener (rather than the
  // shortcut map) so it works even when the embedded simulation has shortcuts disabled.
  useEffect(() => {
    if (!diagramZoomed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDiagramZoomed(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [diagramZoomed])

  // selectedProcess ref so keyboard action closures always see current value
  const selectedProcessRef = useRef(selectedProcess)
  useEffect(() => { selectedProcessRef.current = selectedProcess }, [selectedProcess])

  const shortcuts: ShortcutAction[] = [
    { key: "a", label: "Advance Clock", description: "Advance simulation clock one tick", category: "Simulation", action: handleAdvanceClock },
    { key: "z", label: "Step Back", description: "Undo last clock advance", category: "Simulation", action: handleStepBack },
    { key: "c", label: "Create Process", description: "Create a new process", category: "Simulation", action: handleCreateProcess },
    { key: "e", label: "Select Next Event", description: "Cycle through active events in the queue", category: "Simulation", action: handleSelectNextEvent },
    { key: "Escape", label: "Deselect / Close diagram", description: "Close the enlarged diagram, or cancel process / event selection", category: "Simulation", action: handleCancelSelection },
    { key: "g", label: "Dispatch to CPU", description: "Move selected process to the CPU", category: "Simulation", action: () => { const p = selectedProcessRef.current; if (p !== null) handleProcessMove(p, "running") } },
    { key: "i", label: "Move to I/O", description: "Move selected process to I/O Wait", category: "Simulation", action: () => { const p = selectedProcessRef.current; if (p !== null) handleProcessMove(p, "blocked") } },
    { key: "r", label: "Move to Ready", description: "Preempt selected process back to Ready", category: "Simulation", action: () => { const p = selectedProcessRef.current; if (p !== null) handleProcessMove(p, "ready") } },
    { key: "t", label: "Terminate", description: "Terminate the selected process", category: "Simulation", action: () => { const p = selectedProcessRef.current; if (p !== null) handleProcessMove(p, "terminated") } },
    { key: "r", shift: true, label: "Reset Simulation", description: "Reset all processes and events", category: "Simulation", action: handleReset },
  ]

  useKeyboardShortcuts(shortcuts, shortcutsEnabled && isActiveTab)

  useImperativeHandle(
    _forwardedRef,
    () => ({
      advanceClock: handleAdvanceClock,
      stepBack: handleStepBack,
      createProcess: handleCreateProcess,
      selectNextEvent: handleSelectNextEvent,
      cancelSelection: handleCancelSelection,
      moveSelectedToState: (state: SimulationProcess["state"]) => {
        const p = selectedProcessRef.current
        if (p !== null) handleProcessMove(p, state)
      },
    }),
    [handleAdvanceClock, handleStepBack, handleCreateProcess, handleSelectNextEvent, handleCancelSelection, handleProcessMove],
  )

  const getProcessColor = (state: SimulationProcess["state"]) => {
    switch (state) {
      case "ready":
        return "bg-sky-500 hover:bg-sky-600"
      case "running":
        return "bg-green-500 hover:bg-green-600"
      case "blocked":
        return "bg-yellow-500 hover:bg-yellow-600"
      case "terminated":
        return "bg-red-500 hover:bg-red-600"
      default:
        return "bg-gray-300 hover:bg-gray-400"
    }
  }

  const getStateLabel = (state: SimulationProcess["state"]) => {
    switch (state) {
      case "ready":
        return "Ready"
      case "running":
        return "Running"
      case "blocked":
        return "I/O"
      case "terminated":
        return "Terminated"
      case "new":
        return "Not Created"
      default:
        return "Unknown"
    }
  }

  // Each event is tinted with the colour of the process state it relates to, using the same
  // state colour tokens as the lanes: create_request → Ready (sky), io_needed/io_done → I/O
  // (yellow), terminate → Terminated (red).
  const getEventColor = (event: SimulationEvent) => {
    switch (event.name) {
      case "create_request":
        return "bg-sky-100 text-sky-800 border-sky-200"
      case "io_needed":
      case "io_done":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "terminate":
        return "bg-red-100 text-red-800 border-red-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  // Auto-scroll the Event Requests list to the bottom as new events are appended there.
  // Depend on the event count (and clock) because the engine mutates the events array in
  // place, so the array reference itself never changes between renders.
  const activeEventCount = simulationState.events.filter((e) => e.state === "active").length
  useEffect(() => {
    const el = eventQueueRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [activeEventCount, simulationState.events.length, simulationState.currentTime])

  const readyProcesses = simulationState.processes.filter((p) => p.state === "ready")
  const runningProcesses = simulationState.processes.filter((p) => p.state === "running")
  const blockedProcesses = simulationState.processes.filter((p) => p.state === "blocked")
  const terminatedProcesses = simulationState.processes.filter((p) => p.state === "terminated")
  const activeEvents = simulationState.events.filter((e) => e.state === "active")

  // Tour source: external cues (Guided Scenarios, any tab) or the built-in sandbox lifecycle
  // tour (live Sandbox tab only). External cues drive the same renderer below.
  const usingExternalTour = externalTourCues != null
  const tourSteps = usingExternalTour ? externalTourCues! : TOUR_STEPS
  const tourRunning = usingExternalTour ? externalTourCues!.length > 0 : tourActive && isActiveTab
  const tourStepObj = tourRunning && tourStep < tourSteps.length ? tourSteps[tourStep] : null
  const tourButton = tourStepObj?.target.kind === "button" ? tourStepObj.target.button : null

  const laneRefByState = (st: SimulationProcess["state"]) =>
    st === "running" ? cpuLaneRef : st === "ready" ? readyLaneRef : st === "blocked" ? blockedLaneRef : terminatedLaneRef

  // New scenario step → restart the tour at its first cue.
  useEffect(() => {
    setTourStep(0)
    tourBaselineTime.current = null
  }, [externalTourCues])

  // Step machine: advance past every cue whose action the user has completed. Runs on each
  // state change. The sandbox tour's final "revert" cue completes when the clock goes backwards.
  useEffect(() => {
    if (!tourRunning) return
    let step = tourStep
    while (step < tourSteps.length && tourSteps[step].done(simulationState)) step++
    if (step < tourSteps.length && tourSteps[step].id === "revert") {
      if (tourBaselineTime.current === null) {
        tourBaselineTime.current = simulationState.currentTime
      } else if (simulationState.currentTime < tourBaselineTime.current) {
        step = tourSteps.length
      }
    }
    if (step !== tourStep) setTourStep(step)
    if (!usingExternalTour && step >= tourSteps.length) setTourActive(false)
  }, [simulationState, tourRunning, tourStep, tourSteps, usingExternalTour])

  // Ghost-chip geometry for the current drag step: measure the from/to lane centres
  // (relative to their wrapper) so the chip animates between the real lanes.
  useLayoutEffect(() => {
    if (tourStepObj?.target.kind !== "drag") {
      setHintGeom(null)
      return
    }
    const fromRef = laneRefByState(tourStepObj.target.from)
    const toRef = laneRefByState(tourStepObj.target.to)
    const measure = () => {
      const wrap = lanesWrapRef.current
      const from = fromRef.current
      const to = toRef.current
      if (!wrap || !from || !to) return
      const w = wrap.getBoundingClientRect()
      const f = from.getBoundingClientRect()
      const t = to.getBoundingClientRect()
      setHintGeom({
        x0: f.left - w.left + 28,
        y0: f.top - w.top + f.height / 2,
        x1: t.left - w.left + 28,
        y1: t.top - w.top + t.height / 2,
      })
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [tourStep, tourActive, isActiveTab, simulationState, externalTourCues])

  // Anchor the instruction popup (fixed-position, portalled) next to the current target.
  useLayoutEffect(() => {
    if (!tourStepObj) {
      setTourPopup(null)
      return
    }
    const anchorEl = (): HTMLElement | null => {
      if (tourStepObj.target.kind === "button") {
        return tourStepObj.target.button === "advance"
          ? advanceBtnRef.current
          : tourStepObj.target.button === "create"
            ? createBtnRef.current
            : revertBtnRef.current
      }
      if (tourStepObj.target.kind === "event") return eventChipRef.current
      return laneRefByState(tourStepObj.target.to).current
    }
    const place = () => {
      const el = anchorEl()
      if (!el) {
        setTourPopup(null)
        return
      }
      // Phones have no room beside a full-width control — pin a bottom banner instead so the
      // popup never covers the target (the target still pulses to show where to act).
      if (window.innerWidth < 640) {
        setTourPopup({ left: 8, width: window.innerWidth - 16, top: null, bottom: 8, caret: null })
        return
      }
      const r = el.getBoundingClientRect()
      // Anchor not laid out (e.g. its tab is hidden) — hide rather than pin to a stale spot.
      if (r.width === 0 && r.height === 0) {
        setTourPopup(null)
        return
      }
      const width = Math.min(240, window.innerWidth - 16)
      // Prefer the right of the anchor; flip left, then clamp to the viewport on both axes.
      // caret points back at the target: on the popup's left edge when it sits to the right,
      // on the right edge when it flips to the left.
      let left = r.right + 12
      let caret: "left" | "right" = "left"
      if (left + width > window.innerWidth - 8) {
        left = r.left - width - 12
        caret = "right"
      }
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      const top = Math.max(8, Math.min(r.top + r.height / 2, window.innerHeight - 8))
      setTourPopup({ top, left, width, bottom: null, caret })
    }
    place()
    // Re-place on re-layout too (tab switch, equal-height cap, content growth) — window
    // resize/scroll alone miss these and leave the popup where the anchor used to be.
    const ro = new ResizeObserver(place)
    ro.observe(document.body)
    const el = anchorEl()
    if (el) ro.observe(el)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [tourStep, tourActive, isActiveTab, simulationState, externalTourCues])

  // ponytail: JS equal-height — CSS grid can't size a row to its shortest child. Cap the
  // Controls column + Sandbox card to the Metrics card's height (xl only) so bottoms align.
  useLayoutEffect(() => {
    const metrics = metricsCardRef.current
    if (!metrics) return
    const apply = () => {
      const h = window.innerWidth >= 1280 ? `${metrics.offsetHeight}px` : ""
      if (controlsColRef.current) controlsColRef.current.style.height = h
      if (sandboxCardRef.current) sandboxCardRef.current.style.height = h
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(metrics)
    window.addEventListener("resize", apply)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", apply)
    }
  }, [simulationState])

  return (
    <TooltipProvider>
      <div className="space-y-4 sm:space-y-6 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          {/* Controls column: Controls card + Event Catalog stacked. Flex column so the Event
              Catalog stretches to fill the row height, aligning its bottom with the sandbox card. */}
          <div ref={controlsColRef} className="order-1 lg:col-span-1 xl:col-span-1 flex flex-col gap-3 sm:gap-4 overflow-hidden">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="subsection-title flex items-center gap-2">
                <Activity className="h-4 w-4 flex-shrink-0" />
                <span>Controls</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2">
                <Button
                  ref={advanceBtnRef}
                  onClick={handleAdvanceClock}
                  variant="info"
                  className={`flex items-center gap-2 text-xs sm:text-sm w-full ${tourButton === "advance" ? "tour-target-btn" : ""}`}
                >
                  <Redo2 className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Advance Clock</span>
                  <span className="sm:hidden">Clock</span>
                </Button>
                <Button
                  ref={revertBtnRef}
                  onClick={handleStepBack}
                  disabled={historyLength === 0}
                  variant="info"
                  className={`flex items-center gap-2 text-xs sm:text-sm w-full ${tourButton === "revert" ? "tour-target-btn" : ""}`}
                >
                  <Undo2 className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                  Revert Clock
                </Button>
                <Button
                  onClick={handleReset}
                  variant="outline"
                  className="flex items-center gap-2 bg-transparent text-xs sm:text-sm w-full"
                >
                  <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600 flex-shrink-0" />
                  Reset
                </Button>
                <Button
                  ref={createBtnRef}
                  onClick={handleCreateProcess}
                  variant="ready"
                  className={`text-xs sm:text-sm w-full ${tourButton === "create" ? "tour-target-btn" : ""}`}
                >
                  <span className="hidden sm:inline">Create Process</span>
                  <span className="sm:hidden">Create</span>
                </Button>
              </div>

            </CardContent>
          </Card>

          {/* Event Catalog — dedicated section directly below Controls,
              listing every event type the engine can emit. */}
          <Card className="flex-1 min-h-0">
            <CardHeader className="pb-3">
              <CardTitle className="subsection-title flex items-center gap-2">
                <ListTree className="h-4 w-4 flex-shrink-0" />
                <span>Event Catalog</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground cursor-help flex-shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Reference list of every event type that can appear in Event Requests, with the
                      transition each one enables.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0">
              {/* Fills the capped column height and scrolls internally (min-h-0 lets the flex
                  item shrink so overflow-y-auto engages instead of the column clipping). */}
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
                {EVENT_CATALOG.map((entry) => (
                  <div key={entry.name} className={`rounded border p-2 text-xs ${entry.color}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold break-words">{entry.name}</span>
                      <Badge variant="outline" className="text-[10px] flex-shrink-0">
                        {entry.type}
                      </Badge>
                    </div>
                    <div className="break-words mt-0.5">{entry.description}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          </div>

          {/* Main Simulation Area */}
          <Card ref={sandboxCardRef} className="lg:col-span-1 xl:col-span-2 border-2 border-green-200 relative overflow-hidden order-2 lg:order-2">
            {alert && (
              <div className="absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 z-10">
                <Alert
                  className={`border-2 shadow-lg ${
                    alert.type === "error"
                      ? "border-red-200 bg-red-50"
                      : alert.type === "success"
                        ? "border-green-200 bg-green-50"
                        : "border-blue-200 bg-blue-50"
                  }`}
                >
                  <AlertCircle
                    className={`h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0 ${
                      alert.type === "error"
                        ? "text-red-600"
                        : alert.type === "success"
                          ? "text-green-600"
                          : "text-blue-600"
                    }`}
                  />
                  <AlertDescription
                    className={`text-xs sm:text-sm break-words ${
                      alert.type === "error"
                        ? "text-red-800"
                        : alert.type === "success"
                          ? "text-green-800"
                          : "text-blue-800"
                    }`}
                  >
                    {alert.message}
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5 flex-shrink-0" />
                <span className="panel-title flex items-center gap-1 flex-1 min-w-0">
                  <span className="break-words">Process Life Cycle Sandbox</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground cursor-help flex-shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>
                        An interactive view of process states and event-driven transitions. A process can be
                        selected and moved between states, and the display updates as the clock advances.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </span>
                {/* Current Time lives in the display region, not in Controls */}
                <span className="flex items-center gap-2 flex-shrink-0">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <span className="item-label text-muted-foreground">Current Time</span>
                  <span className="text-lg sm:text-xl font-mono font-bold text-blue-600">
                    {simulationState.currentTime}
                  </span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-hidden">
              {/* Two independent columns. The lanes (right) drive the height; the left column
                  stretches to match. The Event Requests box has its own fixed, scrollable
                  height so a growing event list never affects the lane rows, and the diagram
                  fills the remainder so it still bottoms out with the lanes. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 sm:items-stretch">
                {/* Left column: Event Requests + Valid Transitions.
                    On phones (< sm) this wrapper uses `display: contents` so its children join the
                    parent grid directly — that lets `order` interleave them with Processes to stack
                    Event Requests → Processes → Valid Transitions. At sm+ it's the normal flex column
                    (desktop layout unchanged). */}
                <div className="contents sm:flex flex-col gap-4 min-w-0 h-full">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="subsection-title">Event Requests</h3>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground cursor-help flex-shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          The events currently waiting to be acted on. Selecting an event enables the matching
                          transition for the process it targets.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Fixed-height, scrollable event list — does not grow the layout.
                      Height tuned so the box bottom border aligns with the Ready lane bottom. */}
                  <div className="flex-shrink-0 rounded-lg p-2 bg-gray-100">
                    <div ref={eventQueueRef} className="h-[10.5625rem] overflow-y-auto space-y-2 event-queue-container rounded-lg p-2">
                      {activeEvents.length === 0 ? (
                        <div className="h-full flex items-center text-muted-foreground text-xs">No active events</div>
                      ) : (
                        activeEvents.map((event) => {
                          const isTourTarget =
                            tourStepObj?.target.kind === "event" &&
                            event.name === tourStepObj.target.event &&
                            event.processId === TOUR_PID
                          return (
                          <div
                            key={event.id}
                            ref={isTourTarget ? eventChipRef : undefined}
                            className={`p-2 rounded-lg border cursor-pointer transition-all hover:shadow-md text-xs flex-shrink-0 ${getEventColor(event)} ${
                              simulationState.selectedEvent === event.id ? "ring-2 ring-blue-500 ring-inset" : ""
                            } ${isTourTarget ? "tour-target" : ""}`}
                            onClick={() => handleEventSelect(event.id)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-xs break-words">{event.name}</div>
                                <div className="text-xs break-words">
                                  Process: P{event.processId} | Time: {event.time}
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs flex-shrink-0">
                                {event.type}
                              </Badge>
                            </div>
                          </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* Valid Transitions diagram — fills the remaining height. Click to enlarge.
                      max-sm:order-last moves both Valid Transitions pieces below Processes on phones
                      (see the left-column note); inert at sm+. sm:-mt-0.5 trims 2px off the gap
                      above it (between Event Requests and Valid Transitions) on desktop only. */}
                  <div className="flex items-center gap-2 min-w-0 flex-shrink-0 max-sm:order-last sm:-mt-0.5">
                    <Network className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <h3 className="subsection-title">Valid Transitions</h3>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground cursor-help flex-shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          The transitions a process is allowed to make. An attempt that is not an arrow on this
                          diagram is rejected and recorded as an invalid attempt.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDiagramZoomed(true)}
                    aria-label="Enlarge the Valid Transitions diagram"
                    className="flex-1 min-h-[9.375rem] cursor-zoom-in overflow-hidden rounded-lg border border-gray-200 bg-white p-1 transition-colors hover:border-blue-400 hover:ring-2 hover:ring-inset hover:ring-blue-300 max-sm:order-last sm:-mt-1"
                  >
                    <ProcessStateDiagram />
                  </button>
                </div>

                {/* Right column: Processes and Current State */}
                <div ref={lanesWrapRef} className="relative flex flex-col gap-4 min-w-0 h-full">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="subsection-title">Processes and Current State</h3>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground cursor-help flex-shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          Each process shown in its current state — Ready, CPU, I/O Wait, or Terminated.
                          Drag a process onto another lane to move it (the move is still validated).
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Tour drag hint: a ghost P0 chip floats between the two real lanes for the
                      current transition step, demonstrating drag-to-move on the actual sections. */}
                  {tourStepObj?.target.kind === "drag" && hintGeom ? (
                    <div
                      aria-hidden
                      className="drag-hint-ghost pointer-events-none absolute left-0 top-0 z-20 flex items-center"
                      style={{
                        ["--hx0" as string]: `${hintGeom.x0}px`,
                        ["--hy0" as string]: `${hintGeom.y0}px`,
                        ["--hx1" as string]: `${hintGeom.x1}px`,
                        ["--hy1" as string]: `${hintGeom.y1}px`,
                        // --hc0 = picked-up (source-state) colour, --hc1 = dropped (target-state) colour.
                        ["--hc0" as string]: STATE_COLOR[tourStepObj.target.from],
                        ["--hc1" as string]: STATE_COLOR[tourStepObj.target.to],
                      } as CSSProperties}
                    >
                      <span className="drag-hint-chip-color rounded px-2 py-0.5 text-xs font-bold text-white shadow-lg">
                        P0
                      </span>
                      <MousePointer2 className="-ml-1 mt-3 h-3.5 w-3.5 fill-gray-800 text-gray-800" />
                    </div>
                  ) : null}

                  {/* CPU lane */}
                  <div className="rounded-lg p-2 bg-gray-100 overflow-hidden">
                    <h4 className="item-label mb-2 text-green-600">CPU (running)</h4>
                  <div
                    ref={cpuLaneRef}
                    data-lane-state="running"
                    className={`min-h-8 sm:min-h-10 rounded-lg p-1 sm:p-2 flex flex-wrap gap-1 overflow-hidden transition-colors ${laneHighlight("running")}`}
                  >
                    {runningProcesses.length === 0 ? (
                      <div className="text-muted-foreground text-xs">No process running</div>
                    ) : (
                      runningProcesses.map((process) => renderChip(process))
                    )}
                  </div>
                </div>

                {/* Ready lane */}
                <div className="rounded-lg p-2 bg-gray-100 overflow-hidden">
                  <h4 className="item-label mb-2 text-sky-600">Ready</h4>
                  <div
                    ref={readyLaneRef}
                    data-lane-state="ready"
                    className={`min-h-8 sm:min-h-10 rounded-lg p-1 sm:p-2 flex flex-wrap gap-1 overflow-hidden transition-colors ${laneHighlight("ready")}`}
                  >
                    {readyProcesses.length === 0 ? (
                      <div className="text-muted-foreground text-xs">No processes ready</div>
                    ) : (
                      readyProcesses.map((process) => renderChip(process))
                    )}
                  </div>
                </div>

                {/* I/O wait lane */}
                <div className="rounded-lg p-2 bg-gray-100 overflow-hidden">
                  <h4 className="item-label mb-2 text-yellow-600">I/O wait</h4>
                  <div
                    ref={blockedLaneRef}
                    data-lane-state="blocked"
                    className={`min-h-8 sm:min-h-10 rounded-lg p-1 sm:p-2 flex flex-wrap gap-1 overflow-hidden transition-colors ${laneHighlight("blocked")}`}
                  >
                    {blockedProcesses.length === 0 ? (
                      <div className="text-muted-foreground text-xs">No processes in I/O</div>
                    ) : (
                      blockedProcesses.map((process) => renderChip(process))
                    )}
                  </div>
                </div>

                {/* Terminated lane */}
                <div className="rounded-lg p-2 bg-gray-100 overflow-hidden">
                  <h4 className="item-label mb-2 text-red-600">Terminated</h4>
                  <div
                    ref={terminatedLaneRef}
                    data-lane-state="terminated"
                    className={`min-h-8 sm:min-h-10 rounded-lg p-1 sm:p-2 flex flex-wrap gap-1 overflow-hidden transition-colors ${laneHighlight("terminated")}`}
                  >
                    {terminatedProcesses.length === 0 ? (
                      <div className="text-muted-foreground text-xs">No terminated processes</div>
                    ) : (
                      terminatedProcesses.map((process) => renderChip(process))
                    )}
                  </div>
                </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Metrics & Log — self-start so it sizes to its content; it's the shortest card and
              the JS equal-height effect caps the other two to match its bottom (xl only). */}
          <Card ref={metricsCardRef} className="lg:col-span-2 xl:col-span-1 order-3 self-start">
            <CardHeader className="pb-3">
              <CardTitle className="subsection-title flex items-center gap-2">
                <BarChart3 className="h-4 w-4 flex-shrink-0" />
                <span className="flex items-center gap-1 flex-1 min-w-0">
                  <span className="break-words">Metrics & Log</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground cursor-help flex-shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>
                        Transition counts and qualitative state-time tracking that support learning analysis.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Valid Attempts</span>
                  <span className="font-mono font-semibold text-green-600">{simulationState.metrics.validTransitions}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Invalid Attempts</span>
                  <span className="font-mono font-semibold text-red-600">{simulationState.metrics.invalidAttempts}</span>
                </div>
              </div>

              {/* State Presence (Relative) — dedicated scrollable section (styled like Action Log)
                  so the panel keeps a fixed height no matter how many processes are created. */}
              <div className="space-y-2 border-t pt-3">
                <div className="item-label flex items-center gap-2">
                  State Presence (Relative)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground cursor-help flex-shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Relative time each process has spent in each state, measured in simulation ticks. This is a qualitative indicator, not a performance measure.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="h-32 sm:h-48 overflow-y-auto space-y-2 text-xs rounded-lg p-2 bg-gray-100">
                  {Object.keys(simulationState.metrics.stateTimeTracking).length === 0 ? (
                    <p className="h-full flex items-center text-xs text-muted-foreground">No process data yet. State presence appears once a process exists and the clock advances.</p>
                  ) : (
                    Object.entries(simulationState.metrics.stateTimeTracking).map(([processName, times]) => {
                      const t = times as { ready: number; running: number; blocked: number }
                      const total = t.ready + t.running + t.blocked
                      return (
                        <div key={processName} className="rounded p-2 bg-white">
                          <div className="font-semibold mb-1">{processName}</div>
                          {total > 0 && (
                            <div className="w-full h-3 rounded-full overflow-hidden flex mb-1">
                              {t.ready > 0 && (
                                <div className="bg-sky-500 h-full" style={{ width: `${(t.ready / total) * 100}%` }} />
                              )}
                              {t.running > 0 && (
                                <div className="bg-green-500 h-full" style={{ width: `${(t.running / total) * 100}%` }} />
                              )}
                              {t.blocked > 0 && (
                                <div className="bg-yellow-500 h-full" style={{ width: `${(t.blocked / total) * 100}%` }} />
                              )}
                            </div>
                          )}
                          <div className="grid grid-cols-3 gap-1">
                            <div className="text-center">
                              <div className="text-sky-600 font-mono">{t.ready}</div>
                              <div className="text-muted-foreground">Ready</div>
                            </div>
                            <div className="text-center">
                              <div className="text-green-600 font-mono">{t.running}</div>
                              <div className="text-muted-foreground">CPU</div>
                            </div>
                            <div className="text-center">
                              <div className="text-yellow-600 font-mono">{t.blocked}</div>
                              <div className="text-muted-foreground">I/O</div>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="item-label flex items-center gap-2">
                  Action Log
                </div>
                <div className="h-32 sm:h-48 overflow-y-auto space-y-1 action-log-container rounded-lg p-2 bg-gray-100">
                  {simulationState.actionLog.length === 0 ? (
                    <div className="h-full flex items-center text-muted-foreground text-xs">
                      No activity yet. Actions and events appear here once the sandbox is in use.
                    </div>
                  ) : (
                    simulationState.actionLog
                      .slice(-20)
                      .reverse()
                      .map((log, index) => (
                        <div
                          key={index}
                          className={`text-xs p-2 rounded overflow-hidden ${
                            log.type === "error"
                              ? "bg-red-50 text-red-800 border border-red-200"
                              : log.type === "success"
                                ? "bg-green-50 text-green-800 border border-green-200"
                                : "bg-white text-gray-800 border border-gray-200"
                          }`}
                        >
                          <span className="font-mono">[{log.time}]</span>{" "}
                          <span className="break-words">{log.message}</span>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        {/* System States Panel */}
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="subsection-title flex items-center gap-2">
              <History className="h-4 w-4 flex-shrink-0" />
              <span className="flex items-center gap-1 flex-1">
                System States
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground cursor-help flex-shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>A record of each process's transition history and of every invalid transition that has been attempted.</p>
                  </TooltipContent>
                </Tooltip>
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" aria-label="Export data">
                    <Download className="h-3 w-3" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="text-xs">Action Log</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => exportActionLogCSV(simulationState.actionLog)} className="text-xs">
                    Action Log (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportActionLogJSON(simulationState.actionLog)} className="text-xs">
                    Action Log (JSON)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">State History</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() =>
                      exportStateHistoryCSV(
                        simulationState.processes.filter((p: SimulationProcess) => p.history.length > 0),
                      )
                    }
                    className="text-xs"
                  >
                    State History (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      exportStateHistoryJSON(
                        simulationState.processes.filter((p: SimulationProcess) => p.history.length > 0),
                      )
                    }
                    className="text-xs"
                  >
                    State History (JSON)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Invalid Transition Attempts — recorded so the Evaluation engine can score mistakes */}
              <div>
                <h4 className="item-label mb-2">Invalid Transition Attempts</h4>
                <div className="rounded-lg p-3 bg-gray-100 space-y-2 max-h-48 overflow-y-auto">
                  {simulationState.metrics.invalidTransitionLog.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No invalid transitions attempted. Rejected moves are recorded here with the reason.</p>
                  ) : (
                    simulationState.metrics.invalidTransitionLog
                      .slice()
                      .reverse()
                      .map((rec, i) => (
                        <div key={i} className="text-xs border-b border-gray-200 pb-2 last:border-b-0 last:pb-0">
                          <div className="flex items-center gap-1 flex-wrap mb-0.5">
                            <span className="font-mono">[{rec.time}]</span>
                            <span className="font-mono font-semibold">{rec.processName}</span>
                            <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">{rec.from}</span>
                            <span className="text-gray-400">{"→"}</span>
                            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700">{rec.to}</span>
                          </div>
                          <div className="text-red-700 break-words">{rec.reason}</div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* State Transition History */}
              <div>
                <h4 className="item-label mb-2">State Transition History</h4>
                <div className="rounded-lg p-3 bg-gray-100 space-y-2 max-h-48 overflow-y-auto">
                  {simulationState.processes.filter((p: SimulationProcess) => p.history.length > 0).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No transitions recorded yet. Each process's path through the life cycle appears here.</p>
                  ) : (
                    simulationState.processes
                      .filter((p: SimulationProcess) => p.history.length > 0)
                      .map((p: SimulationProcess) => (
                        <div key={p.id} className="text-xs border-b border-gray-200 pb-2 last:border-b-0 last:pb-0">
                          <div className="font-mono font-semibold mb-1">{p.name}</div>
                          <div className="flex flex-wrap items-center gap-1">
                            {p.history.map((state, i) => (
                              <span key={i} className="flex items-center gap-1">
                                <span className={`px-1.5 py-0.5 rounded text-white text-xs ${
                                  state === "ready" ? "bg-sky-500" :
                                  state === "running" ? "bg-green-500" :
                                  state === "blocked" ? "bg-yellow-500" :
                                  state === "terminated" ? "bg-red-500" : "bg-gray-300"
                                }`}>
                                  {state === "ready" ? "Ready" : state === "running" ? "CPU" : state === "blocked" ? "I/O" : state === "terminated" ? "Term" : state}
                                </span>
                                {i < p.history.length - 1 && <span className="text-gray-400">{"\u2192"}</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Click-to-zoom overlay for the Valid attempts diagram. Rendered as a fixed
            full-screen layer so it sits above every panel regardless of stacking context. */}
        {diagramZoomed && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
            onClick={() => setDiagramZoomed(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Valid Transitions diagram, enlarged"
          >
            <div
              className="bg-white rounded-xl shadow-2xl p-4 w-full max-w-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Network className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <h3 className="subsection-title">Valid Transitions</h3>
                </div>
                <Button size="sm" variant="outline" onClick={() => setDiagramZoomed(false)}>
                  Close
                </Button>
              </div>
              <div className="w-full aspect-[676/296]">
                <ProcessStateDiagram />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating drag preview — follows the pointer (mouse or finger). pointer-events:none so
          it never intercepts hit-testing for the lane underneath. Portaled to <body> so no
          overflow-hidden / transformed ancestor can clip it. */}
      {dragProcess && typeof document !== "undefined" &&
        createPortal(
          <div
            className={`pointer-events-none fixed z-[100] px-2 py-1 rounded text-white font-bold text-xs shadow-lg ${getProcessColor(dragProcess.state)}`}
            style={{ left: dragPos.x, top: dragPos.y, transform: "translate(-50%, -50%)" }}
          >
            {dragProcess.name}
          </div>,
          document.body,
        )}

      {/* Guided-tour instruction popup — fixed position next to the current target control.
          Portaled to <body> so it floats over neighbouring cards without being clipped. */}
      {tourStepObj && tourPopup && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-[200] rounded-lg border border-sky-300 bg-white p-3 text-xs shadow-xl"
            style={{
              left: tourPopup.left,
              width: tourPopup.width,
              ...(tourPopup.top !== null
                ? { top: tourPopup.top, transform: "translateY(-50%)" }
                : { bottom: tourPopup.bottom ?? 8 }),
            }}
          >
            {/* Caret (tooltip nub): a 10px square rotated 45° with the popup's border on its two
                outward edges + white fill, half-overlapping the edge so a diamond pokes out toward
                the target. Sits at the popup's vertical centre, which is aligned to the target. */}
            {tourPopup.caret && (
              <span
                aria-hidden
                className="absolute h-2.5 w-2.5 bg-white"
                style={{
                  top: "50%",
                  transform: "translateY(-50%) rotate(45deg)",
                  ...(tourPopup.caret === "left"
                    ? { left: -5, borderLeft: "1px solid #7dd3fc", borderBottom: "1px solid #7dd3fc" }
                    : { right: -5, borderTop: "1px solid #7dd3fc", borderRight: "1px solid #7dd3fc" }),
                }}
              />
            )}
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold text-sky-700">
                Guided tour · {tourStep + 1}/{tourSteps.length}
              </span>
            </div>
            <p className="text-gray-700">{tourStepObj.message}</p>
            {/* Sandbox tour can be dismissed; the scenario tour (external cues) cannot. */}
            {!usingExternalTour && (
              <button
                type="button"
                onClick={() => setTourActive(false)}
                className="mt-2 text-[11px] text-gray-500 underline hover:text-gray-700"
              >
                Stop guide
              </button>
            )}
          </div>,
          document.body,
        )}
    </TooltipProvider>
  )
})
ProcessSchedulingSimulation.displayName = "ProcessSchedulingSimulation"
