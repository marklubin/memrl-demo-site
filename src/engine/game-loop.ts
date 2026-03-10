import type {
  LLMClient, Embedder, MemRLParams, SelectionMode,
  GameState, GamePhase, ActionStep, TaskContract, WorldState,
  CandidateResult, RetrievalResult, MemoryEntry,
} from '../types.js';
import { MemoryBank, createMemoryEntry, updateTrustScore } from '../core/memory-bank.js';
import { retrieve } from '../core/retrieval.js';
import { DungeonMaster, formatAction } from './dm.js';
import { Agent, buildAgentPromptPreview } from './agent.js';

export type GameEvent =
  | { type: 'phase_change'; phase: GamePhase }
  | { type: 'task_generated'; task: TaskContract; worldState: WorldState }
  | { type: 'retrieval_complete'; result: RetrievalResult }
  | { type: 'agent_prompt_preview'; prompt: string }
  | { type: 'agent_step'; step: ActionStep }
  | { type: 'q_update'; memoryId: string; oldQ: number; newQ: number; reward: number; predictionError: number }
  | { type: 'memory_created'; entry: MemoryEntry; rawTrajectory: string; summary: string }
  | { type: 'task_complete'; reward: number; status: 'success' | 'failure' }
  | { type: 'scratch_update'; buffer: { index: number; text: string }[] }
  | { type: 'error'; message: string };

export type GameEventListener = (event: GameEvent) => void;

export class GameLoop {
  private dm: DungeonMaster;
  private agent: Agent;
  private listeners: GameEventListener[] = [];
  private aborted = false;

  constructor(
    private llm: LLMClient,
    private embedder: Embedder,
    private memoryBank: MemoryBank,
    private params: MemRLParams,
    private selectionMode: SelectionMode,
  ) {
    this.dm = new DungeonMaster(llm);
    this.agent = new Agent(llm);
  }

