import type { LLMClient, SyntheticTask, SyntheticTrajectory } from '../types.js';

export async function generateSyntheticTasks(llm: LLMClient, count: number): Promise<SyntheticTask[]> {
  const response = await llm.chat(
    [
      {
        role: 'system',
        content: `Generate ${count} varied tasks for a text adventure set in a fantasy tavern
with these locations: main_hall, kitchen, cellar, courtyard, upstairs_room, shop_front.

Each task should:
- Require 4-6 steps to complete
- Involve moving between locations and using objects
- Share structural patterns with other tasks (fetch/process/deliver, find/unlock/retrieve, etc.)
- Vary in specific objects and goals

Return as JSON array:
[
  {
    "id": "task_001",
    "description": "Serve a hot bowl of stew to the patron in the main hall",
    "category": "fetch_cook_deliver",
    "difficulty": "medium",
    "expectedSteps": 5
  },
  ...
]`,
      },
      {
        role: 'user',
        content: `Generate ${count} varied tasks now.`,
      },
    ],
    { temperature: 0.7, maxTokens: 3000 },
  );

  return JSON.parse(response.content) as SyntheticTask[];
}

export async function generateSyntheticTrajectory(
  llm: LLMClient,
  task: SyntheticTask,
): Promise<{ success: SyntheticTrajectory; failure: SyntheticTrajectory }> {
  const response = await llm.chat(
    [
      {
        role: 'user',
        content: `For this task, generate a plausible trajectory of an agent attempting it in a fantasy tavern.
Generate TWO trajectories: one successful and one failed (with a realistic mistake).

Task: ${task.description}

Return JSON:
{
  "success_trajectory": {
    "steps": ["go_to(kitchen)", "take(ingredients)", ...],
    "narrative": "brief description",
    "outcome": "success"
  },
  "failure_trajectory": {
    "steps": ["go_to(cellar)", ...],
    "narrative": "went to wrong place",
    "outcome": "failure"
  }
}`,
      },
    ],
    { temperature: 0.5, maxTokens: 1500 },
  );

  const parsed = JSON.parse(response.content);
  return {
    success: parsed.success_trajectory,
    failure: parsed.failure_trajectory,
  };
}
