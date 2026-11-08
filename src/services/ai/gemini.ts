import type { IAIProvider, AIMessage, CompletionOptions, CompletionResult, EmbeddingResult } from './types';
import { AppError } from '../../middleware/error-handler';
import {
  ERROR_CODES,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  DEFAULT_AI_TEMPERATURE,
  DEFAULT_MAX_TOKENS
} from '../../config/constants';

export class GeminiProvider implements IAIProvider {
  public readonly name = 'gemini' as const;
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(private readonly apiKey?: string, private readonly defaultModel?: string) {}

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  public async generateCompletion(
    messages: AIMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    if (!this.apiKey) {
      throw new AppError('Gemini API key is not configured', 500, ERROR_CODES.INVALID_CONFIG);
    }

    const model = options?.model || this.defaultModel || DEFAULT_GEMINI_MODEL;
    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;

    // Separate system messages for Gemini's systemInstruction
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    const systemInstruction = systemMessages.length > 0
      ? { parts: [{ text: systemMessages.map(m => m.content).join('\n\n') }] }
      : undefined;

    // Convert messages to Gemini format: role 'user' | 'model'
    const contents = nonSystemMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    // If contents is empty (e.g. only system prompt), provide a fallback prompt
    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? DEFAULT_AI_TEMPERATURE,
        maxOutputTokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS
      }
    };

    if (systemInstruction) {
      payload.systemInstruction = systemInstruction;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorJson = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      const errorMsg = errorJson.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new AppError(`Gemini API error: ${errorMsg}`, 502, ERROR_CODES.GEMINI_API_ERROR, { originalError: errorMsg });
    }

    const data = await response.json<{
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    }>();

    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text || '';

    return {
      text,
      provider: 'gemini',
      model,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount,
        completionTokens: data.usageMetadata?.candidatesTokenCount,
        totalTokens: data.usageMetadata?.totalTokenCount
      }
    };
  }

  public async generateEmbedding(text: string): Promise<EmbeddingResult> {
    if (!this.apiKey) {
      throw new AppError('Gemini API key is not configured', 500, ERROR_CODES.INVALID_CONFIG);
    }

    const embeddingModel = DEFAULT_GEMINI_EMBEDDING_MODEL;
    const url = `${this.baseUrl}/models/${embeddingModel}:embedContent?key=${this.apiKey}`;
    const payload = {
      model: `models/${embeddingModel}`,
      content: {
        parts: [{ text }]
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorJson = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      const errorMsg = errorJson.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new AppError(`Gemini Embedding error: ${errorMsg}`, 502, ERROR_CODES.GEMINI_API_ERROR, { originalError: errorMsg });
    }

    const data = await response.json<{
      embedding?: { values?: number[] };
    }>();

    const values = data.embedding?.values || [];
    return {
      values,
      dimensions: values.length,
      provider: 'gemini'
    };
  }
}