  on(listener: GameEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(event: GameEvent): void {
    for (const l of this.listeners) l(event);
  }

  updateParams(params: MemRLParams): void {
    this.params = { ...params };
  }

  updateSelectionMode(mode: SelectionMode): void {
    this.selectionMode = mode;
  }

  abort(): void {
    this.aborted = true;
  }

  /**
   * Run a single task from start to finish.
   * Returns the game state at completion.
   */
  async runTask(options: {
    taskSuggestion?: string;
    predefinedTask?: TaskContract;
    initialWorldState?: WorldState;
    epoch?: number;
    stepCallback?: () => Promise<void>;  // Called between steps for step-by-step mode
  } = {}): Promise<GameState> {
    this.aborted = false;
    const epoch = options.epoch ?? 0;

    // --- Phase: Task Setup ---
    this.emit({ type: 'phase_change', phase: 'task_setup' });

    let task: TaskContract;
    let worldState: WorldState;

    if (options.predefinedTask && options.initialWorldState) {
      task = options.predefinedTask;
      worldState = options.initialWorldState;
      this.dm.reset();
    } else {
      const gen = await this.dm.generateTask(options.taskSuggestion);
      task = gen.task;
      worldState = gen.initialWorldState;
    }

    this.emit({ type: 'task_generated', task, worldState });
    this.emit({ type: 'scratch_update', buffer: this.dm.getScratchBuffer() });

    // --- Phase: Retrieval ---
    this.emit({ type: 'phase_change', phase: 'retrieving' });

    const taskEmbedding = await this.embedder.embed(task.description);
    let retrievalResult: RetrievalResult = { phaseACandidates: [], phaseBRanked: [], selected: [] };
    let selectedMemories: CandidateResult[] = [];

    if (this.memoryBank.size() > 0) {
      retrievalResult = retrieve(
        taskEmbedding,
        this.memoryBank.getAll(),
        this.params,
        this.selectionMode,
      );
      selectedMemories = retrievalResult.selected;
    }

    this.emit({ type: 'retrieval_complete', result: retrievalResult });

    // --- Phase: Agent Acting ---
    this.emit({ type: 'phase_change', phase: 'agent_acting' });

    const steps: ActionStep[] = [];
    const previousActions: string[] = [];
    let status: 'continue' | 'success' | 'failure' = 'continue';

    for (let i = 0; i < this.params.maxStepsPerTask; i++) {
      if (this.aborted) break;

      // Show prompt preview
      const promptPreview = buildAgentPromptPreview(task, worldState, selectedMemories, previousActions);
      this.emit({ type: 'agent_prompt_preview', prompt: promptPreview });

      // Agent decides
      const decision = await this.agent.decideAction(task, worldState, selectedMemories, previousActions);
      const actionStr = formatAction(decision.action);
      previousActions.push(actionStr);

      // DM processes (use the DM if we generated via DM, otherwise handle via mock)
      let dmResponse;
      if (options.predefinedTask) {
        // For predefined tasks with initial world state, still use DM for tick
        // The DM was reset, so set up task context
        if (i === 0) {
          // Initialize DM with the predefined task
          (this.dm as any).currentTask = task;
          (this.dm as any).scratchBuffer = [{ index: 0, text: `Task: ${task.description}. Monitoring agent progress.` }];
        }
        dmResponse = await this.dm.tick(decision.action, worldState);
      } else {
        dmResponse = await this.dm.tick(decision.action, worldState);
      }

      worldState = dmResponse.worldState;
      status = dmResponse.status;

      const step: ActionStep = {
        stepNumber: i + 1,
        agentDecision: decision,
        dmResponse,
      };
      steps.push(step);

      this.emit({ type: 'agent_step', step });
      this.emit({ type: 'scratch_update', buffer: this.dm.getScratchBuffer() });

      if (status !== 'continue') break;

      // Step-by-step callback (for pacing)
      if (options.stepCallback) {
        await options.stepCallback();
      }
    }

    // If we ran out of steps, it's a failure
    if (status === 'continue') status = 'failure';

    const reward = status === 'success' ? this.params.successReward : this.params.failureReward;

    this.emit({ type: 'task_complete', reward, status });

    // --- Phase: Q-Value Update ---
    this.emit({ type: 'phase_change', phase: 'q_updating' });

    for (const candidate of selectedMemories) {
      const mem = this.memoryBank.getById(candidate.memory.id);
      if (!mem) continue;

      const oldQ = mem.trustScore;
      const update = updateTrustScore(mem, reward, this.params.learningRate, epoch, task.id);

      this.emit({
        type: 'q_update',
        memoryId: mem.id,
        oldQ,
        newQ: mem.trustScore,
        reward,
        predictionError: update.predictionError,
      });
    }

    // --- Phase: Memory Creation ---
    this.emit({ type: 'phase_change', phase: 'memory_creating' });

    const rawTrajectory = steps.map(s =>
      `Step ${s.stepNumber}: ${formatAction(s.agentDecision.action)} → ${s.dmResponse.narrative} [${s.dmResponse.status}]`
    ).join('\n');

    // Ask agent to summarize
    const summaryResponse = await this.llm.chat(
      [
        {
          role: 'system',
          content: 'You just completed (or failed) a task. Summarize your experience as a reusable strategy.',
        },
        {
          role: 'user',
          content: `Task: ${task.description}\nOutcome: ${status}\nSteps taken:\n${rawTrajectory}\n\nWrite a concise strategy summary (3-5 sentences) focusing on what approach you used, what worked or didn't, and key decisions. Do NOT include narrative flavor. Write practical advice for your future self.`,
        },
      ],
      { temperature: 0, maxTokens: 300 },
    );

    const summary = summaryResponse.content;
    const newEntry = createMemoryEntry(
      task.description,
      summary,
      taskEmbedding,
      this.params.initialTrustScore,
      epoch,
    );
    if (status === 'success') newEntry.timesSucceeded = 1;

    this.memoryBank.add(newEntry);

    this.emit({ type: 'memory_created', entry: newEntry, rawTrajectory, summary });

    // --- Done ---
    this.emit({ type: 'phase_change', phase: 'complete' });

    return {
      phase: 'complete',
      currentTask: task,
      worldState,
      scratchBuffer: this.dm.getScratchBuffer(),
      steps,
      currentStep: steps.length,
      reward,
      retrievalResult,
      agentPromptPreview: '',
      epoch,
    };
  }
}
