import type { AppState, MemRLParams, SelectionMode } from '../../types.js';
import type { Store } from '../../state/store.js';
import { createSlider } from '../components/slider.js';
import { PREDEFINED_TASKS } from '../../engine/tasks.js';

export interface ControlPanelCallbacks {
  onStep: () => void;
  onRunTask: () => void;
  onRunEpoch: () => void;
  onReset: () => void;
  onNewTask: (suggestion?: string) => void;
  onGuidedToggle?: (on: boolean) => void;
}

export function mountControlPanel(
  el: HTMLElement,
  store: Store<AppState>,
  callbacks: ControlPanelCallbacks,
): void {
  el.innerHTML = '';

  // --- API Config ---
  const apiGroup = createGroup('API');
  apiGroup.title = 'OpenAI-compatible API configuration. Works with Cerebras, OpenAI, or any provider that supports /v1/chat/completions.';

  const baseUrlInput = createInput('Base URL', 'text', 'https://api.cerebras.ai');
  const apiKeyInput = createInput('API Key', 'password', 'sk-...');
  const modelInput = createInput('Model', 'text', 'gpt-oss-120b');

  // Load persisted values
  const state = store.getState();
  (baseUrlInput.querySelector('input') as HTMLInputElement).value = state.apiConfig.baseUrl;
  (apiKeyInput.querySelector('input') as HTMLInputElement).value = state.apiConfig.apiKey;
  (modelInput.querySelector('input') as HTMLInputElement).value = state.apiConfig.model;

  const updateApiConfig = () => {
    store.merge('apiConfig', {
      baseUrl: (baseUrlInput.querySelector('input') as HTMLInputElement).value,
      apiKey: (apiKeyInput.querySelector('input') as HTMLInputElement).value,
      model: (modelInput.querySelector('input') as HTMLInputElement).value,
    });
  };

  baseUrlInput.querySelector('input')!.addEventListener('change', updateApiConfig);
  apiKeyInput.querySelector('input')!.addEventListener('change', updateApiConfig);
  modelInput.querySelector('input')!.addEventListener('change', updateApiConfig);

  apiGroup.append(baseUrlInput, apiKeyInput, modelInput);
  el.appendChild(apiGroup);
  el.appendChild(divider());

  // --- Demo Mode Toggle ---
  const demoGroup = createGroup('');
  const demoToggle = createToggle('Demo Mode', state.demoMode, (v) => {
    store.setState({ demoMode: v });
  });
  demoToggle.title = 'When ON, uses a mock LLM with deterministic scripted responses — no API key needed. When OFF, calls the configured API endpoint with real LLM inference.';
  demoGroup.appendChild(demoToggle);

  // Guided Mode toggle (right next to Demo Mode)
  const guidedToggle = createToggle('Guided', false, (v) => {
    callbacks.onGuidedToggle?.(v);
  });
  guidedToggle.title = 'Guided Mode — shows a step-by-step narration sidebar with every LLM call, prompt, and response. Click "Continue" to advance through each step. Great for understanding the full MemRL loop.';
  demoGroup.appendChild(guidedToggle);

  el.appendChild(demoGroup);
  el.appendChild(divider());

  // --- Mode Toggle ---
  const modeGroup = createGroup('');
  const modeToggle = createToggle(
    'ε-Greedy',
    state.selectionMode === 'epsilon_greedy',
    (v) => store.setState({ selectionMode: v ? 'epsilon_greedy' : 'paper' as SelectionMode }),
  );
  modeToggle.title = 'Toggle between Paper Mode (Eq. 6 blended scoring with λ) and ε-Greedy Mode (from the MemRL codebase — selects random candidates with probability ε for exploration).';
  modeGroup.appendChild(modeToggle);
  el.appendChild(modeGroup);
  el.appendChild(divider());

  // --- Parameter Sliders ---
  const paramSliders = createParamSliders(state.params, (key, value) => {
    const current = store.getState().params;
    store.setState({ params: { ...current, [key]: value } });
  });
  el.appendChild(paramSliders);
  el.appendChild(divider());

  // --- Task Selection ---
  const taskGroup = createGroup('Task');
  taskGroup.title = 'Select a predefined task, let the DM generate one, or write a custom task description for the DM to build a contract around.';

  const taskSelect = document.createElement('select');
  taskSelect.style.width = '180px';

  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = '(Custom task...)';
  taskSelect.appendChild(customOpt);

  const generateOpt = document.createElement('option');
  generateOpt.value = '__generate__';
  generateOpt.textContent = '(DM generates)';
  taskSelect.appendChild(generateOpt);

  for (const task of PREDEFINED_TASKS) {
    const opt = document.createElement('option');
    opt.value = task.id;
    opt.textContent = task.description;
    taskSelect.appendChild(opt);
  }

  const customInput = document.createElement('input');
  customInput.type = 'text';
  customInput.placeholder = 'Describe a task...';
  customInput.style.width = '200px';
  customInput.style.display = 'none';

  taskSelect.addEventListener('change', () => {
    customInput.style.display = taskSelect.value === '__custom__' ? '' : 'none';
  });

  taskGroup.append(taskSelect, customInput);
  el.appendChild(taskGroup);
  el.appendChild(divider());

  // --- Action Buttons ---
  const actionGroup = createGroup('');

  const stepBtn = createButton('Step', false, callbacks.onStep);
  stepBtn.title = 'Execute one agent action + DM response tick. Use this to step through the game loop manually.';

  const runBtn = createButton('Run Task', true, () => {
    const taskVal = taskSelect.value;
    if (taskVal === '__custom__') {
      callbacks.onNewTask(customInput.value || undefined);
    } else if (taskVal === '__generate__') {
      callbacks.onNewTask();
    } else {
      callbacks.onRunTask();
    }
  });
  runBtn.title = 'Run a complete task from start to finish: retrieve memories → agent loop → Q-value update → create new memory.';

  const epochBtn = createButton('Run Epoch', false, callbacks.onRunEpoch);
  epochBtn.title = 'Run all predefined tasks once as a training epoch. After each task, memories are created and Q-values updated, improving retrieval for subsequent tasks.';

  const resetBtn = createButton('Reset', false, callbacks.onReset);
  resetBtn.classList.add('danger');
  resetBtn.title = 'Clear all game state, memory bank, and Q-values. API configuration and parameters are preserved.';

  actionGroup.append(stepBtn, runBtn, epochBtn, resetBtn);
  el.appendChild(actionGroup);

  // --- Speed Control ---
  el.appendChild(divider());
  const speedGroup = createGroup('Speed');
  speedGroup.title = 'Controls the delay between automated agent steps. Step = manual (click Step each time), Slow = 2s delay, Fast = 500ms delay.';
  const speedSelect = document.createElement('select');
  for (const s of ['step', 'slow', 'fast'] as const) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    if (s === state.autoRunSpeed) opt.selected = true;
    speedSelect.appendChild(opt);
  }
  speedSelect.addEventListener('change', () => {
    store.setState({ autoRunSpeed: speedSelect.value as AppState['autoRunSpeed'] });
  });
  speedGroup.appendChild(speedSelect);
  el.appendChild(speedGroup);

  // Expose task selector for external use
  (el as any).__taskSelect = taskSelect;
  (el as any).__customInput = customInput;
}

