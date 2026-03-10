import type { AppState, TaskContract } from '../types.js';
import type { Store } from '../state/store.js';
import type { MemoryBank } from '../core/memory-bank.js';
import { mountWorldPanel } from './panels/world-panel.js';
import { mountRetrievalInspector } from './panels/retrieval-inspector.js';
import { mountMemoryViewer } from './panels/memory-viewer.js';
import { mountAgentPanel } from './panels/agent-panel.js';
import { mountControlPanel, getSelectedTaskId, getCustomTaskText } from './panels/control-panel.js';
import { mountPaperReference } from './panels/paper-reference.js';
import { NarrationOverlay } from './components/narration.js';
import { GameLoop } from '../engine/game-loop.js';
import { OpenAIClient } from '../llm/openai-client.js';
import { MockLLMClient } from '../llm/mock-client.js';
import { NarratingLLMClient } from '../llm/narrating-client.js';
import { HuggingFaceEmbedder } from '../embedding/embedder.js';
import { MockEmbedder } from '../embedding/mock-embedder.js';
import { PREDEFINED_TASKS } from '../engine/tasks.js';
import { INITIAL_WORLD_STATE, cloneWorldState } from '../engine/world.js';
import { showEditModal } from './components/modal.js';
import { createMemoryEntry } from '../core/memory-bank.js';
import { loadSeedMemories } from '../warmup/seed-memories.js';
import type { Embedder, LLMClient } from '../types.js';

