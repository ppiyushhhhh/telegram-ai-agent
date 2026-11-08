import type { Env } from '../../types';
import { UnifiedAIService } from '../ai/unified';
import { SemanticMemoryService } from '../memory/semantic';

export interface MemoryIndexTask {
  type: 'INDEX_SEMANTIC_MEMORY';
  userId: number;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface AuditLogTask {
  type: 'LOG_AUDIT_EVENT';
  eventType: string;
  userId?: number;
  chatId?: number;
  payload?: Record<string, unknown>;
}

export type QueueTask = MemoryIndexTask | AuditLogTask;

export async function processQueueBatch(
  batch: MessageBatch<QueueTask>,
  env: Env
): Promise<void> {
  const aiService = new UnifiedAIService(env);
  const memoryService = new SemanticMemoryService(env, aiService);

  for (const message of batch.messages) {
    const task = message.body;
    try {
      if (task.type === 'INDEX_SEMANTIC_MEMORY') {
        if (memoryService.isVectorizeReady()) {
          await memoryService.storeMemory(task.userId, task.content, task.metadata);
        }
        message.ack();
      } else if (task.type === 'LOG_AUDIT_EVENT') {
        if (env.DB) {
          const id = crypto.randomUUID();
          await env.DB
            .prepare(
              `INSERT INTO audit_logs (id, event_type, user_id, chat_id, payload)
               VALUES (?, ?, ?, ?, ?)`
            )
            .bind(
              id,
              task.eventType,
              task.userId || null,
              task.chatId || null,
              task.payload ? JSON.stringify(task.payload) : null
            )
            .run();
        }
        message.ack();
      }
    } catch (err) {
      console.error(`Failed to process queue task ${task.type}:`, err);
      // Retry message if transient failure
      message.retry();
    }
  }
}

