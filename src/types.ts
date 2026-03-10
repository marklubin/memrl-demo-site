// ============================================================
// MemRL Interactive Demo — Type Definitions
// ============================================================

// --- MemRL Core Types ---

export interface TrustScoreUpdate {
  epoch: number;
  taskId: string;
  oldScore: number;
  newScore: number;
  reward: number;
  predictionError: number; // reward - oldScore
}

export interface MemoryEntry {
  id: string;
  intentEmbedding: number[];       // 384-dim from MiniLM
  intentText: string;              // original task description
  experienceText: string;          // strategy summary
  trustScore: number;              // Q-value
  timesUsed: number;
  timesSucceeded: number;
  createdAtEpoch: number;
  lastUsedAtEpoch: number;
  history: TrustScoreUpdate[];
}

export interface CandidateResult {
  memory: MemoryEntry;
  similarity: number;
  normalizedSimilarity?: number;
  normalizedQ?: number;
  blendedScore?: number;
  selected?: boolean;
}

export interface RetrievalResult {
  phaseACandidates: CandidateResult[];  // all that passed threshold
  phaseBRanked: CandidateResult[];      // scored and ranked
  selected: CandidateResult[];          // top k2 chosen for context
}

// --- MemRL Parameters ---

export interface MemRLParams {
  similarityThreshold: number;   // SimilarityThreshold(δ)  — default 0.5
  candidatePoolSize: number;     // CandidatePoolSize(k₁)  — default 10
  contextSize: number;           // ContextSize(k₂)        — default 3
  exploitWeight: number;         // ExploitWeight(λ)        — default 0.5
  learningRate: number;          // LearningRate(α)         — default 0.1
  successReward: number;         // SuccessReward(r⁺)       — default +1.0
  failureReward: number;         // FailureReward(r⁻)       — default -1.0
  initialTrustScore: number;     // InitialTrustScore(Q₀)   — default 0.0
  explorationRate: number;       // ExplorationRate(ε)       — default 0.1
  maxStepsPerTask: number;       // MaxStepsPerTask          — default 12
}

export const DEFAULT_PARAMS: MemRLParams = {
  similarityThreshold: 0.5,
  candidatePoolSize: 10,
  contextSize: 3,
  exploitWeight: 0.5,
  learningRate: 0.1,
  successReward: 1.0,
  failureReward: -1.0,
  initialTrustScore: 0.0,
  explorationRate: 0.1,
  maxStepsPerTask: 12,
};

// --- LLM Types ---

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface LLMClient {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
}

// --- Embedding Types ---

export interface Embedder {
  embed(text: string): Promise<number[]>;
  ready: boolean;
}

// --- World / Engine Types ---

export type LocationId =
  | 'main_hall'
  | 'kitchen'
  | 'cellar'
  | 'courtyard'
  | 'upstairs_room'
  | 'shop_front';

export interface ObjectState {
  name: string;
  states: Record<string, string>;   // e.g. { locked: "yes", temperature: "cold" }
  takeable: boolean;
  description: string;
}

export interface LocationState {
  id: LocationId;
  name: string;
  description: string;
  objects: Record<string, ObjectState>;
  npcs: string[];
}

export interface WorldState {
  locations: Record<LocationId, LocationState>;
  agentLocation: LocationId;
  agentInventory: string[];
  npcInventory: Record<string, string[]>;
  globalFlags: Record<string, boolean>;
}

export type ActionType = 'go_to' | 'examine' | 'take' | 'use' | 'combine' | 'give';

export interface AgentAction {
  type: ActionType;
  target: string;
  secondTarget?: string;  // for combine(a, b) and give(obj, target)
}

export type TaskStatus = 'continue' | 'success' | 'failure';

// --- DM Types ---

export interface TaskContract {
  id: string;
  description: string;
  solutionSteps: string[];
  successConditions: string[];
  worldAxioms: string[];
}

export interface DMTaskGeneration {
  task: TaskContract;
  initialWorldState: WorldState;
  initialScratchNotes: string;
}

export interface DMTickResponse {
  narrative: string;
  worldState: WorldState;
  status: TaskStatus;
  scratchUpdate: string;   // "append: ...", "edit[N]: ...", "delete[N]"
}

export interface ScratchEntry {
  index: number;
  text: string;
}

// --- Agent Types ---

export interface AgentDecision {
  thinking: string;
  action: AgentAction;
  rawOutput: string;
}

// --- Game Loop Types ---

export interface ActionStep {
  stepNumber: number;
  agentDecision: AgentDecision;
  dmResponse: DMTickResponse;
}

export type GamePhase =
  | 'idle'
  | 'task_setup'
  | 'retrieving'
  | 'agent_acting'
  | 'q_updating'
  | 'memory_creating'
  | 'complete';

export interface GameState {
  phase: GamePhase;
  currentTask: TaskContract | null;
  worldState: WorldState | null;
  scratchBuffer: ScratchEntry[];
  steps: ActionStep[];
  currentStep: number;
  reward: number | null;
  retrievalResult: RetrievalResult | null;
  agentPromptPreview: string;
  epoch: number;
}

// --- Warmup Types ---

export interface SyntheticTask {
  id: string;
  description: string;
  category: string;
  difficulty: string;
  expectedSteps: number;
}

export interface SyntheticTrajectory {
  steps: string[];
  narrative: string;
  outcome: 'success' | 'failure';
}

export interface WarmupConfig {
  taskCount: number;
  epochs: number;
  strategy: 'full_llm' | 'synthetic' | 'manual_seed';
}

export interface WarmupProgress {
  currentEpoch: number;
  totalEpochs: number;
  currentTask: number;
  totalTasks: number;
  successCount: number;
  failureCount: number;
  memoriesCreated: number;
  avgQValue: number;
}

// --- UI / App State ---

export type SelectionMode = 'paper' | 'epsilon_greedy';

export interface APIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AppState {
  // Config
  apiConfig: APIConfig;
  params: MemRLParams;
  selectionMode: SelectionMode;
  demoMode: boolean;
  autoRunSpeed: 'step' | 'slow' | 'fast';

  // MemRL
  memoryBank: MemoryEntry[];

  // Game
  game: GameState;

  // UI
  embeddingReady: boolean;
  activeAlgoCard: string | null;  // which algo card to highlight
  warmup: WarmupProgress | null;
  busy: boolean;
}

export function createInitialAppState(): AppState {
  return {
    apiConfig: { baseUrl: '', apiKey: '', model: '' },
    params: { ...DEFAULT_PARAMS },
    selectionMode: 'paper',
    demoMode: false,
    autoRunSpeed: 'step',
    memoryBank: [],
    game: {
      phase: 'idle',
      currentTask: null,
      worldState: null,
      scratchBuffer: [],
      steps: [],
      currentStep: 0,
      reward: null,
      retrievalResult: null,
      agentPromptPreview: '',
      epoch: 0,
    },
    embeddingReady: false,
    activeAlgoCard: null,
    warmup: null,
    busy: false,
  };
}