export function getSelectedTaskId(el: HTMLElement): string {
  return (el as any).__taskSelect?.value ?? '__generate__';
}

export function getCustomTaskText(el: HTMLElement): string {
  return (el as any).__customInput?.value ?? '';
}

function createParamSliders(
  params: MemRLParams,
  onChange: (key: keyof MemRLParams, value: number) => void,
): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center;';

  const sliders: [keyof MemRLParams, string, number, number, number, string][] = [
    ['similarityThreshold', 'SimilarityThreshold(δ)', 0, 1, 0.05,
      'Eq. 5 — Minimum cosine similarity for a memory to be considered relevant. Higher δ = stricter filtering, fewer candidates. Paper default: 0.5.'],
    ['candidatePoolSize', 'CandidatePoolSize(k₁)', 1, 50, 1,
      'Eq. 5 — Maximum number of memories to keep after Phase A similarity filtering. Larger k₁ = more candidates for Phase B to rank.'],
    ['contextSize', 'ContextSize(k₂)', 1, 10, 1,
      'Eq. 6 — Number of memories selected in Phase B to inject into the agent\'s context. Larger k₂ = more context but may dilute relevance. Paper default: 3.'],
    ['exploitWeight', 'ExploitWeight(λ)', 0, 1, 0.05,
      'Eq. 6 — Balances similarity vs trust score in Phase B ranking. λ=0 = pure similarity (like standard RAG), λ=1 = pure exploitation of high-Q memories. Paper default: 0.5.'],
    ['learningRate', 'LearningRate(α)', 0.01, 1, 0.01,
      'Eq. 8 — Step size for Q-value updates: Q_new = Q_old + α·(reward - Q_old). Higher α = faster learning but more variance. Bounded variance: α/(2-α)·Var(reward).'],
    ['successReward', 'SuccessReward(r⁺)', 0, 2, 0.1,
      '§3.5 — Reward signal when the agent completes a task successfully (all DM success conditions met). Drives Q-values upward for memories that were in context.'],
    ['failureReward', 'FailureReward(r⁻)', -2, 0, 0.1,
      '§3.5 — Reward signal when the agent fails a task (exceeded max steps or DM declared failure). Drives Q-values downward for memories that were in context.'],
    ['initialTrustScore', 'InitialTrustScore(Q₀)', -1, 1, 0.1,
      'Theorem 1 — Starting Q-value for newly created memories. Per convergence proof: E[Q_t] = true_rate + (1-α)^t · (Q₀ - true_rate). Q₀=0 is neutral.'],
    ['explorationRate', 'ExplorationRate(ε)', 0, 1, 0.05,
      'ε-Greedy mode only — Probability of selecting a random candidate instead of the highest-scored one. Higher ε = more exploration of untested memories.'],
    ['maxStepsPerTask', 'MaxStepsPerTask', 4, 20, 1,
      '§3.1 — Maximum number of agent actions before the task is declared failed. Prevents infinite loops. The agent receives FailureReward(r⁻) if it exceeds this limit.'],
  ];

  for (const [key, label, min, max, step, tooltip] of sliders) {
    const slider = createSlider({
      label,
      min,
      max,
      step,
      value: params[key],
      onChange: (v) => onChange(key, v),
    });
    slider.title = tooltip;
    container.appendChild(slider);
  }

  return container;
}

function createGroup(label: string): HTMLElement {
  const group = document.createElement('div');
  group.className = 'control-group';
  if (label) {
    const lbl = document.createElement('label');
    lbl.textContent = label;
    lbl.style.fontWeight = '600';
    group.appendChild(lbl);
  }
  return group;
}

function divider(): HTMLElement {
  const d = document.createElement('div');
  d.className = 'control-divider';
  return d;
}

function createInput(label: string, type: string, placeholder: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'control-group';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.placeholder = placeholder;
  input.style.width = type === 'password' ? '120px' : '160px';
  wrapper.append(lbl, input);
  return wrapper;
}

function createToggle(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'control-group';
  const lbl = document.createElement('label');
  lbl.textContent = label;

  const toggle = document.createElement('label');
  toggle.className = 'toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const slider = document.createElement('span');
  slider.className = 'slider';
  toggle.append(input, slider);

  wrapper.append(lbl, toggle);
  return wrapper;
}

function createButton(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  if (primary) btn.className = 'primary';
  btn.addEventListener('click', onClick);
  return btn;
}
