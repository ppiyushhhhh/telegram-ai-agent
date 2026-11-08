import type { IAIProvider, AIMessage, CompletionOptions, CompletionResult, EmbeddingResult } from './types';
import { AppError } from '../../middleware/error-handler';
import {
  ERROR_CODES,
  DEFAULT_WORKERS_AI_MODEL,
  DEFAULT_WORKERS_AI_EMBEDDING_MODEL,
  DEFAULT_AI_TEMPERATURE,
  DEFAULT_MAX_TOKENS
} from '../../config/constants';

export class WorkersAIProvider implements IAIProvider {
  public readonly name = 'workers-ai' as const;

  constructor(
    private readonly aiBinding?: any,
    private readonly defaultModel?: string
  ) {}

  public isConfigured(): boolean {
    return Boolean(this.aiBinding && typeof this.aiBinding.run === 'function');
  }

  public async generateCompletion(
    messages: AIMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    if (!this.isConfigured()) {
      throw new AppError(
        'Cloudflare Workers AI binding (env.AI) is not configured',
        500,
        ERROR_CODES.INVALID_CONFIG
      );
    }

    const model = (options?.model && options.model.startsWith('@cf/'))
      ? options.model
      : (this.defaultModel || DEFAULT_WORKERS_AI_MODEL);
    const formattedMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    const candidateModels = [
      model,
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      '@cf/meta/llama-3.2-3b-instruct',
      '@cf/meta/llama-3-8b-instruct'
    ];
    // Deduplicate candidate models while preserving order
    const uniqueModels = Array.from(new Set(candidateModels));

    let lastError: unknown;
    for (const targetModel of uniqueModels) {
      try {
        const response = await this.aiBinding.run(targetModel, {
          messages: formattedMessages,
          max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: options?.temperature ?? DEFAULT_AI_TEMPERATURE
        });

        const text = typeof response === 'string' ? response : (response?.response || '');
        if (text && text.trim().length > 0) {
          return {
            text,
            provider: 'workers-ai',
            model: targetModel,
            usage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0
            }
          };
        }
      } catch (err) {
        lastError = err;
        console.warn(`Workers AI model '${targetModel}' failed: ${err instanceof Error ? err.message : String(err)}. Trying next candidate...`);
      }
    }

    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    throw new AppError(`Workers AI error: ${msg}`, 502, ERROR_CODES.WORKERS_AI_ERROR, { originalError: msg });
  }

  public async generateEmbedding(text: string): Promise<EmbeddingResult> {
    if (!this.isConfigured()) {
      throw new AppError(
        'Cloudflare Workers AI binding (env.AI) is not configured',
        500,
        ERROR_CODES.INVALID_CONFIG
      );
    }

    const embeddingModel = DEFAULT_WORKERS_AI_EMBEDDING_MODEL;

    try {
      const response = await this.aiBinding.run(embeddingModel, {
        text: [text]
      });

      const values: number[] = Array.isArray(response?.data?.[0])
        ? response.data[0]
        : Array.isArray(response?.data)
        ? response.data
        : [];

      return {
        values,
        dimensions: values.length,
        provider: 'workers-ai'
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(`Workers AI Embedding error: ${msg}`, 502, ERROR_CODES.WORKERS_AI_ERROR, { originalError: msg });
    }
  }
}

