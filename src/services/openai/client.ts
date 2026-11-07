import OpenAI from 'openai';
import { AppError } from '../../middleware/error-handler';
import { ERROR_CODES, DEFAULT_OPENAI_MODEL, DEFAULT_AI_TEMPERATURE, DEFAULT_MAX_TOKENS } from '../../config/constants';

export interface GenerateChatParams {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export class OpenAIService {
  private client: OpenAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new AppError('OpenAI API Key is required', 500, ERROR_CODES.INVALID_CONFIG);
    }
    this.client = new OpenAI({
      apiKey
    });
  }

  public async generateChatCompletion(params: GenerateChatParams): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: params.model || DEFAULT_OPENAI_MODEL,
        messages: params.messages,
        temperature: params.temperature ?? DEFAULT_AI_TEMPERATURE,
        max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS
      });

      const messageContent = response.choices[0]?.message?.content;
      if (!messageContent) {
        throw new AppError('Empty response received from OpenAI', 502, ERROR_CODES.OPENAI_API_ERROR);
      }

      return messageContent;
    } catch (err) {
      if (err instanceof AppError) throw err;
      const message = err instanceof Error ? err.message : 'Unknown OpenAI error';
      throw new AppError(
        `OpenAI API request failed: ${message}`,
        502,
        ERROR_CODES.OPENAI_API_ERROR,
        { originalError: message }
      );
    }
  }
}
