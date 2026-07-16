"use client"

/**
 * Lesson plan for the Process Life Cycle experiment.
 *
 * This module is pure data: the course objectives, the prerequisite lesson
 * graph, every task with its validation items, the experiment challenges
 * (mapped onto existing guided scenarios), and the summative mastery check.
 * The player components (components/lessons.tsx) never hard-code content,
 * so scaling to other experiments means writing another plan file, not
 * another app. See design documents D1 (model) and D2 (content).
 */

export type ItemType = "mcq" | "multi" | "order"

export interface QuizItem {
  id: string
  lo: string
  type: ItemType
  /** Render options as state-coloured chips (state-prediction items). */
  chips?: boolean
  q: string
  options: string[]
  /** mcq: keyed index · multi: keyed index set · order: correct sequence of option indices */
  answer: number | number[]
  expl: string
}

export interface LessonTask {
  id: string
  title: string
  content: string[] // paragraphs; **bold** supported
  keyfact: string
  validation: { id: string; items: QuizItem[] }
}

export interface LessonNode {
  id: string
  kind: "lesson"
  title: string
  prereqs: string[]
  los: string[]
  /** Learner-facing one-liner for the course-map card. LO codes and Bloom levels stay instructor-only. */
  blurb: string
  minutes: number
  tasks: LessonTask[]
}

export interface ExperimentChallenge {
  id: string
  title: string
  desc: string
  /** Completing this existing guided scenario passes the challenge. */
  scenarioId: string
  lo: string
}

export interface ExperimentNode {
  id: "EXP"
  kind: "experiment"
  title: string
  prereqs: string[]
  los: string[]
  blurb: string
  minutes: number
  challenges: ExperimentChallenge[]
}

export interface AssessmentNode {
  id: "ASMT"
  kind: "assessment"
  title: string
  prereqs: string[]
  los: string[]
  blurb: string
  minutes: number
  passScore: number
  items: QuizItem[]
}

export type CourseNode = LessonNode | ExperimentNode | AssessmentNode

export interface LearningObjective {
  id: string
  bloom: string
  text: string
}

export const LOS: LearningObjective[] = [
  { id: "LO1", bloom: "Understand", text: "Distinguish a program from a process and state what the PCB stores." },
  { id: "LO2", bloom: "Understand", text: "Name the process states in this model and describe what each means." },
  { id: "LO3", bloom: "Apply", text: "Given an event, determine the resulting state transition." },
  { id: "LO4", bloom: "Analyse", text: "Identify invalid transitions and justify why the model forbids them." },
  { id: "LO5", bloom: "Apply", text: "Trace a full life cycle including preemption and I/O; apply CPU exclusivity." },
  { id: "LO6", bloom: "Understand", text: "Explain the roles of the ready queue, scheduler, dispatcher and context switch." },
]

