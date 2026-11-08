import OpenAI from 'openai';
import type { IAIProvider, AIMessage, CompletionOptions, CompletionResult, EmbeddingResult } from './types';
import { AppError } from '../../middleware/error-handler';
import { ERROR_CODES, DEFAULT_OPENAI_MODEL, DEFAULT_AI_TEMPERATURE, DEFAULT_MAX_TOKENS } from '../../config/constants';

export class OpenAIProvider implements IAIProvider {
  public readonly name = 'openai' as const;
  private client: OpenAI | null = null;

  constructor(private readonly apiKey?: string, private readonly defaultModel?: string) {
    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        fetch: (url: any, init: any) => fetch(url, init)
      });
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.client && this.apiKey);
  }

  public async generateCompletion(
    messages: AIMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    if (!this.client) {
      throw new AppError('OpenAI API key is not configured', 500, ERROR_CODES.INVALID_CONFIG);
    }

    const model = (options?.model && !options.model.startsWith('@cf/') && !options.model.startsWith('gemini'))
      ? options.model
      : (this.defaultModel || DEFAULT_OPENAI_MODEL);
    const formattedMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages: formattedMessages,
        temperature: options?.temperature ?? DEFAULT_AI_TEMPERATURE,
        max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS
      });

      const choice = response.choices[0];
      const text = choice?.message?.content || '';

      return {
        text,
        provider: 'openai',
        model,
        usage: {
          promptTokens: response.usage?.prompt_tokens,
          completionTokens: response.usage?.completion_tokens,
          totalTokens: response.usage?.total_tokens
        }
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(`OpenAI API error: ${msg}`, 502, ERROR_CODES.OPENAI_API_ERROR, { originalError: msg });
    }
  }

  public async generateEmbedding(text: string): Promise<EmbeddingResult> {
    if (!this.client) {
      throw new AppError('OpenAI API key is not configured', 500, ERROR_CODES.INVALID_CONFIG);
    }

    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: text
      });

      const values = response.data[0]?.embedding || [];
      return {
        values,
        dimensions: values.length,
        provider: 'openai'
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(`OpenAI Embedding error: ${msg}`, 502, ERROR_CODES.OPENAI_API_ERROR, { originalError: msg });
    }
  }
}

