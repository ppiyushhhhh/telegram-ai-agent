import type { Env } from '../../types';
import type { AIMessage, CompletionOptions, CompletionResult, EmbeddingResult } from './types';
import { WorkersAIProvider } from './workers-ai';
import { AppError } from '../../middleware/error-handler';
import {
  ERROR_CODES,
  DEFAULT_PRIMARY_PROVIDER,
  DEFAULT_WORKERS_AI_MODEL,
  DEFAULT_WORKERS_AI_FALLBACK_MODELS,
  DEFAULT_WORKERS_AI_EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS
} from '../../config/constants';

/**
 * UnifiedAIService: Primary and sole AI service provider powered exclusively
 * by Cloudflare Workers AI serverless edge compute models.
 * Zero external credentials or API keys required.
 */
export class UnifiedAIService {
  private workersAi: WorkersAIProvider;
  private primaryProviderName: 'workers-ai' = 'workers-ai';

  constructor(env: Env) {
    this.workersAi = new WorkersAIProvider(
      env.AI,
      env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL
    );
  }

  public getPrimaryProviderName(): 'workers-ai' {
    return this.primaryProviderName;
  }

  public isProviderReady(provider: string = 'workers-ai'): boolean {
    if (provider === 'workers-ai') {
      return this.workersAi.isConfigured();
    }
    return false;
  }

  public getActiveModel(): string {
    return this.workersAi.getActiveModel();
  }

  public getFallbackModels(): readonly string[] {
    return DEFAULT_WORKERS_AI_FALLBACK_MODELS;
  }

  public getEmbeddingModel(): string {
    return DEFAULT_WORKERS_AI_EMBEDDING_MODEL;
  }

  public getEmbeddingDimensions(): number {
    return EMBEDDING_DIMENSIONS;
  }

  /**
   * Generates a chat completion using Cloudflare Workers AI with automatic
   * multi-model edge resilience fallback (Llama 3.3 70B -> Llama 3.2 3B -> Llama 3 8B).
   */
  public async generateChatResponse(
    messages: AIMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    if (!this.workersAi.isConfigured()) {
      throw new AppError(
        'Cloudflare Workers AI binding (env.AI) is not configured.',
        500,
        ERROR_CODES.INVALID_CONFIG
      );
    }

    try {
      const result = await Promise.race([
        this.workersAi.generateCompletion(messages, options),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout after 20s for Workers AI execution')), 20000)
        )
      ]);

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new AppError(
        `Workers AI failed to generate response: ${errorMsg}`,
        502,
        ERROR_CODES.WORKERS_AI_ERROR,
        { originalError: errorMsg }
      );
    }
  }

  /**
   * Generates 768-dimensional vector embeddings using Cloudflare Workers AI (@cf/baai/bge-base-en-v1.5).
   */
  public async generateEmbedding(text: string): Promise<EmbeddingResult> {
    if (!this.workersAi.isConfigured()) {
      throw new AppError(
        'Cloudflare Workers AI binding (env.AI) is not configured for vector embeddings.',
        500,
        ERROR_CODES.INVALID_CONFIG
      );
    }

    try {
      const result = await Promise.race([
        this.workersAi.generateEmbedding(text),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout after 15s for Workers AI embedding generation')), 15000)
        )
      ]);

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new AppError(
        `Workers AI embedding generation failed: ${errorMsg}`,
        502,
        ERROR_CODES.WORKERS_AI_ERROR,
        { originalError: errorMsg }
      );
    }
  }

  /**
   * Transcribes voice/audio recordings using Cloudflare Workers AI Whisper (@cf/openai/whisper).
   */
  public async transcribeAudio(audioBytes: Uint8Array): Promise<string> {
    if (!this.workersAi.isConfigured()) {
      throw new AppError(
        'Cloudflare Workers AI binding (env.AI) is not configured for Whisper audio transcription.',
        500,
        ERROR_CODES.INVALID_CONFIG
      );
    }

    try {
      const result = await Promise.race([
        this.workersAi.transcribeAudio(audioBytes),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout after 30s for Workers AI Whisper transcription')), 30000)
        )
      ]);

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new AppError(
        `Workers AI audio transcription failed: ${errorMsg}`,
        502,
        ERROR_CODES.WORKERS_AI_ERROR,
        { originalError: errorMsg }
      );
    }
  }

  /**
   * Understands and describes images using Cloudflare Workers AI Vision (@cf/meta/llama-3.2-11b-vision-instruct).
   */
  public async describeImage(imageBytes: Uint8Array, prompt?: string): Promise<string> {
    if (!this.workersAi.isConfigured()) {
      throw new AppError(
        'Cloudflare Workers AI binding (env.AI) is not configured for Vision model.',
        500,
        ERROR_CODES.INVALID_CONFIG
      );
    }

    try {
      const result = await Promise.race([
        this.workersAi.describeImage(imageBytes, prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout after 30s for Workers AI Vision analysis')), 30000)
        )
      ]);

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new AppError(
        `Workers AI image analysis failed: ${errorMsg}`,
        502,
        ERROR_CODES.WORKERS_AI_ERROR,
        { originalError: errorMsg }
      );
    }
  }
}
