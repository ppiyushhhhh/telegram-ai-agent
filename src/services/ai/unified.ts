import type { Env } from '../../types';
import type { AIMessage, CompletionOptions, CompletionResult, EmbeddingResult } from './types';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';
import { AppError } from '../../middleware/error-handler';
import { ERROR_CODES } from '../../config/constants';

export class UnifiedAIService {
  private openai: OpenAIProvider;
  private gemini: GeminiProvider;
  private primaryProviderName: 'openai' | 'gemini';

  constructor(env: Env) {
    this.primaryProviderName = (env.PRIMARY_AI_PROVIDER || 'openai') as 'openai' | 'gemini';
    this.openai = new OpenAIProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
    this.gemini = new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL);
  }

  public getPrimaryProviderName(): 'openai' | 'gemini' {
    return this.primaryProviderName;
  }

  public isProviderReady(provider: 'openai' | 'gemini'): boolean {
    return provider === 'openai' ? this.openai.isConfigured() : this.gemini.isConfigured();
  }

  /**
   * Generates a chat completion using the primary AI provider.
   * If the primary provider fails and the secondary provider is configured,
   * automatically falls back to the secondary provider for maximum resilience.
   */
  public async generateChatResponse(
    messages: AIMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const isPrimaryOpenAI = this.primaryProviderName === 'openai';
    const primary = isPrimaryOpenAI ? this.openai : this.gemini;
    const fallback = isPrimaryOpenAI ? this.gemini : this.openai;

    // Check if primary is configured
    if (!primary.isConfigured()) {
      if (fallback.isConfigured()) {
        console.warn(`Primary AI provider '${primary.name}' is unconfigured. Using fallback '${fallback.name}'.`);
        return fallback.generateCompletion(messages, options);
      }
      throw new AppError(
        `Neither primary (${primary.name}) nor secondary (${fallback.name}) AI provider is configured.`,
        500,
        ERROR_CODES.INVALID_CONFIG
      );
    }

    try {
      return await primary.generateCompletion(messages, options);
    } catch (primaryError) {
      console.warn(
        `Primary AI provider '${primary.name}' failed. Attempting fallback to '${fallback.name}'. Error:`,
        primaryError instanceof Error ? primaryError.message : primaryError
      );

      if (fallback.isConfigured()) {
        try {
          const fallbackResult = await fallback.generateCompletion(messages, options);
          console.log(`Successfully completed response using fallback AI provider '${fallback.name}'.`);
          return fallbackResult;
        } catch (fallbackError) {
          console.error(`Fallback AI provider '${fallback.name}' also failed:`, fallbackError);
          throw primaryError; // Re-throw original primary error if both fail
        }
      }

      throw primaryError;
    }
  }

  /**
   * Generates vector embeddings for semantic memory search.
   */
  public async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const isPrimaryOpenAI = this.primaryProviderName === 'openai';
    const primary = isPrimaryOpenAI ? this.openai : this.gemini;
    const fallback = isPrimaryOpenAI ? this.gemini : this.openai;

    if (primary.isConfigured()) {
      try {
        return await primary.generateEmbedding(text);
      } catch (err) {
        if (fallback.isConfigured()) {
          console.warn(`Primary embedding provider failed, attempting fallback to '${fallback.name}'.`);
          return fallback.generateEmbedding(text);
        }
        throw err;
      }
    } else if (fallback.isConfigured()) {
      return fallback.generateEmbedding(text);
    }

    throw new AppError('No configured AI provider available for vector embeddings.', 500, ERROR_CODES.INVALID_CONFIG);
  }
}
