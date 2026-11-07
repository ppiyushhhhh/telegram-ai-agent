import type { TelegramClient } from './client';
import type { SendMessageOptions } from './types';

export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
const SAFE_SPLIT_THRESHOLD = 4000;

/**
 * Splits long AI responses into safe chunks that comply with Telegram's 4096 character limit.
 * Tries to split on paragraph boundaries (`\n\n`), then line breaks (`\n`), then sentences, and finally raw length.
 */
export function splitTelegramMessage(text: string, maxLength: number = SAFE_SPLIT_THRESHOLD): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try splitting at paragraph boundary
    let splitIndex = remaining.lastIndexOf('\n\n', maxLength);

    // If no paragraph boundary, try newline
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf('\n', maxLength);
    }

    // If no newline, try sentence end (. )
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf('. ', maxLength);
      if (splitIndex !== -1) {
        splitIndex += 1; // Include the period
      }
    }

    // If no sentence end, try space
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }

    // Hard cutoff if no suitable boundary is found
    if (splitIndex === -1 || splitIndex === 0) {
      splitIndex = maxLength;
    }

    const chunk = remaining.slice(0, splitIndex).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(splitIndex).trim();
  }

  return chunks;
}

/**
 * Sends a message with Markdown formatting, with automatic fallback to plain text
 * if Telegram rejects the message due to markdown parsing errors.
 * Also handles splitting if the message exceeds Telegram length limits.
 */
export async function sendSafeTelegramMessage(
  client: TelegramClient,
  chatId: number | string,
  text: string,
  replyToMessageId?: number
): Promise<void> {
  const chunks = splitTelegramMessage(text);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isFirstChunk = i === 0;
    const replyId = isFirstChunk ? replyToMessageId : undefined;

    try {
      // First attempt: with Markdown parsing
      await client.sendMessage({
        chat_id: chatId,
        text: chunk,
        parse_mode: 'Markdown',
        reply_to_message_id: replyId
      });
    } catch (err) {
      console.warn('Failed to send with Markdown parse mode, attempting plain text fallback:', err);
      // Fallback: send as plain text without parse_mode
      await client.sendMessage({
        chat_id: chatId,
        text: chunk,
        reply_to_message_id: replyId
      });
    }
  }
}
