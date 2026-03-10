# MemRL Interactive Demo

An interactive browser-based visualization of **MemRL: Self-Evolving Agents via Runtime Reinforcement Learning on Episodic Memory** ([arXiv:2601.03192](https://arxiv.org/abs/2601.03192), Zhang, Wang, Zhou et al., Jan 2026).

The demo runs a fantasy tavern text adventure where an RL agent learns from past task experiences stored as memories with learned trust scores — the core MemRL loop running live in your browser.

## Quick Start

```bash
npm install
npm run dev        # http://localhost:3456
```

### Demo Mode (no API key)

Toggle **Demo Mode** in the control bar to use a mock LLM with scripted responses. Good for exploring the UI and understanding the pipeline without API costs.

### Real LLM Mode

1. Turn off Demo Mode
2. Enter your API config in the control bar:
   - **Base URL** — any OpenAI-compatible endpoint (e.g. `https://api.cerebras.ai`, `https://api.openai.com`)
   - **API Key** — your provider's API key
   - **Model** — model name (e.g. `gpt-oss-120b`, `gpt-4o`)
3. Select a task from the dropdown and click **Run Task**

## How It Works

The UI has four main panels that map directly to MemRL paper sections:

| Panel | Paper Section | What It Shows |
|-------|--------------|---------------|
| **World** | §3.1 Environment | Current location, objects, inventory, DM contract, scratch buffer, narrative log |
| **Retrieval Inspector** | §3.3 Retrieval | Two-phase memory retrieval: Phase A similarity filter (Eq. 5) → Phase B value-aware ranking (Eq. 6) |
| **Memory Bank** | §3.2 Memory Structure | All stored memories with Q-values, usage counts, success rates, convergence chart |
| **Agent** | §4.1 Agent | Chain-of-thought reasoning, selected actions, DM responses, full prompt inspector |

### The MemRL Loop

Each task run follows the paper's Algorithm 1:

1. **Task Setup** — DM generates or loads a task contract with success conditions and world axioms
2. **Retrieval** (§3.3) — Embed the task description, then two-phase retrieval:
   - **Phase A**: Filter memories by cosine similarity against `SimilarityThreshold(δ)` (Eq. 5), keep top `CandidatePoolSize(k₁)`
   - **Phase B**: Rank candidates by blended score `(1-λ)·norm_sim + λ·norm_Q` (Eq. 6), select top `ContextSize(k₂)`
3. **Agent Loop** — Agent receives task + retrieved memories as context, takes actions up to `MaxStepsPerTask`
4. **Q-Value Update** (§3.5) — Apply reward to all selected memories: `Q_new = Q_old + α·(reward - Q_old)` (Eq. 8)
5. **Memory Creation** — Agent summarizes its experience into a new memory entry with `InitialTrustScore(Q₀)`

### Paper Cross-Reference

Every UI element has a tooltip (hover to see) that references the exact paper equation, section, or theorem. Key mappings:

| Parameter | Paper Reference | Default | Description |
|-----------|----------------|---------|-------------|
| `SimilarityThreshold(δ)` | Eq. 5 | 0.5 | Minimum cosine similarity to pass Phase A |
| `CandidatePoolSize(k₁)` | Eq. 5 | 10 | Max candidates after Phase A |
| `ContextSize(k₂)` | Eq. 6 | 3 | Memories injected into agent context |
| `ExploitWeight(λ)` | Eq. 6 | 0.5 | Balance similarity vs Q-value (0=pure RAG, 1=pure exploitation) |
| `LearningRate(α)` | Eq. 8 | 0.1 | Q-value update step size |
| `SuccessReward(r⁺)` | §3.5 | +1.0 | Reward on task success |
| `FailureReward(r⁻)` | §3.5 | -1.0 | Reward on task failure |
| `InitialTrustScore(Q₀)` | Theorem 1 | 0.0 | Starting Q-value for new memories |
| `ExplorationRate(ε)` | Codebase | 0.1 | ε-greedy random selection probability |
| `MaxStepsPerTask` | §3.1 | 12 | Step limit before forced failure |

**Theorem 1 (Q-Value Convergence)**: `E[Q_t] = true_rate + (1-α)^t · (Q₀ - true_rate)`. Q-values converge exponentially toward each memory's true success rate. The Memory Bank panel includes a convergence chart visualizing this.

### Selection Modes

- **Paper Mode** (default) — Eq. 6 blended scoring with `ExploitWeight(λ)`
- **ε-Greedy Mode** — From the [MemRL codebase](https://github.com/MemTensor/MemRL); selects a random candidate with probability `ε` instead of the highest-scored one

### Guided Mode

Toggle **Guided** in the control bar to open a step-by-step narration sidebar. Every LLM call is shown with its full prompt and response, with a **Continue** button to advance. Useful for understanding the complete MemRL loop.

## Controls

| Button | Action |
|--------|--------|
| **Step** | Execute one agent action (manual mode) |
| **Run Task** | Run a complete task start-to-finish |
| **Run Epoch** | Run all predefined tasks as one training epoch |
| **Reset** | Clear game state and memory bank (keeps API config) |

**Speed** controls delay between steps: Step (manual), Slow (1.5s), Fast (200ms).

## Architecture

```
src/
├── core/           # Memory bank, retrieval (Eq. 5+6), cosine similarity
├── embedding/      # HuggingFace MiniLM-L6 (browser ONNX) + mock embedder
├── engine/         # Game loop (Algorithm 1), DM (§3.1), agent (§4.1), tasks, world state
├── llm/            # OpenAI-compatible client, mock client, narrating wrapper
├── state/          # Reactive store, persistence (localStorage)
├── ui/             # Panels, components, app mount
└── warmup/         # Seed memories, synthetic task generation
```

Embeddings run client-side using `@huggingface/transformers` with the `all-MiniLM-L6-v2` model (384-dim, ~23MB ONNX). On first load, the model is downloaded and cached by the browser.

## Deployment

Deployed as a static site on Cloudflare Pages. Commits to `main` trigger automatic deployment via GitHub Actions.

```bash
npm run build      # Build to dist/
npm run deploy     # Manual deploy to Cloudflare Pages
```

## References

- **Paper**: [MemRL: Self-Evolving Agents via Runtime Reinforcement Learning on Episodic Memory](https://arxiv.org/abs/2601.03192) (Zhang, Wang, Zhou et al., arXiv:2601.03192, Jan 2026)
- **Code**: [github.com/MemTensor/MemRL](https://github.com/MemTensor/MemRL)