export const LESSONS: LessonNode[] = [
  {
    id: "L1", kind: "lesson", title: "Programs, Processes & the PCB", prereqs: [], los: ["LO1"], minutes: 8,
    blurb: "what makes a running process different from a program on disk, and the record card the OS keeps for each one",
    tasks: [
      {
        id: "T1.1", title: "A program in motion",
        content: [
          "A **program** is a passive artifact — a file of instructions sitting on disk. A **process** is that program **in execution**: instructions plus everything the OS needs to run them — a program counter, register values, memory, and open resources.",
          "Running the same editor twice yields one program but **two processes**. Each execution instance has its own private execution state, even though the code is identical.",
        ],
        keyfact: "Program = recipe on the shelf. Process = a cook actually following it, mid-way through, with their own counters and ingredients out.",
        validation: {
          id: "V1.1",
          items: [
            { id: "V1.1-Q1", lo: "LO1", type: "mcq", q: "A program becomes a process at the moment it…", options: ["is written by the programmer", "is compiled to machine code", "is loaded into memory and begins executing", "is saved to disk"], answer: 2, expl: "Compilation and storage still give you a passive file. Execution is what creates a process — code plus live state." },
            { id: "V1.1-Q2", lo: "LO1", type: "mcq", q: "Two students run the same text editor on a shared machine. How many processes exist?", options: ["One — it is the same program", "Two — each execution is its own process", "Zero until a file is saved", "It depends on the file size"], answer: 1, expl: "Each running instance has its own program counter, registers and memory — so each is a separate process." },
          ],
        },
      },
      {
        id: "T1.2", title: "The Process Control Block",
        content: [
          "The OS keeps one **Process Control Block (PCB)** per process — its identity card and save-file in one. Typical contents: process ID, current **state**, **program counter**, CPU **register** snapshot, and scheduling information such as priority.",
          "The PCB is what makes it possible to pause a process and resume it later **exactly** where it left off. Without it, every preemption would mean starting over.",
        ],
        keyfact: "Everything the simulator shows you per process — its state, its history — is bookkeeping the real OS keeps in the PCB.",
        validation: {
          id: "V1.2",
          items: [
            { id: "V1.2-Q1", lo: "LO1", type: "multi", q: "Which of these belong in the PCB?", options: ["Current process state", "Program counter", "CPU register values", "The program's source code", "Scheduling info (e.g. priority)"], answer: [0, 1, 2, 4], expl: "The PCB stores execution context and bookkeeping. Source code is the program itself — not per-execution state." },
            { id: "V1.2-Q2", lo: "LO1", type: "mcq", q: "Why must the OS save the program counter into the PCB when it takes the CPU away?", options: ["So the process can restart from the beginning", "So the process can later resume exactly where it stopped", "To count how many programs are installed", "To free up memory"], answer: 1, expl: "The saved PC (plus registers) is precisely the resume point. Restore the PCB and execution continues as if nothing happened." },
          ],
        },
      },
    ],
  },
  {
    id: "L2", kind: "lesson", title: "The Process States", prereqs: ["L1"], los: ["LO2"], minutes: 8,
    blurb: "the states a process moves through, and why waiting for the CPU is different from waiting for a device",
    tasks: [
      {
        id: "T2.1", title: "Meet the states",
        content: [
          "In this lab's model a process moves between: **New** (being created, not yet admitted), **Ready** (able to run, waiting only for the CPU), **CPU / Running** (currently executing), **I/O Wait** (blocked until a device finishes), and **Terminated** (finished).",
          "New is transient — the moment a process is admitted it appears in **Ready**, which is where the simulator's life-cycle diagram begins.",
        ],
        keyfact: "Ready ≠ Running. Ready means “I have everything I need except the CPU.”",
        validation: {
          id: "V2.1",
          items: [
            { id: "V2.1-Q1", lo: "LO2", type: "mcq", chips: true, q: "Which state means “has everything it needs except the CPU”?", options: ["New", "Ready", "I/O Wait", "Terminated"], answer: 1, expl: "Ready processes are runnable — they sit in the ready queue waiting to be dispatched." },
            { id: "V2.1-Q2", lo: "LO2", type: "mcq", q: "In the simulator, a process shown in the CPU node is — in classical OS terms — in which state?", options: ["Running", "Ready", "Blocked", "New"], answer: 0, expl: "The CPU node is the Running state: instructions are actually being executed." },
          ],
        },
      },
      {
        id: "T2.2", title: "Two kinds of waiting",
        content: [
          "Ready and I/O Wait are both “waiting”, but for different things. A **Ready** process waits for the **scheduler** to hand it the CPU. An **I/O Wait** process waits for an **external event** — a disk read, a key press — and giving it the CPU would be pointless: it has nothing to execute until the device answers.",
          "This is why blocked processes leave the competition for the CPU entirely, and why the OS keeps them in separate device queues.",
        ],
        keyfact: "CPU time given to a blocked process is wasted time. Separating the two waits is what keeps the CPU busy with useful work.",
        validation: {
          id: "V2.2",
          items: [
            { id: "V2.2-Q1", lo: "LO2", type: "mcq", chips: true, q: "A process has just asked to read a file from disk. Where does it belong while the disk works?", options: ["Ready", "CPU (Running)", "I/O Wait", "Terminated"], answer: 2, expl: "It is blocked on a device. It cannot use the CPU until the read completes." },
            { id: "V2.2-Q2", lo: "LO2", type: "mcq", q: "The key difference between Ready and I/O Wait is that…", options: ["Ready waits for the CPU; I/O Wait waits for a device or event", "there is no difference", "Ready comes after termination", "a process in I/O Wait still holds the CPU"], answer: 0, expl: "Ready = runnable, queued for the CPU. I/O Wait = not runnable until an external event occurs." },
          ],
        },
      },
    ],
  },
  {
    id: "L3", kind: "lesson", title: "Events & Transitions", prereqs: ["L2"], los: ["LO3", "LO4"], minutes: 10,
    blurb: "what triggers a state change, and which moves the model won't allow",
    tasks: [
      {
        id: "T3.1", title: "The six legal moves",
        content: [
          "State changes are triggered by **events**: **Admit** (New → Ready), **Dispatch** (Ready → CPU), **Preempt** (CPU → Ready, e.g. the timer slice expires), **I/O request** (CPU → I/O Wait), **I/O complete** (I/O Wait → Ready), and **Terminate** (CPU → Terminated).",
          "The shape is consistent: every path to the CPU goes **through Ready**, and every exit from I/O Wait returns to Ready — never straight back to the CPU.",
        ],
        keyfact: "An I/O completion earns a process the right to compete for the CPU again — not the CPU itself.",
        validation: {
          id: "V3.1",
          items: [
            { id: "V3.1-Q1", lo: "LO3", type: "mcq", chips: true, q: "P is on the CPU when the timer interrupt fires — its time slice is over. P's next state?", options: ["Ready", "I/O Wait", "Terminated", "New"], answer: 0, expl: "Preemption returns a still-runnable process to the ready queue. It did nothing wrong — it just used up its turn." },
            { id: "V3.1-Q2", lo: "LO3", type: "mcq", chips: true, q: "P is in I/O Wait and its disk read completes. P's next state?", options: ["Ready", "CPU (Running)", "Terminated", "New"], answer: 0, expl: "I/O complete → Ready. The scheduler decides when P actually runs again." },
            { id: "V3.1-Q3", lo: "LO3", type: "mcq", q: "P was in Ready; the scheduler picked it and it is now executing. Which event fired?", options: ["Dispatch", "Preempt", "Admit", "I/O complete"], answer: 0, expl: "Dispatch is the Ready → CPU move — the dispatcher hands the CPU to the scheduler's choice." },
          ],
        },
      },
      {
        id: "T3.2", title: "Moves the model forbids — and why",
        content: [
          "The forbidden moves teach as much as the legal ones. **Ready → I/O Wait** is impossible because only a **running** process can execute the instruction that requests I/O. **I/O Wait → CPU** is forbidden because a completed process must re-enter the ready queue and be scheduled like everyone else. **Ready → Terminated** is out in this model because exit is an instruction — executed on the CPU.",
          "In the experiment, these moves can be **attempted** — the simulator refuses each one with a reason. Those refusals are recorded; they are exactly the misconception signals the analytics dashboard surfaces.",
        ],
        keyfact: "If a process isn't running, it can't do anything — it can only be done to (admitted, dispatched, woken).",
        validation: {
          id: "V3.2",
          items: [
            { id: "V3.2-Q1", lo: "LO4", type: "multi", q: "Which of these transitions are INVALID in this model?", options: ["Ready → I/O Wait", "I/O Wait → CPU", "CPU → Ready (preempt)", "Ready → Terminated", "I/O Wait → Ready"], answer: [0, 1, 3], expl: "Preempt (CPU → Ready) and I/O complete (I/O Wait → Ready) are legal. The other three skip the CPU or the ready queue." },
            { id: "V3.2-Q2", lo: "LO4", type: "mcq", q: "Why can't a Ready process move straight to I/O Wait?", options: ["Only a running process can execute the instruction that requests I/O", "The disk is usually busy", "Ready processes have no PCB", "It can — it is just slower"], answer: 0, expl: "Requesting I/O is something a process does while executing. Ready processes aren't executing anything." },
          ],
        },
      },
    ],
  },
  {
    id: "L4", kind: "lesson", title: "Queues, the Scheduler & CPU Exclusivity", prereqs: ["L2"], los: ["LO5", "LO6"], minutes: 9,
    blurb: "why only one process runs at a time, and how the OS hands the CPU from one process to the next",
    tasks: [
      {
        id: "T4.1", title: "One CPU, many processes",
        content: [
          "With a single CPU, **at most one process runs at a time** — that is CPU exclusivity. Everyone else who is runnable waits in the **ready queue**; everyone blocked waits in a **device queue**.",
          "Dispatching a second process while one is on the CPU is refused: the CPU is occupied. Concurrency on one core is an illusion built from rapid turn-taking.",
        ],
        keyfact: "The ready queue is the waiting room; the scheduler decides who goes in next; the CPU seats exactly one.",
        validation: {
          id: "V4.1",
          items: [
            { id: "V4.1-Q1", lo: "LO5", type: "mcq", q: "Two processes are Ready and the single CPU is free. When you dispatch, what happens?", options: ["Both run simultaneously", "Exactly one moves to the CPU; the other stays queued in Ready", "Both terminate", "The dispatch is refused because two processes are Ready"], answer: 1, expl: "CPU exclusivity: one core, one running process. The other waits its turn in the ready queue." },
            { id: "V4.1-Q2", lo: "LO5", type: "mcq", q: "After a process's I/O completes, where does it wait?", options: ["At the back of the ready queue", "It re-enters the CPU immediately", "In the device queue forever", "It is terminated"], answer: 0, expl: "It becomes runnable again and queues in Ready — it does not jump the line." },
          ],
        },
      },
      {
        id: "T4.2", title: "The context switch, step by step",
        content: [
          "When the CPU changes hands, the OS performs a **context switch**: the outgoing process's registers and program counter are **saved into its PCB**; the **scheduler** selects the next Ready process; the **dispatcher** restores that process's PCB onto the CPU; execution resumes.",
          "The switch itself is pure overhead — no user work happens during it — which is why real systems care about how often it occurs.",
        ],
        keyfact: "Scheduler chooses. Dispatcher performs the hand-over. The PCB is the save-file that makes it possible.",
        validation: {
          id: "V4.2",
          items: [
            { id: "V4.2-Q1", lo: "LO6", type: "order", q: "The steps of a context switch (after a timer preemption), in order:", options: ["Timer interrupt fires — the running process's slice is over", "Outgoing process's registers & PC are saved to its PCB", "Scheduler selects the next process from the ready queue", "Chosen process's PCB is restored and it resumes on the CPU"], answer: [0, 1, 2, 3], expl: "Interrupt → save context → schedule → restore & resume. The PCB is written at step 2 and read at step 4." },
            { id: "V4.2-Q2", lo: "LO6", type: "mcq", q: "The dispatcher's job is to…", options: ["choose which I/O device runs next", "hand the CPU to the process the scheduler selected", "compile programs into processes", "delete finished PCBs"], answer: 1, expl: "Scheduling is the decision; dispatching is the mechanism that performs the switch." },
          ],
        },
      },
    ],
  },
]

