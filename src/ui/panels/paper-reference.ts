import type { AppState } from '../../types.js';
import type { Store } from '../../state/store.js';

const ALGO_CARDS = [
  {
    id: 'memory_structure',
    title: 'Memory Structure (§3.2)',
    tooltip: '§3.2 — Each memory entry is a triplet of intent embedding, experience text, and trust score. The bank grows as the agent completes tasks.',
    content: `Each memory is a triplet:
  (intent_embedding, experience_text, trust_score)

The full bank:
  M = { (zᵢ, eᵢ, Qᵢ) for i in 1..|M| }`,
  },
  {
    id: 'phase_a',
    title: 'Phase A — Similarity Filter (Eq. 5)',
    tooltip: 'Eq. 5 — Filters the memory bank by cosine similarity to the current task. Only memories above δ pass. This prevents irrelevant memories from polluting the agent\'s context.',
    content: `candidates = top_k1(
  [i for i in bank
   if cosine_sim(task, zᵢ) > SimilarityThreshold(δ)],
  sorted by cosine_sim
)

If no candidates pass threshold
  → agent gets no memory context.`,
  },
  {
    id: 'phase_b',
    title: 'Phase B — Value-Aware Selection (Eq. 6)',
    tooltip: 'Eq. 6 — Ranks Phase A candidates by blending normalized similarity and normalized Q-value. λ controls the exploit/explore tradeoff. This is what makes MemRL different from standard RAG.',
    content: `For each candidate i in pool:
  norm_sim = z_score(similarityᵢ, across pool)
  norm_q   = z_score(Qᵢ, across pool)
  scoreᵢ   = (1 - ExploitWeight(λ)) · norm_sim
            + ExploitWeight(λ) · norm_q

context = top_k2(candidates, sorted by score)`,
  },
  {
    id: 'q_update',
    title: 'Q-Value Update (Eq. 8)',
    tooltip: 'Eq. 8 — After each task, the trust score of every memory that was in the agent\'s context is updated via temporal-difference learning. The prediction error (reward - Q_old) drives convergence.',
    content: `After task completes with reward r:
  For each memory used in context:
    prediction_error = r - Q_old
    Q_new = Q_old + LearningRate(α) · prediction_error`,
  },
  {
    id: 'convergence',
    title: 'Convergence (Theorem 1)',
    tooltip: 'Theorem 1 — Proves that Q-values converge exponentially to the true success rate of each memory\'s strategy. Variance is bounded, guaranteeing stable learning.',
    content: `After t updates, expected Q converges:
  E[Qₜ] = true_rate
         + (1 - LearningRate(α))ᵗ · (Q₀ - true_rate)

Variance is bounded:
  Var(Q) ≤ (LearningRate(α) / (2 - LearningRate(α)))
           · Var(reward)`,
  },
];

export function mountPaperReference(el: HTMLElement, store: Store<AppState>): void {
  el.innerHTML = `
    <div class="header-bar">
      <span class="title" title="MemRL: Memory-augmented RL for LLM agents. The core idea: store past task experiences as memories with learned trust scores, then retrieve the most useful ones to guide future decisions.">MemRL: Self-Evolving Agents via Runtime Reinforcement Learning on Episodic Memory</span>
      <span style="font-size: 14px; color: var(--text-secondary)">
        Zhang, Wang, Zhou et al. — arXiv:2601.03192, Jan 2026 &nbsp;
        <a href="https://arxiv.org/abs/2601.03192" target="_blank">Paper</a> |
        <a href="https://github.com/MemTensor/MemRL" target="_blank">Code</a>
      </span>
      <button id="toggle-algo" style="font-size: 14px; padding: 3px 8px;" title="Show/hide the 5 core algorithm components from the paper. Active steps are highlighted during task execution.">Algorithm Reference ▾</button>
    </div>
    <div class="algo-cards" id="algo-cards">
      ${ALGO_CARDS.map(card => `
        <div class="algo-card" id="algo-${card.id}" title="${card.tooltip}">
          <h4>${card.title}</h4>
          <pre style="white-space: pre-wrap; margin: 0; font-size: 13px;">${card.content}</pre>
        </div>
      `).join('')}
    </div>
  `;

  // Toggle expand
  const toggleBtn = el.querySelector('#toggle-algo')!;
  toggleBtn.addEventListener('click', () => {
    el.classList.toggle('expanded');
    toggleBtn.textContent = el.classList.contains('expanded')
      ? 'Algorithm Reference ▴'
      : 'Algorithm Reference ▾';
  });

  // Highlight active card based on game phase
  store.on('activeAlgoCard', (cardId) => {
    for (const card of ALGO_CARDS) {
      const cardEl = el.querySelector(`#algo-${card.id}`);
      if (cardEl) {
        cardEl.classList.toggle('active', card.id === cardId);
      }
    }
  });
}
