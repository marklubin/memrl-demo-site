import type { LLMClient, ChatMessage, ChatOptions, ChatResponse } from '../types.js';

/**
 * OpenAI-compatible chat completions client.
 * Works with Cerebras, OpenAI, or any provider implementing
 * POST /v1/chat/completions.
 */
export class OpenAIClient implements LLMClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string,
  ) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.model,
      stream: false,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    };

    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '(no body)');
      throw new Error(`LLM API error ${res.status}: ${text}`);
    }

    const json = await res.json();
    const choice = json.choices?.[0];
    if (!choice) {
      throw new Error('LLM API returned no choices');
    }

    return {
      content: choice.message?.content ?? '',
      usage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens ?? 0,
            completionTokens: json.usage.completion_tokens ?? 0,
          }
        : undefined,
    };
  }
}
