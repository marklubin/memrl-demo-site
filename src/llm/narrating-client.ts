import type { LLMClient, ChatMessage, ChatOptions, ChatResponse } from '../types.js';

export interface NarrationStep {
  phase: string;
  title: string;
  description: string;
  prompt: { role: string; content: string }[];
  response: string;
  timestamp: number;
}

export type NarrationCallback = (step: NarrationStep) => Promise<void>;

/**
 * Wraps any LLMClient to capture all prompts and responses.
 * The callback is called AFTER each LLM call completes.
 * If the callback returns a promise, we wait for it (enabling pause-to-read).
 */
export class NarratingLLMClient implements LLMClient {
  private callIndex = 0;

  constructor(
    private inner: LLMClient,
    private onStep: NarrationCallback,
  ) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const phase = this.detectPhase(messages);

    // Log to console for debugging
    console.group(`%c[LLM Call] ${phase.title}`, 'color: #6d28d9; font-weight: bold;');
    console.log('%cPrompt:', 'font-weight: bold;', messages);

    const response = await this.inner.chat(messages, options);

    console.log('%cResponse:', 'font-weight: bold;', response.content);
    console.groupEnd();

    const step: NarrationStep = {
      phase: phase.phase,
      title: phase.title,
      description: phase.description,
      prompt: messages.map(m => ({ role: m.role, content: m.content })),
      response: response.content,
      timestamp: Date.now(),
    };

    this.callIndex++;
    await this.onStep(step);

    return response;
  }

  private detectPhase(messages: ChatMessage[]): { phase: string; title: string; description: string } {
    const system = messages.find(m => m.role === 'system')?.content ?? '';
    const user = messages.find(m => m.role === 'user')?.content ?? '';

    if (system.includes('Dungeon Master') && (system.includes('Response Format') || user.includes('Generate'))) {
      return {
        phase: 'task_generation',
        title: 'DM: Task Generation',
        description: 'The Dungeon Master receives the tavern world description and generates a task contract — including solution steps (hidden from agent), success conditions, and world axioms.',
      };
    }

    if (system.includes('Dungeon Master') && user.includes('Action')) {
      const actionMatch = user.match(/Action[:\s]*(\w+\([^)]*\))/i);
      const action = actionMatch?.[1] ?? 'unknown';
      return {
        phase: 'dm_tick',
        title: `DM: Evaluate Action — ${action}`,
        description: `Two-pass evaluation: Pass 1 — DM checks the action against world axioms and updates its private scratch buffer. Pass 2 — DM generates a narrative response and updates the world state.`,
      };
    }

    if (system.includes('adventurer completing tasks')) {
      return {
        phase: 'agent_action',
        title: `Agent: Decide Action (Turn ${this.callIndex + 1})`,
        description: 'The agent sees the task description, current world state, and any retrieved memories. It reasons through its options and picks exactly one action.',
      };
    }

    if (system.includes('Summarize your experience')) {
      return {
        phase: 'memory_summary',
        title: 'Agent: Summarize Experience',
        description: 'After the task ends, the agent writes a concise strategy summary. This becomes the experience_text stored in the new memory entry.',
      };
    }

    if (system.includes('varied tasks')) {
      return {
        phase: 'synthetic_tasks',
        title: 'Warmup: Generate Synthetic Tasks',
        description: 'Generating synthetic tasks for warmup training.',
      };
    }

    return {
      phase: 'unknown',
      title: `LLM Call #${this.callIndex + 1}`,
      description: 'An LLM call was made.',
    };
  }
}
