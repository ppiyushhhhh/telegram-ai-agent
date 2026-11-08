import type { Env } from '../../types';
import type { AIMessage, CompletionOptions, CompletionResult, EmbeddingResult, IAIProvider } from './types';
import { GeminiProvider } from './gemini';
import { WorkersAIProvider } from './workers-ai';
import { OpenAIProvider } from './openai';
import { AppError } from '../../middleware/error-handler';
import { ERROR_CODES, DEFAULT_PRIMARY_PROVIDER, DEFAULT_GEMINI_MODEL, DEFAULT_WORKERS_AI_MODEL, DEFAULT_OPENAI_MODEL } from '../../config/constants';

export class UnifiedAIService {
  private gemini: GeminiProvider;
  private workersAi: WorkersAIProvider;
  private openai: OpenAIProvider;
  private primaryProviderName: 'gemini' | 'workers-ai' | 'openai';

  constructor(env: Env) {
    this.primaryProviderName = (env.PRIMARY_AI_PROVIDER || DEFAULT_PRIMARY_PROVIDER) as 'gemini' | 'workers-ai' | 'openai';
    this.gemini = new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL);
    this.workersAi = new WorkersAIProvider(env.AI, env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL);
    this.openai = new OpenAIProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL);
  }

  public getPrimaryProviderName(): 'gemini' | 'workers-ai' | 'openai' {
    return this.primaryProviderName;
  }

  public isProviderReady(provider: 'gemini' | 'workers-ai' | 'openai'): boolean {
    switch (provider) {
      case 'gemini':
        return this.gemini.isConfigured();
      case 'workers-ai':
        return this.workersAi.isConfigured();
      case 'openai':
        return this.openai.isConfigured();
      default:
        return false;
    }
  }

  /**
   * Builds the fallback chain in order of priority:
   * 1. Primary provider (default: Gemini)
   * 2. Secondary provider (Cloudflare Workers AI - edge-native, zero credentials)
   * 3. Tertiary provider (OpenAI - strictly optional, only if credentials supplied)
   */
  private getProviderChain(): IAIProvider[] {
    const providers: IAIProvider[] = [];

    if (this.primaryProviderName === 'gemini') {
      providers.push(this.gemini, this.workersAi);
      if (this.openai.isConfigured()) {
        providers.push(this.openai);
      }
    } else if (this.primaryProviderName === 'workers-ai') {
      providers.push(this.workersAi, this.gemini);
      if (this.openai.isConfigured()) {
        providers.push(this.openai);
      }
    } else {
      // primary is openai
      providers.push(this.openai, this.gemini, this.workersAi);
    }

    return providers;
  }

  /**
   * Generates a chat completion following the priority fallback chain:
   * Primary (Gemini) -> Secondary (Workers AI) -> Tertiary (OpenAI if configured)
   */
  public async generateChatResponse(
    messages: AIMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const chain = this.getProviderChain();
    const errors: Array<{ provider: string; error: string }> = [];

    for (const provider of chain) {
      if (!provider.isConfigured()) {
        console.warn(`AI provider '${provider.name}' is not configured. Skipping.`);
        continue;
      }

      try {
        console.log(`Attempting completion with AI provider '${provider.name}'...`);
        const result = await Promise.race([
          provider.generateCompletion(messages, options),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after 20s for provider ${provider.name}`)), 20000)
          )
        ]);

        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.warn(`Provider '${provider.name}' failed: ${errorMsg}. Attempting next available provider in fallback chain...`);
        errors.push({ provider: provider.name, error: errorMsg });
      }
    }

    // If all providers failed or none were configured
    const errorSummary = errors.length > 0
      ? errors.map(e => `[${e.provider}]: ${e.error}`).join('; ')
      : 'No AI providers are configured with valid credentials or bindings.';

    throw new AppError(
      `All AI providers failed to generate a response. Details: ${errorSummary}`,
      502,
      ERROR_CODES.INTERNAL_ERROR,
      { errors }
    );
  }

  /**
   * Generates vector embeddings using the fallback chain.
   */
  public async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const chain = this.getProviderChain();
    const errors: Array<{ provider: string; error: string }> = [];

    for (const provider of chain) {
      if (!provider.isConfigured()) {
        continue;
      }

      try {
        const result = await Promise.race([
          provider.generateEmbedding(text),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after 15s for embedding provider ${provider.name}`)), 15000)
          )
        ]);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.warn(`Embedding provider '${provider.name}' failed: ${errorMsg}`);
        errors.push({ provider: provider.name, error: errorMsg });
      }
    }

    throw new AppError(
      `No configured AI provider available for vector embeddings. Errors: ${errors.map(e => e.error).join(', ')}`,
      500,
      ERROR_CODES.INVALID_CONFIG
    );
  }
}
