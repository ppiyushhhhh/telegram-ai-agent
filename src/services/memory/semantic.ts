import type { Env } from '../../types';
import type { UnifiedAIService } from '../ai/unified';

export interface MemorySnippet {
  id: string;
  userId: number;
  content: string;
  score?: number;
  timestamp: string;
}

export class SemanticMemoryService {
  constructor(
    private readonly env: Env,
    private readonly aiService: UnifiedAIService
  ) {}

  public isVectorizeReady(): boolean {
    return Boolean(this.env.VECTOR_INDEX);
  }

  /**
   * Retrieves relevant semantic memories for a given user query using vector search.
   * Gracefully returns empty array if Vectorize index is not bound or query fails.
   */
  public async queryRelevantMemories(
    userId: number,
    queryText: string,
    topK = 3
  ): Promise<MemorySnippet[]> {
    if (!this.env.VECTOR_INDEX) {
      return [];
    }

    try {
      const embedding = await this.aiService.generateEmbedding(queryText);
      const searchResults = await this.env.VECTOR_INDEX.query(embedding.values, {
        topK,
        filter: { userId }
      });

      const memories: MemorySnippet[] = [];
      for (const match of searchResults.matches || []) {
        if (match.metadata && typeof match.metadata.content === 'string') {
          memories.push({
            id: match.id,
            userId,
            content: match.metadata.content,
            score: match.score,
            timestamp: (match.metadata.timestamp as string) || new Date().toISOString()
          });
        }
      }

      return memories;
    } catch (err) {
      console.warn('Semantic memory query failed:', err);
      return [];
    }
  }

  /**
   * Embeds and stores a piece of knowledge/memory into Cloudflare Vectorize.
   */
  public async storeMemory(
    userId: number,
    content: string,
    extraMetadata?: Record<string, unknown>
  ): Promise<string | null> {
    if (!this.env.VECTOR_INDEX) {
      return null;
    }

    try {
      const id = crypto.randomUUID();
      const embedding = await this.aiService.generateEmbedding(content);

      await this.env.VECTOR_INDEX.upsert([
        {
          id,
          values: embedding.values,
          metadata: {
            userId,
            content,
            timestamp: new Date().toISOString(),
            ...extraMetadata
          }
        }
      ]);

      return id;
    } catch (err) {
      console.warn('Failed to store semantic memory in Vectorize:', err);
      return null;
    }
  }
}

