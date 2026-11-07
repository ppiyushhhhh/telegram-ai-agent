import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types';

export interface EphemeralSessionState {
  chatId: number;
  userId: number;
  isProcessing: boolean;
  lastActiveTimestamp: number;
  messageCount: number;
  ephemeralContext: Array<{ role: 'user' | 'assistant'; text: string }>;
}

/**
 * Cloudflare Durable Object for stateful session coordination,
 * atomic concurrency locking, and ephemeral short-term memory buffer.
 */
export class SessionDurableObject extends DurableObject {
  private state: EphemeralSessionState = {
    chatId: 0,
    userId: 0,
    isProcessing: false,
    lastActiveTimestamp: Date.now(),
    messageCount: 0,
    ephemeralContext: []
  };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<EphemeralSessionState>('session_state');
      if (stored) {
        this.state = stored;
      }
    });
  }

  /**
   * Attempts to acquire an execution lock for a chat session.
   * Prevents duplicate/concurrent message handling for the same chat.
   */
  public async acquireLock(chatId: number, userId: number): Promise<boolean> {
    const now = Date.now();
    // Auto-release lock if stuck for more than 45 seconds (fail-safe)
    if (this.state.isProcessing && now - this.state.lastActiveTimestamp < 45000) {
      return false;
    }

    this.state.chatId = chatId;
    this.state.userId = userId;
    this.state.isProcessing = true;
    this.state.lastActiveTimestamp = now;

    await this.ctx.storage.put('session_state', this.state);
    return true;
  }

  /**
   * Releases the execution lock after AI processing completes.
   */
  public async releaseLock(): Promise<void> {
    this.state.isProcessing = false;
    this.state.lastActiveTimestamp = Date.now();
    await this.ctx.storage.put('session_state', this.state);
  }

  /**
   * Appends an exchange to the fast ephemeral buffer (last 10 items).
   */
  public async appendEphemeralMessage(role: 'user' | 'assistant', text: string): Promise<void> {
    this.state.messageCount += 1;
    this.state.ephemeralContext.push({ role, text });
    if (this.state.ephemeralContext.length > 10) {
      this.state.ephemeralContext.shift();
    }
    await this.ctx.storage.put('session_state', this.state);
  }

  /**
   * Retrieves the current ephemeral session state.
   */
  public async getSessionState(): Promise<EphemeralSessionState> {
    return this.state;
  }

  /**
   * Clears the ephemeral buffer (e.g. on /reset command).
   */
  public async clearSession(): Promise<void> {
    this.state.ephemeralContext = [];
    this.state.isProcessing = false;
    this.state.lastActiveTimestamp = Date.now();
    await this.ctx.storage.put('session_state', this.state);
  }
}
