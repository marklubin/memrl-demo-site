import { createAppStore } from './state/app-state.js';
import { mountApp } from './ui/app.js';
import { HuggingFaceEmbedder } from './embedding/embedder.js';

async function boot(): Promise<void> {
  const { store, memoryBank } = createAppStore();

  // Mount the UI
  mountApp(store, memoryBank);

  // Initialize the HuggingFace embedder in the background
  if (!store.getState().demoMode) {
    try {
      const embedder = new HuggingFaceEmbedder();
      await embedder.init((progress) => {
        console.log(`Embedding model loading: ${Math.round(progress)}%`);
      });
      (window as any).__embedder = embedder;
      store.setState({ embeddingReady: true });
      console.log('Embedding model ready.');

      // Re-embed any existing memories that were stored with mock embeddings
      const memories = memoryBank.getAll();
      if (memories.length > 0) {
        console.log(`Re-embedding ${memories.length} memories with HuggingFace...`);
        for (const mem of memories) {
          mem.intentEmbedding = await embedder.embed(mem.intentText);
        }
        store.setState({ memoryBank: memoryBank.toJSON() });
        console.log('Memory re-embedding complete.');
      }
    } catch (err) {
      console.warn('Failed to load embedding model, using mock:', err);
      store.setState({ embeddingReady: false });
    }
  }
}

boot().catch(console.error);