export function mountApp(store: Store<AppState>, memoryBank: MemoryBank): void {
  const paperRef = document.getElementById('paper-reference')!;
  const worldPanel = document.getElementById('world-panel')!;
  const retrievalPanel = document.getElementById('retrieval-panel')!;
  const memoryPanel = document.getElementById('memory-panel')!;
  const agentPanel = document.getElementById('agent-panel')!;
  const controlPanel = document.getElementById('control-panel')!;

  mountPaperReference(paperRef, store);
  mountWorldPanel(worldPanel, store);
  mountRetrievalInspector(retrievalPanel, store);
  mountMemoryViewer(memoryPanel, store);
  mountAgentPanel(agentPanel, store);

  // --- Busy Overlay (locks input during LLM calls) ---
  const busyOverlay = document.createElement('div');
  busyOverlay.className = 'busy-overlay';
  busyOverlay.innerHTML = '<div class="busy-indicator"><div class="spinner"></div><span>Processing...</span></div>';
  document.body.appendChild(busyOverlay);

  store.on('busy', (busy) => {
    busyOverlay.classList.toggle('active', busy);
  });

  // --- Narration Overlay (Guided Mode) ---
  const narration = new NarrationOverlay();

  let activeLoop: GameLoop | null = null;
  let running = false;

  function getClients(): { llm: LLMClient; embedder: Embedder } {
    const state = store.getState();
    let llm: LLMClient;

    if (state.demoMode) {
      llm = new MockLLMClient();
    } else {
      const { baseUrl, apiKey, model } = state.apiConfig;
      if (!baseUrl || !apiKey || !model) {
        throw new Error('API config incomplete. Set base URL, API key, and model, or enable Demo Mode.');
      }
      llm = new OpenAIClient(baseUrl, apiKey, model);
    }

    // Wrap with narration if guided mode is on
    if (narration.enabled) {
      llm = new NarratingLLMClient(llm, (step) => narration.addLLMStep(step));
    }

    const embedder = state.demoMode
      ? new MockEmbedder()
      : (state.embeddingReady
        ? (window as any).__embedder as Embedder
        : new MockEmbedder());

    return { llm, embedder };
  }

  async function runSingleTask(taskSuggestion?: string): Promise<void> {
    if (running) return;
    running = true;
    store.setState({ busy: true });

    console.log(`[App] runSingleTask — guided=${narration.enabled}, demoMode=${store.getState().demoMode}`);

    // Clear narration for new task
    if (narration.enabled) {
      narration.clear();
      narration.addInfo('Task Starting', 'Beginning a new task run. Each LLM call will be shown step-by-step.');
    }

    try {
      const { llm, embedder } = getClients();
      const state = store.getState();
      const epoch = state.game.epoch;

      const loop = new GameLoop(llm, embedder, memoryBank, state.params, state.selectionMode);
      activeLoop = loop;

      // Wire events to store + narration
      loop.on(async (event) => {
        const currentGame = store.getState().game;

        switch (event.type) {
          case 'phase_change':
            store.merge('game', { phase: event.phase });
            // Highlight algo cards
            const cardMap: Record<string, string> = {
              'retrieving': 'phase_a',
              'agent_acting': 'phase_b',
              'q_updating': 'q_update',
              'memory_creating': 'memory_structure',
            };
            store.setState({ activeAlgoCard: cardMap[event.phase] ?? null });
            break;

          case 'task_generated':
            store.merge('game', {
              currentTask: event.task,
              worldState: event.worldState,
              steps: [],
              currentStep: 0,
              reward: null,
            });
            break;

          case 'retrieval_complete':
            store.merge('game', { retrievalResult: event.result });
            // Narrate retrieval
            if (narration.enabled) {
              const nSelected = event.result.selected.length;
              const nCandidates = event.result.phaseACandidates.length;
              const details = nCandidates > 0
                ? `Phase A: ${nCandidates} memories passed similarity threshold\nPhase B: ranked by blended score, selected top ${nSelected}\n\nSelected memories:\n${event.result.selected.map(s => `  - "${s.memory.intentText}" (Q=${s.memory.trustScore.toFixed(3)}, sim=${s.similarity.toFixed(3)})`).join('\n')}`
                : 'No memories in bank or none passed the similarity threshold.';
              await narration.addAlgoStep(
                'retrieval',
                `Memory Retrieval — ${nSelected} memories selected`,
                `Embedded the task description, then ran two-phase retrieval (Eq. 5 + Eq. 6). ${nCandidates} candidates passed Phase A, ${nSelected} selected for agent context.`,
                details,
              );
            }
            break;

          case 'agent_prompt_preview':
            store.merge('game', { agentPromptPreview: event.prompt });
            break;

          case 'agent_step':
            store.merge('game', {
              steps: [...currentGame.steps, event.step],
              currentStep: event.step.stepNumber,
              worldState: event.step.dmResponse.worldState,
            });
            break;

          case 'scratch_update':
            store.merge('game', { scratchBuffer: event.buffer });
            break;

          case 'task_complete': {
            store.merge('game', { reward: event.reward });
            if (narration.enabled) {
              const statusLabel = event.status === 'success' ? 'SUCCESS' : 'FAILURE';
              await narration.addAlgoStep(
                'q_update',
                `Task Complete — ${statusLabel} (reward=${event.reward > 0 ? '+' : ''}${event.reward.toFixed(1)})`,
                `The task ended with ${event.status}. Now applying reward to all memories that were in the agent's context via Eq. 8: Q_new = Q_old + α·(reward - Q_old).`,
              );
            }
            break;
          }

          case 'q_update':
            // Memory bank is mutated in place; trigger re-render
            store.setState({ memoryBank: memoryBank.toJSON() });
            if (narration.enabled) {
              narration.addInfo(
                `Q-Update: ${event.oldQ.toFixed(3)} → ${event.newQ.toFixed(3)}`,
                `Memory updated: error=${event.predictionError.toFixed(3)}, reward=${event.reward}`,
              );
            }
            break;

          case 'memory_created':
            store.setState({ memoryBank: memoryBank.toJSON() });
            if (narration.enabled) {
              await narration.addAlgoStep(
                'memory_created',
                'New Memory Created',
                `A new memory entry was added to the bank with the agent's strategy summary and Q₀=${store.getState().params.initialTrustScore}.`,
                `Intent: "${event.entry.intentText}"\n\nExperience:\n${event.summary}`,
              );
            }
            // Show edit modal for the memory summary
            showEditModal(
              'Edit Memory Summary',
              event.summary,
              (editedSummary) => {
                const entry = memoryBank.getById(event.entry.id);
                if (entry) entry.experienceText = editedSummary;
                store.setState({ memoryBank: memoryBank.toJSON() });
              },
            );
            break;
        }
      });

      // Determine task
      const taskSelect = getSelectedTaskId(controlPanel);
      let predefinedTask: TaskContract | undefined;
      let initialWorldState;

      if (taskSelect !== '__custom__' && taskSelect !== '__generate__') {
        predefinedTask = PREDEFINED_TASKS.find(t => t.id === taskSelect);
        initialWorldState = cloneWorldState(INITIAL_WORLD_STATE);
      }

      // In guided mode, narration provides its own pacing via Continue button
      const speed = store.getState().autoRunSpeed;
      const delayMs = speed === 'fast' ? 200 : speed === 'slow' ? 1500 : 0;

      let stepCallback: (() => Promise<void>) | undefined;
      if (narration.enabled) {
        // No extra step callback needed — narration pauses on each LLM call
        stepCallback = undefined;
      } else if (delayMs > 0) {
        stepCallback = () => {
          store.setState({ busy: false });
          return new Promise(resolve => setTimeout(() => {
            store.setState({ busy: true });
            resolve();
          }, delayMs));
        };
      } else if (speed === 'step') {
        stepCallback = () => {
          store.setState({ busy: false });
          return new Promise(resolve => {
            (window as any).__resolveStep = () => {
              store.setState({ busy: true });
              resolve();
            };
          });
        };
      }

      await loop.runTask({
        taskSuggestion: taskSelect === '__custom__' ? taskSuggestion : undefined,
        predefinedTask,
        initialWorldState,
        epoch,
        stepCallback,
      });

      store.merge('game', { epoch: epoch + 1 });

      if (narration.enabled) {
        narration.addInfo('Task Run Complete', 'The full MemRL loop has finished. Run another task to see how memories improve performance.');
      }
    } catch (err) {
      console.error('Task error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      store.merge('game', { phase: 'idle' });
      alert(`Error: ${msg}`);
    } finally {
      running = false;
      store.setState({ busy: false });
      activeLoop = null;
    }
  }

  async function runEpoch(): Promise<void> {
    for (const task of PREDEFINED_TASKS) {
      if (running) return; // Already interrupted
      const state = store.getState();
      // Select this task in the dropdown
      const select = (controlPanel as any).__taskSelect as HTMLSelectElement;
      if (select) select.value = task.id;

      await runSingleTask();
    }
  }

  // Load seed memories if bank is empty (async, non-blocking)
  // Uses real embedder when available so retrieval works in real mode.
  if (memoryBank.size() === 0) {
    const seedWithEmbedder = async () => {
      // Wait briefly for HuggingFace embedder to initialize
      if (!store.getState().demoMode) {
        for (let i = 0; i < 60; i++) {
          if (store.getState().embeddingReady) break;
          await new Promise(r => setTimeout(r, 500));
        }
      }
      const embedder = store.getState().embeddingReady
        ? (window as any).__embedder as Embedder
        : new MockEmbedder();
      const count = await loadSeedMemories(embedder, memoryBank);
      if (count > 0) {
        store.setState({ memoryBank: memoryBank.toJSON() });
        console.log(`Loaded ${count} seed memories (embedder: ${embedder.constructor.name}).`);
      }
    };
    seedWithEmbedder();
  }

  mountControlPanel(controlPanel, store, {
    onStep: () => {
      if ((window as any).__resolveStep) {
        (window as any).__resolveStep();
        (window as any).__resolveStep = null;
      }
    },
    onRunTask: () => runSingleTask(),
    onRunEpoch: () => runEpoch(),
    onReset: () => {
      if (activeLoop) activeLoop.abort();
      memoryBank.clear();
      // Preserve API config, demoMode, selectionMode, params — only reset game + memories
      store.setState({
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
        activeAlgoCard: null,
      });
      narration.clear();
      // Reload seed memories with real embedder if available
      const resetEmbedder = store.getState().embeddingReady
        ? (window as any).__embedder as Embedder
        : new MockEmbedder();
      loadSeedMemories(resetEmbedder, memoryBank).then((count) => {
        if (count > 0) {
          store.setState({ memoryBank: memoryBank.toJSON() });
          console.log(`Reloaded ${count} seed memories (embedder: ${resetEmbedder.constructor.name}).`);
        }
      });
    },
    onNewTask: (suggestion) => runSingleTask(suggestion),
    onGuidedToggle: (on) => narration.toggle(on),
  });
}
