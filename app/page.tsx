"use client"

import { Fragment, useState, useMemo, useEffect, useCallback } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { ProcessSchedulingSimulation, SIMULATION_SHORTCUT_DEFS } from "@/components/process-scheduling-simulation"
import { GuidedScenarios, SCENARIO_SHORTCUT_DEFS } from "@/components/guided-scenarios"
import { ScenarioEvaluation } from "@/components/scenario-evaluation"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { KeyboardShortcutsDialog } from "@/components/keyboard-shortcuts-dialog"
import { useKeyboardShortcuts, type ShortcutAction, type ShortcutDef } from "@/hooks/use-keyboard-shortcuts"
import {
  loadPersistedState,
  savePersistedState,
  clearPersistedState,
  type PersistedState,
} from "@/hooks/use-persistence"
import { ArrowRight, Cpu, RotateCcw } from "lucide-react"
import { Card } from "@/components/ui/card"
import { LessonsTab } from "@/components/lessons"
import { AnalyticsDashboard } from "@/components/analytics-dashboard"
import {
  record,
  usePathMode,
  clearAllRecords,
  clearLearner,
  getLearner,
  setLearnerName,
} from "@/lib/learning-records"
import {
  experimentGateOpen,
  resetAllProgress,
  syncExperimentProgress,
  useProgressVersion,
} from "@/lib/lesson-progress"

const EXPERIMENT_TABS = ["sandbox", "guided-scenarios", "evaluation"]

// Session-entry gate: confirmed once per browser session (survives reloads via
// sessionStorage) so the very first record() of a session already carries the
// learner's confirmed name.
const SESSION_ENTERED_KEY = "os-vlab-session-entered-v1"

// The lab's state palette (mirrors STATE_CHIP_COLORS in lib/lesson-plan.ts).
// `color` fills the active chip (solid + white text); `tint` styles inactive
// chips dark-on-light like the app's badges, so labels stay readable on
// bright screens (whole-chip opacity washed the white text out).
const ENTRY_STRIP: { label: string; color: string; tint: string }[] = [
  { label: "New", color: "#64748b", tint: "bg-slate-100 text-slate-700" },
  { label: "Ready", color: "#0ea5e9", tint: "bg-sky-100 text-sky-800" },
  { label: "CPU", color: "#22c55e", tint: "bg-green-100 text-green-800" },
  { label: "I/O Wait", color: "#ca8a04", tint: "bg-amber-100 text-amber-800" },
  { label: "Terminated", color: "#ef4444", tint: "bg-red-100 text-red-800" },
]

