/**
 * Unified AI Provider interfaces and types
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface CompletionResult {
  text: string;
  provider: 'openai' | 'gemini';
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface EmbeddingResult {
  values: number[];
  dimensions: number;
  provider: 'openai' | 'gemini';
}

export interface IAIProvider {
  readonly name: 'openai' | 'gemini';
  isConfigured(): boolean;
  generateCompletion(messages: AIMessage[], options?: CompletionOptions): Promise<CompletionResult>;
  generateEmbedding(text: string): Promise<EmbeddingResult>;
}

