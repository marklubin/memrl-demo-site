import type { AppState, RetrievalResult, CandidateResult } from '../../types.js';
import type { Store } from '../../state/store.js';
import { createBarChart } from '../components/bar-chart.js';

export function mountRetrievalInspector(el: HTMLElement, store: Store<AppState>): void {
  el.innerHTML = `
    <div class="panel-header" title="§3.3 Retrieval — Two-phase memory retrieval pipeline. Phase A filters by cosine similarity (Eq. 5), Phase B ranks by blended similarity+trust score (Eq. 6).">Retrieval Inspector</div>
    <div class="panel-body" id="retrieval-body">
      <div class="empty-state">Retrieval runs when a task starts with memories in the bank.</div>
    </div>
  `;

  const body = el.querySelector('#retrieval-body')! as HTMLElement;

  store.on('game', (game) => {
    if (!game.retrievalResult || game.phase === 'idle') {
      body.innerHTML = '<div class="empty-state">Retrieval runs when a task starts with memories in the bank.</div>';
      return;
    }
    renderRetrieval(body, game.retrievalResult, store.getState());
  });
}

function renderRetrieval(body: HTMLElement, result: RetrievalResult, state: AppState): void {
  body.innerHTML = '';

  // Phase A
  const phaseASection = document.createElement('div');
  phaseASection.className = 'phase-section';

  const phaseATitle = document.createElement('h3');
  phaseATitle.textContent = `Phase A — Similarity Filter (${result.phaseACandidates.length} candidates)`;
  phaseATitle.title = 'Eq. 5 — Filters memories by cosine similarity between the current task embedding and each memory\'s intent embedding. Only memories above SimilarityThreshold(δ) pass, then the top CandidatePoolSize(k₁) are kept.';
  phaseASection.appendChild(phaseATitle);

  if (result.phaseACandidates.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No memories passed the similarity threshold.';
    empty.title = 'When no memories exceed δ, the agent receives no episodic context and must act from scratch — equivalent to the no-memory baseline in Table 1 of the paper.';
    phaseASection.appendChild(empty);
  } else {
    const chartContainer = document.createElement('div');
    chartContainer.title = 'Cosine similarity scores for each candidate memory. The dashed line shows the SimilarityThreshold(δ). Memories above the line pass to Phase B.';
    createBarChart(chartContainer, {
      labels: result.phaseACandidates.map(c => truncate(c.memory.intentText, 25)),
      values: result.phaseACandidates.map(c => c.similarity),
      threshold: state.params.similarityThreshold,
      thresholdLabel: `SimilarityThreshold(δ)=${state.params.similarityThreshold}`,
      maxValue: 1,
    });
    phaseASection.appendChild(chartContainer);
  }

  body.appendChild(phaseASection);

  // Phase B
  if (result.phaseBRanked.length > 0) {
    const phaseBSection = document.createElement('div');
    phaseBSection.className = 'phase-section';

    const phaseBTitle = document.createElement('h3');
    phaseBTitle.textContent = `Phase B — Value-Aware Selection (top ${state.params.contextSize})`;
    phaseBTitle.title = 'Eq. 6 — Ranks Phase A candidates by a blended score combining z-score normalized similarity and z-score normalized Q-value (trust score). The top ContextSize(k₂) memories are injected into the agent\'s prompt.';
    phaseBSection.appendChild(phaseBTitle);

    // Mode indicator
    const modeLabel = document.createElement('div');
    modeLabel.style.cssText = 'font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;';
    if (state.selectionMode === 'paper') {
      modeLabel.textContent = `Paper Mode: score = (1-λ)·norm_sim + λ·norm_Q  |  ExploitWeight(λ)=${state.params.exploitWeight}`;
      modeLabel.title = 'Eq. 6 from the paper — score_i = (1 - λ)·z_norm(sim_i) + λ·z_norm(Q_i). λ=0 means pure similarity retrieval, λ=1 means pure trust-score exploitation. The paper uses λ=0.5 as default.';
    } else {
      modeLabel.textContent = `Code Mode: ε-greedy  |  ExplorationRate(ε)=${state.params.explorationRate}`;
      modeLabel.title = 'ε-greedy selection from the MemRL codebase — with probability ε, a random candidate is selected instead of the highest-scored one. Encourages exploration of lower-trust memories.';
    }
    phaseBSection.appendChild(modeLabel);

    // Scoring table
    const table = document.createElement('table');
    table.className = 'scoring-table';
    table.title = 'Each row shows a candidate memory and its scoring components. "Selected" memories are injected into the agent\'s context window.';

    const thead = document.createElement('thead');
    const headerHtml = state.selectionMode === 'paper'
      ? '<tr><th title="The intent/task description this memory was created from">Intent</th><th title="Raw cosine similarity between current task and this memory\'s intent embedding">Raw Sim</th><th title="Z-score normalized similarity across the candidate pool (Eq. 6)">Norm Sim</th><th title="Current trust score (Q-value) — updated via Eq. 8 after each task">Raw Q</th><th title="Z-score normalized Q-value across the candidate pool (Eq. 6)">Norm Q</th><th title="Final blended score = (1-λ)·norm_sim + λ·norm_Q (Eq. 6)">Blend</th><th></th></tr>'
      : '<tr><th title="The intent/task description this memory was created from">Intent</th><th title="Cosine similarity between current task and memory intent embedding">Similarity</th><th title="Trust score (Q-value) — learned via temporal-difference updates (Eq. 8)">Q-Value</th><th></th></tr>';
    thead.innerHTML = headerHtml;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const c of result.phaseBRanked) {
      const tr = document.createElement('tr');
      if (c.selected) tr.className = 'selected';

      if (state.selectionMode === 'paper') {
        tr.innerHTML = `
          <td class="truncate" style="max-width: 120px" title="${esc(c.memory.intentText)}">${esc(truncate(c.memory.intentText, 20))}</td>
          <td>${c.similarity.toFixed(3)}</td>
          <td>${(c.normalizedSimilarity ?? 0).toFixed(3)}</td>
          <td>${c.memory.trustScore.toFixed(3)}</td>
          <td>${(c.normalizedQ ?? 0).toFixed(3)}</td>
          <td><strong>${(c.blendedScore ?? 0).toFixed(3)}</strong></td>
          <td>${c.selected ? '<span class="badge success">selected</span>' : ''}</td>
        `;
      } else {
        tr.innerHTML = `
          <td class="truncate" style="max-width: 150px" title="${esc(c.memory.intentText)}">${esc(truncate(c.memory.intentText, 25))}</td>
          <td>${c.similarity.toFixed(3)}</td>
          <td>${c.memory.trustScore.toFixed(3)}</td>
          <td>${c.selected ? '<span class="badge success">selected</span>' : ''}</td>
        `;
      }

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    phaseBSection.appendChild(table);

    body.appendChild(phaseBSection);
  }

  // Injected Context Preview
  const state_ = result.selected;
  if (state_.length > 0) {
    const previewSection = document.createElement('div');
    previewSection.className = 'phase-section';

    const previewTitle = document.createElement('h3');
    previewTitle.textContent = 'Selected Memories (Injected into Agent Context)';
    previewTitle.title = '§3.3 — These k₂ memories are appended to the agent\'s system prompt as "past experience" context. The agent uses them to inform its action decisions but never sees the raw Q-values.';
    previewSection.appendChild(previewTitle);

    for (const c of state_) {
      const card = document.createElement('div');
      card.className = 'memory-expand';
      card.title = 'This memory\'s experience text is injected verbatim into the agent prompt. After the task, its Q-value will be updated based on whether the task succeeded or failed (Eq. 8).';
      card.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px; color: var(--accent);">${esc(c.memory.intentText)}</div>
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;">
          Q=${c.memory.trustScore.toFixed(3)} | sim=${c.similarity.toFixed(3)} | used ${c.memory.timesUsed}x
        </div>
        <div style="font-size: 14px;">${esc(c.memory.experienceText)}</div>
      `;
      previewSection.appendChild(card);
    }

    body.appendChild(previewSection);
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

function esc(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
