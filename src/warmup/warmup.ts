import type {
  LLMClient, Embedder, MemRLParams, WarmupConfig, WarmupProgress,
  MemoryEntry, SyntheticTask, SyntheticTrajectory,
} from '../types.js';
import { MemoryBank, createMemoryEntry, updateTrustScore } from '../core/memory-bank.js';
import { retrieve } from '../core/retrieval.js';
import { generateSyntheticTasks, generateSyntheticTrajectory } from './task-generator.js';
import { PREDEFINED_TASKS } from '../engine/tasks.js';

export type WarmupProgressCallback = (progress: WarmupProgress) => void;

export async function runWarmup(
  config: WarmupConfig,
  llm: LLMClient,
  embedder: Embedder,
  memoryBank: MemoryBank,
  params: MemRLParams,
  onProgress?: WarmupProgressCallback,
): Promise<void> {
  // Generate or use predefined tasks
  let tasks: SyntheticTask[];
  if (config.strategy === 'manual_seed') {
    return; // Manual seed handled separately
  }

  if (config.taskCount <= PREDEFINED_TASKS.length) {
    tasks = PREDEFINED_TASKS.slice(0, config.taskCount).map((t, i) => ({
      id: t.id,
      description: t.description,
      category: 'predefined',
      difficulty: 'medium',
      expectedSteps: t.solutionSteps.length,
    }));
  } else {
    tasks = await generateSyntheticTasks(llm, config.taskCount);
  }

  let successCount = 0;
  let failureCount = 0;
  let totalQ = 0;

  for (let epoch = 0; epoch < config.epochs; epoch++) {
    for (let ti = 0; ti < tasks.length; ti++) {
      const task = tasks[ti];

      // Generate trajectory
      let trajectory: SyntheticTrajectory;
      if (config.strategy === 'full_llm') {
        // For full_llm, generate both and pick based on "simulated" success
        const trajs = await generateSyntheticTrajectory(llm, task);
        // Alternate success/failure with some randomness for realism
        trajectory = (epoch + ti) % 3 === 0 ? trajs.failure : trajs.success;
      } else {
        const trajs = await generateSyntheticTrajectory(llm, task);
        trajectory = (epoch + ti) % 3 === 0 ? trajs.failure : trajs.success;
      }

      const outcome = trajectory.outcome;
      if (outcome === 'success') successCount++;
      else failureCount++;

      // Embed the task
      const embedding = await embedder.embed(task.description);

      // If bank not empty: retrieve and update Q-values
      if (memoryBank.size() > 0) {
        const result = retrieve(embedding, memoryBank.getAll(), params, 'paper');
        const reward = outcome === 'success' ? params.successReward : params.failureReward;

        for (const candidate of result.selected) {
          const mem = memoryBank.getById(candidate.memory.id);
          if (mem) {
            updateTrustScore(mem, reward, params.learningRate, epoch, task.id);
          }
        }
      }

      // Create memory summary
      const summaryResponse = await llm.chat(
        [
          {
            role: 'system',
            content: 'You just completed (or failed) a task. Summarize your experience as a reusable strategy.',
          },
          {
            role: 'user',
            content: `Task: ${task.description}\nOutcome: ${outcome}\nSteps: ${trajectory.steps.join(' → ')}\n\nWrite a concise strategy summary (3-5 sentences).`,
          },
        ],
        { temperature: 0, maxTokens: 300 },
      );

      // Store new memory
      const newEntry = createMemoryEntry(
        task.description,
        summaryResponse.content,
        embedding,
        params.initialTrustScore,
        epoch,
      );
      if (outcome === 'success') newEntry.timesSucceeded = 1;
      memoryBank.add(newEntry);

      totalQ = memoryBank.getAll().reduce((s, m) => s + m.trustScore, 0);
      const avgQ = totalQ / memoryBank.size();

      onProgress?.({
        currentEpoch: epoch,
        totalEpochs: config.epochs,
        currentTask: ti + 1,
        totalTasks: tasks.length,
        successCount,
        failureCount,
        memoriesCreated: memoryBank.size(),
        avgQValue: avgQ,
      });
    }
  }
}

/** Import manual seed entries, computing embeddings for each. */
export async function importManualSeed(
  entries: { intentText: string; experienceText: string; trustScore: number }[],
  embedder: Embedder,
  memoryBank: MemoryBank,
): Promise<void> {
  for (const entry of entries) {
    const embedding = await embedder.embed(entry.intentText);
    const mem = createMemoryEntry(
      entry.intentText,
      entry.experienceText,
      embedding,
      entry.trustScore,
      0,
    );
    memoryBank.add(mem);
  }
}
