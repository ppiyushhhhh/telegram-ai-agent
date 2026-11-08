import type {
  TelegramMessage,
  SendMessageOptions,
  SetWebhookOptions
} from './types';
import { AppError } from '../../middleware/error-handler';
import { ERROR_CODES } from '../../config/constants';

export class TelegramClient {
  private readonly baseUrl: string;
  private readonly botToken: string;

  constructor(botToken: string) {
    const cleanToken = botToken?.trim();
    if (!cleanToken) {
      throw new AppError('Telegram Bot Token is required', 500, ERROR_CODES.INVALID_CONFIG);
    }
    this.botToken = cleanToken;
    this.baseUrl = `https://api.telegram.org/bot${cleanToken}`;
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

  public async getFile(fileId: string): Promise<{ file_id: string; file_unique_id: string; file_size?: number; file_path?: string }> {
    return this.call<{ file_id: string; file_unique_id: string; file_size?: number; file_path?: string }>('getFile', {
      file_id: fileId
    });
  }

  public async downloadFile(filePath: string): Promise<ArrayBuffer> {
    const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;
    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new AppError(
        `Failed to download file from Telegram: ${res.statusText}`,
        res.status >= 400 && res.status < 500 ? 400 : 502,
        ERROR_CODES.TELEGRAM_API_ERROR
      );
    }
    return res.arrayBuffer();
  }
}
