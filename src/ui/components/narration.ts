import type { NarrationStep } from '../../llm/narrating-client.js';

const PHASE_COLORS: Record<string, string> = {
  task_generation: '#6d28d9',  // purple
  dm_tick: '#6d28d9',          // purple
  agent_action: '#1d4ed8',     // blue
  memory_summary: '#15803d',   // green
  retrieval: '#92400e',        // amber
  q_update: '#b91c1c',         // red
  memory_created: '#15803d',   // green
};

const PHASE_ICONS: Record<string, string> = {
  task_generation: 'DM',
  dm_tick: 'DM',
  agent_action: 'AGT',
  memory_summary: 'MEM',
  retrieval: 'RET',
  q_update: 'Q',
  memory_created: 'M+',
};

export class NarrationOverlay {
  private container: HTMLElement;
  private stepList: HTMLElement;
  private resolveWait: (() => void) | null = null;
  private _enabled = false;
  private continueBtn: HTMLButtonElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'narration-overlay';
    this.container.style.display = 'none';

    // Header
    const header = document.createElement('div');
    header.className = 'narration-header';
    header.innerHTML = `
      <span style="font-weight: 700; font-size: 16px;">Guided Mode</span>
      <span style="font-size: 13px; color: var(--text-secondary);">Step-by-step LLM call walkthrough</span>
    `;
    this.container.appendChild(header);

    // Step list (scrollable)
    this.stepList = document.createElement('div');
    this.stepList.className = 'narration-steps';
    this.container.appendChild(this.stepList);

    // Continue button (fixed at bottom)
    const footer = document.createElement('div');
    footer.className = 'narration-footer';
    this.continueBtn = document.createElement('button');
    this.continueBtn.className = 'primary';
    this.continueBtn.textContent = 'Continue';
    this.continueBtn.style.width = '100%';
    this.continueBtn.style.padding = '10px';
    this.continueBtn.style.fontSize = '15px';
    this.continueBtn.addEventListener('click', () => {
      if (this.resolveWait) {
        this.resolveWait();
        this.resolveWait = null;
        this.continueBtn.disabled = true;
        this.continueBtn.textContent = 'Waiting...';
      }
    });
    footer.appendChild(this.continueBtn);
    this.container.appendChild(footer);

    document.body.appendChild(this.container);
  }

  get enabled(): boolean { return this._enabled; }

  toggle(on: boolean): void {
    this._enabled = on;
    this.container.style.display = on ? 'flex' : 'none';
    // Shift the entire app to make room for the sidebar
    const app = document.getElementById('app');
    if (app) {
      app.style.marginRight = on ? '420px' : '0';
    }
    if (on) {
      this.showWelcome();
    }
  }

  clear(): void {
    this.stepList.innerHTML = '';
    this.continueBtn.disabled = true;
    this.continueBtn.textContent = 'Waiting for next step...';
  }

  private showWelcome(): void {
    this.stepList.innerHTML = `
      <div style="padding: 20px 10px; text-align: center;">
        <div style="font-size: 32px; margin-bottom: 12px;">&#x1F9ED;</div>
        <div style="font-size: 16px; font-weight: 700; margin-bottom: 8px; color: var(--text-primary);">Guided Mode Active</div>
        <div style="font-size: 14px; color: var(--text-secondary); line-height: 1.6;">
          Now click <strong>Run Task</strong> in the control panel below.<br><br>
          Every LLM call will appear here with the full prompt and response.
          Click <strong>Continue</strong> to advance through each step.
        </div>
        <div style="margin-top: 16px; font-size: 13px; color: var(--text-muted);">
          The flow: DM generates task &rarr; retrieve memories &rarr; agent acts &rarr; DM evaluates &rarr; repeat &rarr; Q-update &rarr; new memory
        </div>
      </div>
    `;
    this.continueBtn.disabled = true;
    this.continueBtn.textContent = 'Waiting for task to start...';
  }

  /**
   * Add an LLM call step and wait for user to click Continue.
   */
  async addLLMStep(step: NarrationStep): Promise<void> {
    if (!this._enabled) return;

    const card = this.createStepCard(step);
    this.stepList.appendChild(card);
    this.scrollToBottom();

    // Enable continue button and wait
    return this.waitForContinue();
  }

  /**
   * Add a non-LLM algorithmic step (retrieval, Q-update, etc.)
   */
  async addAlgoStep(phase: string, title: string, description: string, details?: string): Promise<void> {
    if (!this._enabled) return;

    const card = document.createElement('div');
    card.className = 'narration-card';

    const color = PHASE_COLORS[phase] ?? 'var(--text-secondary)';
    const icon = PHASE_ICONS[phase] ?? '?';

    card.innerHTML = `
      <div class="narration-badge" style="background: ${color}; color: white;">${icon}</div>
      <div class="narration-content">
        <div class="narration-title">${esc(title)}</div>
        <div class="narration-desc">${esc(description)}</div>
        ${details ? `<details class="narration-details"><summary>Details</summary><pre>${esc(details)}</pre></details>` : ''}
      </div>
    `;

    this.stepList.appendChild(card);
    this.scrollToBottom();

    return this.waitForContinue();
  }

  /**
   * Add an info step (no pause needed).
   */
  addInfo(title: string, description: string): void {
    if (!this._enabled) return;

    const card = document.createElement('div');
    card.className = 'narration-card narration-info';
    card.innerHTML = `
      <div class="narration-badge" style="background: var(--border); color: var(--text-secondary);">i</div>
      <div class="narration-content">
        <div class="narration-title">${esc(title)}</div>
        <div class="narration-desc">${esc(description)}</div>
      </div>
    `;

    this.stepList.appendChild(card);
    this.scrollToBottom();
  }

  private createStepCard(step: NarrationStep): HTMLElement {
    const card = document.createElement('div');
    card.className = 'narration-card';

    const color = PHASE_COLORS[step.phase] ?? 'var(--text-secondary)';
    const icon = PHASE_ICONS[step.phase] ?? '?';

    // Format prompt for display
    const promptHtml = step.prompt
      .map(m => `<div class="narration-msg"><span class="narration-role ${m.role}">${m.role}</span><div class="narration-msg-content">${esc(truncate(m.content, 1500))}</div></div>`)
      .join('');

    // Format response (try to pretty-print JSON)
    let responseDisplay = step.response;
    try {
      const parsed = JSON.parse(step.response);
      responseDisplay = JSON.stringify(parsed, null, 2);
    } catch {
      // Not JSON, show as-is
    }

    card.innerHTML = `
      <div class="narration-badge" style="background: ${color}; color: white;">${icon}</div>
      <div class="narration-content">
        <div class="narration-title">${esc(step.title)}</div>
        <div class="narration-desc">${esc(step.description)}</div>
        <details class="narration-details">
          <summary>Show Prompt (${step.prompt.length} messages)</summary>
          <div class="narration-prompt">${promptHtml}</div>
        </details>
        <details class="narration-details">
          <summary>Show Response</summary>
          <pre class="narration-response">${esc(truncate(responseDisplay, 2000))}</pre>
        </details>
      </div>
    `;

    return card;
  }

  private waitForContinue(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resolveWait = resolve;
      this.continueBtn.disabled = false;
      this.continueBtn.textContent = 'Continue';
    });
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.stepList.scrollTop = this.stepList.scrollHeight;
    });
  }
}

function esc(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '\n... (truncated)';
}
