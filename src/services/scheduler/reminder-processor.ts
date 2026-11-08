import type { Env } from '../../types';
import { DatabaseService } from '../db/client';
import { TelegramClient } from '../telegram/client';
import { sendSafeTelegramMessage } from '../telegram/utils';

export interface ReminderProcessingResult {
  processed: number;
  sent: number;
  errors: number;
}

/**
 * Cloudflare Worker scheduled task handler to process and dispatch due reminders.
 * Invoked periodically via Cron Trigger (every minute).
 */
export async function processDueReminders(env: Env): Promise<ReminderProcessingResult> {
  const result: ReminderProcessingResult = {
    processed: 0,
    sent: 0,
    errors: 0
  };

  if (!env.DB || !env.TELEGRAM_BOT_TOKEN) {
    console.warn('Skipping scheduled reminder processing: DB or TELEGRAM_BOT_TOKEN missing');
    return result;
  }

  const dbService = new DatabaseService(env.DB);
  const telegramClient = new TelegramClient(env.TELEGRAM_BOT_TOKEN);

  try {
    const dueReminders = await dbService.getDueReminders();
    result.processed = dueReminders.length;

    if (dueReminders.length === 0) {
      return result;
    }

    for (const reminder of dueReminders) {
      try {
        const reminderText =
          `⏰ *Reminder Alert!*\n\n` +
          `${reminder.reminder_text}\n\n` +
          `_Scheduled for: ${new Date(reminder.remind_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}_`;

        await sendSafeTelegramMessage(telegramClient, reminder.chat_id, reminderText);
        await dbService.markReminderSent(reminder.id);
        result.sent += 1;
      } catch (sendErr) {
        result.errors += 1;
        console.error(`Failed to dispatch reminder ${reminder.id} to chat ${reminder.chat_id}:`, sendErr);
      }
    }
  } catch (err) {
    console.error('Error in processDueReminders execution:', err);
  }

  return result;
}
