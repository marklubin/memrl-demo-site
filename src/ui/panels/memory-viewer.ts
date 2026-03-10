import type { AppState, MemoryEntry } from '../../types.js';
import type { Store } from '../../state/store.js';
import { renderLineChart } from '../components/line-chart.js';
import { createQBar } from '../components/table.js';

export function mountMemoryViewer(el: HTMLElement, store: Store<AppState>): void {
  el.innerHTML = `
    <div class="panel-header" title="§3.2 Memory Structure — The memory bank M stores triplets (intent_embedding, experience_text, trust_score). Each entry represents a past task experience with a learned Q-value indicating reliability.">Memory Bank</div>
    <div class="panel-body" id="memory-body">
      <div class="empty-state">Memory bank is empty. Complete tasks to build memories.</div>
    </div>
  `;

  const body = el.querySelector('#memory-body')! as HTMLElement;

  const render = () => {
    const state = store.getState();
    renderMemoryBank(body, state.memoryBank);
  };

  store.on('memoryBank', render);
  render();
}

function renderMemoryBank(body: HTMLElement, memories: MemoryEntry[]): void {
  if (memories.length === 0) {
    body.innerHTML = '<div class="empty-state">Memory bank is empty. Complete tasks to build memories.</div>';
    return;
  }

  body.innerHTML = '';

  // Summary stats
  const stats = document.createElement('div');
  stats.style.cssText = 'display: flex; gap: 16px; margin-bottom: 12px; font-size: 13px; font-family: var(--font-mono);';
  stats.title = 'Aggregate statistics over the memory bank. Avg Q converges toward the true success rate of each memory\'s strategy per Theorem 1.';
  const avgQ = memories.reduce((s, m) => s + m.trustScore, 0) / memories.length;
  const maxQ = Math.max(...memories.map(m => m.trustScore));
  const minQ = Math.min(...memories.map(m => m.trustScore));
  stats.innerHTML = `
    <span style="color: var(--text-secondary)">Entries: <strong style="color: var(--text-primary)">${memories.length}</strong></span>
    <span style="color: var(--text-secondary)">Avg Q: <strong style="color: var(--text-primary)">${avgQ.toFixed(3)}</strong></span>
    <span style="color: var(--text-secondary)">Range: <strong style="color: var(--text-primary)">${minQ.toFixed(2)} → ${maxQ.toFixed(2)}</strong></span>
  `;
  body.appendChild(stats);

  // Table
  const table = document.createElement('table');
  table.className = 'memory-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th style="width: 35%" title="The task description this memory was created from. Used to compute the intent embedding z_i for similarity matching (§3.3).">Intent</th>
        <th style="width: 30%" title="Trust score Q_i — a learned value updated after each task via temporal-difference learning (Eq. 8). Higher Q means the strategy is more reliably useful.">Q-Value</th>
        <th title="Number of times this memory was retrieved and injected into the agent's context. More usage means more Q-value updates.">Used</th>
        <th title="Ratio of successful task completions when this memory was in context. The Q-value converges toward this empirical success rate (Theorem 1).">Success</th>
        <th title="The training epoch when this memory was first created. Epoch 0 = warmup, subsequent epochs = live task runs.">Epoch</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');
  const sorted = [...memories].sort((a, b) => b.trustScore - a.trustScore);

  for (const mem of sorted) {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.title = 'Click to expand — shows the full strategy summary and trust score update history.';

    // Intent cell
    const intentTd = document.createElement('td');
    intentTd.className = 'truncate';
    intentTd.title = mem.intentText;
    intentTd.textContent = mem.intentText;
    tr.appendChild(intentTd);

    // Q-value cell
    const qTd = document.createElement('td');
    qTd.appendChild(createQBar(mem.trustScore));
    tr.appendChild(qTd);

    // Times used
    const usedTd = document.createElement('td');
    usedTd.textContent = String(mem.timesUsed);
    tr.appendChild(usedTd);

    // Times succeeded
    const successTd = document.createElement('td');
    successTd.textContent = `${mem.timesSucceeded}/${mem.timesUsed || 0}`;
    tr.appendChild(successTd);

    // Epoch
    const epochTd = document.createElement('td');
    epochTd.textContent = String(mem.createdAtEpoch);
    tr.appendChild(epochTd);

    // Expand on click
    tr.addEventListener('click', () => {
      const existing = tr.nextElementSibling;
      if (existing?.classList.contains('memory-detail-row')) {
        existing.remove();
        return;
      }
      const detailRow = document.createElement('tr');
      detailRow.className = 'memory-detail-row';
      const detailTd = document.createElement('td');
      detailTd.colSpan = 5;
      detailTd.innerHTML = `
        <div class="memory-expand">
          <div class="section-label" title="The experience text e_i — an LLM-generated strategy summary stored after task completion. This is what gets injected into the agent's prompt during retrieval.">Strategy Summary</div>
          <div style="margin-bottom: 8px">${escapeHtml(mem.experienceText)}</div>
          <div class="section-label" title="Eq. 8 — Q_new = Q_old + α·(reward - Q_old). Each row shows one temporal-difference update. The prediction error (reward - Q_old) drives learning.">Trust Score History (Eq. 8)</div>
          <div style="font-family: var(--font-mono); font-size: 13px;">
            ${mem.history.map(h =>
              `Epoch ${h.epoch}: ${h.oldScore.toFixed(3)} → ${h.newScore.toFixed(3)} (reward=${h.reward}, error=${h.predictionError.toFixed(3)})`
            ).join('<br>')}
            ${mem.history.length === 0 ? '<span style="color: var(--text-muted)">No updates yet</span>' : ''}
          </div>
        </div>
      `;
      detailRow.appendChild(detailTd);
      tr.after(detailRow);
    });

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  body.appendChild(table);

  // Convergence chart
  if (memories.some(m => m.history.length > 0)) {
    const chartLabel = document.createElement('div');
    chartLabel.className = 'section-label';
    chartLabel.style.marginTop = '16px';
    chartLabel.textContent = 'Q-Value Convergence';
    chartLabel.title = 'Theorem 1 — E[Q_t] = true_rate + (1-α)^t · (Q₀ - true_rate). Q-values converge exponentially toward each memory\'s true success rate. Variance is bounded by α/(2-α)·Var(reward).';
    body.appendChild(chartLabel);

    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    const canvas = document.createElement('canvas');
    chartContainer.appendChild(canvas);
    body.appendChild(chartContainer);

    const colors = ['#3b4fc4', '#15803d', '#b91c1c', '#92400e', '#1d4ed8', '#6d28d9', '#c2410c', '#0d9488'];
    const series = memories
      .filter(m => m.history.length > 0)
      .slice(0, 8)
      .map((m, i) => ({
        label: m.intentText.slice(0, 20),
        data: [m.history[0]?.oldScore ?? m.trustScore, ...m.history.map(h => h.newScore)],
        color: colors[i % colors.length],
      }));

    // Defer render to next frame so canvas has dimensions
    requestAnimationFrame(() => {
      renderLineChart(canvas, series, { yMin: -1, yMax: 1, xLabel: 'Updates' });
    });
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
