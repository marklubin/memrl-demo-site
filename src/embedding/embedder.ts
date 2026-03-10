import type { Embedder } from '../types.js';

/**
 * HuggingFace Transformers embedder using Xenova/all-MiniLM-L6-v2.
 * Runs ONNX via WebAssembly in-browser. ~23MB download, cached after first load.
 * Produces 384-dim L2-normalized vectors.
 */
export class HuggingFaceEmbedder implements Embedder {
  private pipeline: any = null;
  ready = false;
  private initPromise: Promise<void> | null = null;

  async init(onProgress?: (progress: number) => void): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      this.pipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        progress_callback: onProgress
          ? (data: any) => {
              if (data.progress !== undefined) onProgress(data.progress);
            }
          : undefined,
      });
      this.ready = true;
    })();

    return this.initPromise;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.pipeline) {
      throw new Error('Embedder not initialized. Call init() first.');
    }
    const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  }
}