/**
 * The experiment node reuses the lab's existing guided scenarios as its
 * challenges: each challenge is passed by completing the named scenario
 * (whose per-step validation predicates already verify the learner's actions).
 */
export const EXPERIMENT: ExperimentNode = {
  id: "EXP", kind: "experiment", title: "Experiment: Drive the Life Cycle",
  prereqs: ["L3", "L4"], los: ["LO3", "LO4", "LO5"], minutes: 25,
  blurb: "real processes driven through the full life cycle in the simulator — including the moves it refuses",
  challenges: [
    { id: "C1", title: "Normal execution", desc: "A single process taken cleanly from creation to termination.", scenarioId: "s1-single-normal", lo: "LO3" },
    { id: "C2", title: "CPU exclusivity", desc: "A second process cannot enter an occupied CPU.", scenarioId: "s2-cpu-exclusivity", lo: "LO5" },
    { id: "C3", title: "I/O round trip", desc: "A process blocked on I/O returns through Ready to completion.", scenarioId: "s3-io-blocking", lo: "LO5" },
    { id: "C4", title: "Invalid-transition exploration", desc: "Forbidden moves, attempted to see why the model refuses them.", scenarioId: "s4-invalid-transitions", lo: "LO4" },
  ],
}

export const ASSESSMENT: AssessmentNode = {
  id: "ASMT", kind: "assessment", title: "Mastery Check", prereqs: ["EXP"],
  los: ["LO1", "LO2", "LO3", "LO4", "LO5", "LO6"], minutes: 8, passScore: 5,
  blurb: "a short final quiz across the whole course, with no feedback until the end",
  items: [
    { id: "A1", lo: "LO1", type: "mcq", q: "Which statement is true?", options: ["A process is a program in execution, with its own state held in a PCB", "A process is the file produced by the compiler", "A program and a process are the same thing", "A PCB stores the program's source code"], answer: 0, expl: "" },
    { id: "A2", lo: "LO2", type: "mcq", q: "“I/O Wait” means the process…", options: ["is waiting only for the CPU", "is blocked until a device or event completes", "has finished executing", "is being created"], answer: 1, expl: "" },
    { id: "A3", lo: "LO3", type: "mcq", chips: true, q: "A running process requests keyboard input. Its next state is…", options: ["I/O Wait", "Ready", "Terminated", "New"], answer: 0, expl: "" },
    { id: "A4", lo: "LO4", type: "mcq", q: "Which of these is a LEGAL transition in this model?", options: ["Ready → CPU (dispatch)", "Ready → I/O Wait", "I/O Wait → CPU", "Ready → Terminated"], answer: 0, expl: "" },
    { id: "A5", lo: "LO5", type: "mcq", chips: true, q: "P's event history: Admit, Dispatch, I/O request, I/O complete. Where is P now?", options: ["Ready", "CPU (Running)", "I/O Wait", "Terminated"], answer: 0, expl: "" },
    { id: "A6", lo: "LO6", type: "mcq", q: "During a context switch, the outgoing process's CPU context is stored…", options: ["in its PCB", "in a file on disk chosen by the user", "in the ready queue", "nowhere — it is discarded"], answer: 0, expl: "" },
  ],
}

export const NODES: CourseNode[] = [...LESSONS, EXPERIMENT, ASSESSMENT]

export function nodeById(id: string): CourseNode | undefined {
  return NODES.find((n) => n.id === id)
}

export function loById(id: string): LearningObjective | undefined {
  return LOS.find((l) => l.id === id)
}

/** State-name → colour used across the lab, for state-prediction chips. */
export const STATE_CHIP_COLORS: Record<string, string> = {
  New: "#64748b",
  Ready: "#0ea5e9",
  "CPU (Running)": "#22c55e",
  "I/O Wait": "#ca8a04",
  Terminated: "#ef4444",
}
