import { MockLLMClient } from '../../src/llm/mock-client.js';
import { MockEmbedder } from '../../src/embedding/mock-embedder.js';
import { MemoryBank } from '../../src/core/memory-bank.js';
import { DEFAULT_PARAMS } from '../../src/types.js';
import type { MemRLParams } from '../../src/types.js';

export function createTestFixtures(paramOverrides?: Partial<MemRLParams>) {
  return {
    llm: new MockLLMClient(),
    embedder: new MockEmbedder(),
    memoryBank: new MemoryBank(),
    params: { ...DEFAULT_PARAMS, ...paramOverrides },
  };
}
