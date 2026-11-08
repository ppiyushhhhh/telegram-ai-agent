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
  provider: 'gemini' | 'workers-ai' | 'openai';
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
  provider: 'gemini' | 'workers-ai' | 'openai';
}

export interface IAIProvider {
  readonly name: 'gemini' | 'workers-ai' | 'openai';
  isConfigured(): boolean;
  generateCompletion(messages: AIMessage[], options?: CompletionOptions): Promise<CompletionResult>;
  generateEmbedding(text: string): Promise<EmbeddingResult>;
}