function SessionEntry({ initialName, onConfirm }: { initialName: string; onConfirm: (name: string) => void }) {
  const [name, setName] = useState(initialName)
  const returning = initialName !== ""
  const shown = name.trim()
  return (
    <Card className="mx-auto mt-8 max-w-md overflow-hidden border-t-4 border-t-sky-500 p-6">
      {/* You are the newest process on this machine — the New chip carries your name live. */}
      <div className="mb-1 flex flex-wrap items-center gap-1.5" aria-hidden>
        {ENTRY_STRIP.map((s, i) => (
          <Fragment key={s.label}>
            {i > 0 && <span className="text-xs text-muted-foreground/60">→</span>}
            <span
              className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium ${
                i === 0 ? "animate-pulse text-white" : s.tint
              }`}
              style={i === 0 ? { backgroundColor: s.color } : undefined}
            >
              {i === 0 ? shown || "you" : s.label}
            </span>
          </Fragment>
        ))}
      </div>
      <p className="mb-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        ↑ you are here
      </p>

      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Cpu className="h-5 w-5 text-sky-600" /> Who&apos;s learning today?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        This lab teaches how an operating system runs <strong className="text-foreground">processes</strong> — and
        right now <em>you</em> are the newest process on this machine, sitting in{" "}
        <strong style={{ color: "#64748b" }}>New</strong>. Every process needs a name before the OS will admit it.
        Name yours to join the <strong style={{ color: "#0ea5e9" }}>Ready</strong> queue.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Your name is attached to every learning record this session produces and shown in the Analytics tab.
      </p>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (shown) onConfirm(shown)
        }}
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name your process…"
          aria-label="Learner name"
          className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
        />
        {returning && (
          <p className="text-xs text-muted-foreground">Not you? Edit the name above before continuing.</p>
        )}
        <Button type="submit" variant="ready" disabled={!shown}>
          {returning && shown === initialName ? (
            `Continue as ${initialName}`
          ) : (
            <>Admit {shown ? `“${shown}”` : "me"} to the Ready queue</>
          )}
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onConfirm("Learner")}>
          Continue anonymously as &ldquo;Learner&rdquo;
        </Button>
      </form>
    </Card>
  )
}

export default function OSVirtualLab() {
  const [hydrated, setHydrated] = useState(false)
  const [currentTab, setCurrentTab] = useState("lessons")
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true)
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false)
  const [evaluationResults, setEvaluationResults] = useState<any[]>([])
  const [completedScenarios, setCompletedScenarios] = useState<string[]>([])
  const [lockNotice, setLockNotice] = useState<string | null>(null)
  const [entered, setEntered] = useState(false)
  const [storedName, setStoredName] = useState("")

  // Pedagogy layer: path mode + lesson progress drive tab gating.
  const pathMode = usePathMode()
  useProgressVersion()
  const gateOpen = experimentGateOpen(pathMode)

  const handleTabChange = useCallback(
    (tab: string) => {
      if (!entered) return // session-entry gate: no navigation (or records) before a name is confirmed
      if (EXPERIMENT_TABS.includes(tab) && !gateOpen) {
        record("blocked", { type: "tab", id: tab, name: tab }, { missing: "L3+L4" })
        setLockNotice(
          "Locked in fully guided mode — the Scenarios, Sandbox and Evaluation tabs unlock once lessons L3 and L4 are complete. (A less guided path can be chosen in the Lessons tab.)",
        )
        return
      }
      setLockNotice(null)
      record("viewed", { type: "tab", id: tab, name: tab }, {})
      setCurrentTab(tab)
    },
    [gateOpen, entered],
  )

  // Experiment node ↔ guided scenarios: completing the designated scenarios
  // passes the experiment challenges and, eventually, the experiment itself.
  useEffect(() => {
    if (!hydrated) return
    syncExperimentProgress(completedScenarios)
  }, [hydrated, completedScenarios])

  // Hydrate from localStorage on mount
  useEffect(() => {
    const saved = loadPersistedState()
    if (saved) {
      setCurrentTab(saved.currentTab)
      setShortcutsEnabled(saved.shortcutsEnabled)
      setEvaluationResults(saved.evaluationResults ?? [])
      setCompletedScenarios(saved.guidedScenariosProgress?.completedScenarios ?? [])
    }
    // Session entry: reloads mid-session skip the prompt; new sessions get it,
    // pre-filled with any name stored from a previous visit.
    const name = getLearner().name
    setStoredName(name === "Learner" ? "" : name)
    try {
      if (sessionStorage.getItem(SESSION_ENTERED_KEY)) setEntered(true)
    } catch {}
    setHydrated(true)
  }, [])

  const handleEnter = useCallback((name: string) => {
    setLearnerName(name) // exactly once, before any tab content (and its record() calls) mounts
    try {
      sessionStorage.setItem(SESSION_ENTERED_KEY, "1")
    } catch {}
    setEntered(true)
  }, [])

  // Auto-save on meaningful state changes (debounced)
  const getStateForSave = useCallback((): PersistedState => ({
    storageVersion: 1,
    currentTab,
    shortcutsEnabled,
    evaluationResults,
    tutorialProgress: { currentStep: 0, completedSteps: [] },
    guidedScenariosProgress: { completedScenarios },
    savedAt: new Date().toISOString(),
  }), [currentTab, shortcutsEnabled, evaluationResults, completedScenarios])

  useEffect(() => {
    if (!hydrated) return
    const timer = setTimeout(() => {
      savePersistedState(getStateForSave())
    }, 500)
    return () => clearTimeout(timer)
  }, [hydrated, getStateForSave])

  const handleResetAll = () => {
    if (window.confirm("This will clear all saved data including evaluation results, scenario progress, and preferences. Continue?")) {
      clearPersistedState()
      resetAllProgress()
      clearAllRecords()
      clearLearner()
      try {
        sessionStorage.removeItem(SESSION_ENTERED_KEY)
      } catch {}
      setEntered(false)
      setStoredName("")
      setCurrentTab("lessons")
      setShortcutsEnabled(true)
      setEvaluationResults([])
      setCompletedScenarios([])
    }
  }

  const shortcuts: ShortcutAction[] = useMemo(
    () => [
      {
        key: "1",
        alt: true,
        label: "Sandbox Tab",
        description: "Switch to the Sandbox tab",
        category: "Navigation",
        action: () => handleTabChange("sandbox"),
      },
      {
        key: "2",
        alt: true,
        label: "Scenarios Tab",
        description: "Switch to the Guided Scenarios tab",
        category: "Navigation",
        action: () => handleTabChange("guided-scenarios"),
      },
      {
        key: "3",
        alt: true,
        label: "Evaluation Tab",
        description: "Switch to the Evaluation tab",
        category: "Navigation",
        action: () => handleTabChange("evaluation"),
      },
      {
        key: "4",
        alt: true,
        label: "Lessons Tab",
        description: "Switch to the Lessons tab",
        category: "Navigation",
        action: () => handleTabChange("lessons"),
      },
      {
        key: "5",
        alt: true,
        label: "Analytics Tab",
        description: "Switch to the Analytics tab",
        category: "Navigation",
        action: () => handleTabChange("analytics"),
      },
      {
        key: "?",
        shift: true,
        label: "Shortcuts Dialog",
        description: "Open this keyboard shortcuts reference",
        category: "Navigation",
        action: () => setShortcutsDialogOpen((prev) => !prev),
      },
    ],
    [handleTabChange],
  )

  const allShortcutDefs: ShortcutDef[] = useMemo(
    () => [...shortcuts, ...SIMULATION_SHORTCUT_DEFS, ...SCENARIO_SHORTCUT_DEFS],
    [shortcuts],
  )

  useKeyboardShortcuts(shortcuts, shortcutsEnabled)

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border bg-card">
          <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4 max-w-7xl 2xl:max-w-[90rem] 3xl:max-w-[104rem] 4xl:max-w-[120rem] 5xl:max-w-[150rem]">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">
                Process Life Cycle Management
              </h1>
              <div className="flex items-center gap-2">
                <KeyboardShortcutsDialog
                  shortcuts={allShortcutDefs}
                  enabled={shortcutsEnabled}
                  onToggle={setShortcutsEnabled}
                  open={shortcutsDialogOpen}
                  onOpenChange={setShortcutsDialogOpen}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={handleResetAll} className="text-xs sm:text-sm gap-1" aria-label="Reset all saved data">
                      <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Reset All</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Clear all saved data and return to initial state</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-6 max-w-7xl 2xl:max-w-[90rem] 3xl:max-w-[104rem] 4xl:max-w-[120rem] 5xl:max-w-[150rem]">
          {!hydrated ? null : !entered ? (
            <SessionEntry initialName={storedName} onConfirm={handleEnter} />
          ) : (
          <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-4 sm:mb-6 h-auto bg-gray-300 gap-1 p-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger
                    value="lessons"
                    className={`text-xs sm:text-sm px-1 sm:px-3 py-2 break-words transition-colors ${
                      currentTab === "lessons"
                        ? "bg-white text-black border border-blue-300 shadow-sm"
                        : "bg-gray-400/60 text-gray-800 hover:bg-gray-400"
                    }`}
                  >
                    Lessons
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Prerequisite lessons in small tasks, each closed by a validation. In fully guided
                    mode, L3 and L4 unlock the experiment tabs.
                  </p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger
                    value="guided-scenarios"
                    className={`text-xs sm:text-sm px-1 sm:px-3 py-2 break-words transition-colors ${
                      currentTab === "guided-scenarios"
                        ? "bg-white text-black border border-blue-300 shadow-sm"
                        : "bg-gray-400/60 text-gray-800 hover:bg-gray-400"
                    }`}
                  >
                    <span className="hidden sm:inline">Scenarios</span>
                    <span className="sm:hidden">Guided</span>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Step-by-step guided scenarios pairing instructions with knowledge checks in a live
                    simulation.
                  </p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger
                    value="sandbox"
                    className={`text-xs sm:text-sm px-1 sm:px-3 py-2 break-words transition-colors ${
                      currentTab === "sandbox"
                        ? "bg-white text-black border border-blue-300 shadow-sm"
                        : "bg-gray-400/60 text-gray-800 hover:bg-gray-400"
                    }`}
                  >
                    <span className="hidden sm:inline">Sandbox</span>
                    <span className="sm:hidden">Sand</span>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    A free-form workspace where processes can be created and driven through every
                    life-cycle state, with live events, log and metrics.
                  </p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger
                    value="evaluation"
                    className={`text-xs sm:text-sm px-1 sm:px-3 py-2 break-words transition-colors ${
                      currentTab === "evaluation"
                        ? "bg-white text-black border border-blue-300 shadow-sm"
                        : "bg-gray-400/60 text-gray-800 hover:bg-gray-400"
                    }`}
                  >
                    <span className="hidden sm:inline">Evaluation</span>
                    <span className="sm:hidden">Eval</span>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Timed, scored assessments of states, transitions and events, with an exportable
                    breakdown per attempt.
                  </p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger
                    value="analytics"
                    className={`text-xs sm:text-sm px-1 sm:px-3 py-2 break-words transition-colors ${
                      currentTab === "analytics"
                        ? "bg-white text-black border border-blue-300 shadow-sm"
                        : "bg-gray-400/60 text-gray-800 hover:bg-gray-400"
                    }`}
                  >
                    Analytics
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Learning analytics from the record stream: progression funnel, hardest validations,
                    misconception signals, time on task, and the raw event log.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TabsList>

            {lockNotice && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                {lockNotice}
              </div>
            )}

            <div className="overflow-hidden">
              <TabsContent value="lessons" className="mt-0">
                <LessonsTab completedScenarios={completedScenarios} onNavigate={handleTabChange} />
              </TabsContent>

              <TabsContent value="analytics" className="mt-0">
                <AnalyticsDashboard />
              </TabsContent>

              <TabsContent value="sandbox" className="mt-0" forceMount>
                <div className={currentTab !== "sandbox" ? "hidden" : ""}>
                  <ProcessSchedulingSimulation
                    shortcutsEnabled={shortcutsEnabled}
                    isActiveTab={currentTab === "sandbox"}
                  />
                </div>
              </TabsContent>

              <TabsContent value="guided-scenarios" className="mt-0" forceMount>
                <div className={currentTab !== "guided-scenarios" ? "hidden" : ""}>
                  <GuidedScenarios
                    persistedCompletedScenarios={completedScenarios}
                    onCompletedScenariosChange={setCompletedScenarios}
                    shortcutsEnabled={shortcutsEnabled}
                    isActiveTab={currentTab === "guided-scenarios"}
                  />
                </div>
              </TabsContent>

              <TabsContent value="evaluation" className="mt-0" forceMount>
                <div className={currentTab !== "evaluation" ? "hidden" : ""}>
                  <ScenarioEvaluation
                    persistedResults={evaluationResults}
                    onResultsChange={setEvaluationResults}
                  />
                </div>
              </TabsContent>
            </div>
          </Tabs>
          )}
        </main>
      </div>
    </TooltipProvider>
  )
}
