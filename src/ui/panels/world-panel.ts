import type { AppState, ActionStep, WorldState, TaskContract, ScratchEntry } from '../../types.js';
import type { Store } from '../../state/store.js';

export function mountWorldPanel(el: HTMLElement, store: Store<AppState>): void {
  el.innerHTML = `
    <div class="panel-header" title="The DM's world simulation — shows current location, objects, inventory, and the DM's internal reasoning (§3.1 Environment)">World</div>
    <div class="panel-body" id="world-body">
      <div class="empty-state">No active task. Start a task from the control panel.</div>
    </div>
  `;

  const body = el.querySelector('#world-body')!;

  store.on('game', (game) => {
    if (!game.worldState || !game.currentTask) {
      body.innerHTML = '<div class="empty-state">No active task. Start a task from the control panel.</div>';
      return;
    }
    renderWorld(
      body as HTMLElement,
      game.worldState,
      game.currentTask,
      game.scratchBuffer,
      game.steps,
      game.currentStep,
      store.getState().params.maxStepsPerTask,
    );
  });
}

function renderWorld(
  body: HTMLElement,
  ws: WorldState,
  task: TaskContract,
  scratchBuffer: ScratchEntry[],
  steps: ActionStep[],
  currentStep: number,
  maxSteps: number,
): void {
  const loc = ws.locations[ws.agentLocation];

  let html = '';

  // Task
  html += `<div class="task-display" title="The current task assigned to the agent. The DM defines success conditions and world axioms for this task.">
    <div class="label">Current Task</div>${esc(task.description)}
  </div>`;

  // Step counter
  html += `<div class="step-counter" title="Agent fails if it exceeds MaxStepsPerTask without completing the task.">Step ${currentStep}/${maxSteps}</div>`;

  // DM Contract (collapsible)
  html += `<details class="dm-contract" title="The DM's locked task contract — defines the rules of engagement. Generated once at task start and cannot be changed mid-task.">
    <summary class="section-label" style="cursor: pointer; margin-bottom: 6px;">DM Task Contract (locked)</summary>
    <div class="dm-contract-body">
      <div class="dm-field">
        <span class="dm-field-label" title="The ideal sequence of actions to complete this task. The agent doesn't see this — only the DM uses it to evaluate progress.">Solution Steps:</span>
        <div class="dm-field-value">${task.solutionSteps.map((s, i) => `<span class="dm-step">${i + 1}. ${esc(s)}</span>`).join('')}</div>
      </div>
      <div class="dm-field">
        <span class="dm-field-label" title="Conditions that MUST all be true for the DM to return status='success'. Checked every tick.">Success Conditions:</span>
        <div class="dm-field-value">${task.successConditions.map(c => `<span class="dm-condition">${esc(c)}</span>`).join('')}</div>
      </div>
      <div class="dm-field">
        <span class="dm-field-label" title="Immutable rules about the world that the DM enforces. These constrain how actions affect state (e.g., 'stove requires ingredients to cook').">World Axioms:</span>
        <div class="dm-field-value">${task.worldAxioms.map(a => `<span class="dm-axiom">${esc(a)}</span>`).join('')}</div>
      </div>
    </div>
  </details>`;

  // DM Scratch Buffer (collapsible)
  html += `<details class="dm-scratch" ${scratchBuffer.length > 0 ? 'open' : ''} title="The DM's private scratch memory. Updated on every tick via two-pass reasoning: Pass 1 evaluates the agent's action against axioms, Pass 2 generates the narrative response. Hidden from the agent.">
    <summary class="section-label" style="cursor: pointer; margin-bottom: 6px;">DM Scratch Buffer (${scratchBuffer.length} notes)</summary>
    <div class="dm-scratch-body">
      ${scratchBuffer.length === 0
        ? '<span style="color: var(--text-muted); font-size: 11px;">(empty)</span>'
        : scratchBuffer.map(s => `<div class="dm-scratch-note"><span class="dm-scratch-idx">[${s.index}]</span> ${esc(s.text)}</div>`).join('')
      }
    </div>
  </details>`;

  // Location
  html += `<div class="location-name" title="The agent's current location in the tavern world.">${esc(loc.name)}</div>`;
  html += `<div class="location-desc">${esc(loc.description)}</div>`;

  // Objects
  const objects = Object.entries(loc.objects);
  if (objects.length > 0) {
    html += '<div class="section-label" title="Interactable objects at the current location. The agent can examine, take, or use these.">Objects</div><div class="object-list">';
    for (const [id, obj] of objects) {
      const stateEntries = Object.entries(obj.states);
      const badges = stateEntries.map(([k, v]) => {
        const cls = v === 'yes' || v === 'lit' || v === 'open' ? 'on'
          : v === 'no' || v === 'locked' || v === 'cold' ? 'off'
          : 'neutral';
        return `<span class="state-badge ${cls}">${esc(k)}=${esc(v)}</span>`;
      }).join(' ');

      html += `<div class="object-item" title="${esc(obj.description)}">
        <span>${esc(obj.name)}</span>
        ${badges}
        ${obj.takeable ? '<span class="badge info">takeable</span>' : ''}
      </div>`;
    }
    html += '</div>';
  }

  // Inventory
  html += `<div class="inventory" title="Items the agent is carrying. Can be used, combined, or given to NPCs."><h4>Inventory</h4>`;
  if (ws.agentInventory.length > 0) {
    html += ws.agentInventory.map(i => `<span class="badge info">${esc(i)}</span>`).join(' ');
  } else {
    html += '<span style="color: var(--text-muted)">(empty)</span>';
  }
  html += '</div>';

  // NPC Inventory
  const npcItems = Object.entries(ws.npcInventory).filter(([, items]) => items.length > 0);
  if (npcItems.length > 0) {
    html += '<div class="section-label">NPC Items</div>';
    for (const [npc, items] of npcItems) {
      html += `<div style="font-size: 12px; margin-bottom: 4px">${esc(npc)}: ${items.map(i => `<span class="badge success">${esc(i)}</span>`).join(' ')}</div>`;
    }
  }

  // Narrative Log
  if (steps.length > 0) {
    html += '<div class="section-label" style="margin-top: 12px" title="Chronological log of agent actions and DM narrative responses.">Narrative Log</div>';
    html += '<div class="narrative-log">';
    for (const step of steps) {
      html += `<div class="narrative-entry agent">
        <strong>Step ${step.stepNumber}:</strong> ${esc(formatAction(step.agentDecision.action))}
      </div>`;
      html += `<div class="narrative-entry dm">${esc(step.dmResponse.narrative)}</div>`;
    }
    html += '</div>';
  }

  body.innerHTML = html;
}

function formatAction(action: { type: string; target: string; secondTarget?: string }): string {
  if (action.secondTarget) return `${action.type}(${action.target}, ${action.secondTarget})`;
  return `${action.type}(${action.target})`;
}

function esc(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
