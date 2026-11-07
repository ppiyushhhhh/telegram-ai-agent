import type {
  TelegramMessage,
  SendMessageOptions,
  SetWebhookOptions
} from './types';
import { AppError } from '../../middleware/error-handler';
import { ERROR_CODES } from '../../config/constants';

export class TelegramClient {
  private readonly baseUrl: string;

  constructor(private readonly botToken: string) {
    if (!botToken) {
      throw new AppError('Telegram Bot Token is required', 500, ERROR_CODES.INVALID_CONFIG);
    }
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  private async call<T>(method: string, payload?: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/${method}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: payload ? JSON.stringify(payload) : undefined
    });

    const data = await response.json<{ ok: boolean; result: T; description?: string }>();
    if (!data.ok) {
      throw new AppError(
        `Telegram API error on ${method}: ${data.description || 'Unknown error'}`,
        response.status >= 400 && response.status < 500 ? 400 : 502,
        ERROR_CODES.TELEGRAM_API_ERROR,
        { method, description: data.description }
      );
    }

    return data.result;
  }

  public async sendMessage(options: SendMessageOptions): Promise<TelegramMessage> {
    return this.call<TelegramMessage>('sendMessage', options as unknown as Record<string, unknown>);
  }

  public async sendChatAction(chatId: number | string, action: 'typing' | 'upload_photo' | 'record_video'): Promise<boolean> {
    return this.call<boolean>('sendChatAction', { chat_id: chatId, action });
  }

  public async setWebhook(options: SetWebhookOptions): Promise<boolean> {
    return this.call<boolean>('setWebhook', options as unknown as Record<string, unknown>);
  }

  public async getWebhookInfo(): Promise<unknown> {
    return this.call<unknown>('getWebhookInfo');
  }

  public async getMe(): Promise<unknown> {
    return this.call<unknown>('getMe');
  }
}
