import { Hono } from 'hono';
import type { Env, AppVariables, ApiResponse } from '../types';
import type { TelegramUpdate } from '../services/telegram/types';
import { telegramWebhookAuthMiddleware } from '../middleware/telegram-auth';
import { TelegramClient } from '../services/telegram/client';
import { OpenAIService } from '../services/openai/client';
import { DatabaseService } from '../services/db/client';
import { getAllowedUserIds } from '../config/env';

export const telegramRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Apply secret token verification middleware to webhook endpoint
telegramRouter.use('/webhook', telegramWebhookAuthMiddleware);

telegramRouter.post('/webhook', async (c) => {
  const requestId = c.get('requestId') || crypto.randomUUID();
  let update: TelegramUpdate;

  try {
    update = await c.req.json<TelegramUpdate>();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON payload' }, 400);
  }

  // We primarily handle user messages
  const message = update.message;
  if (!message || !message.text) {
    // Return 200 to acknowledge other Telegram events (e.g. status changes)
    return c.json({ success: true, message: 'Ignored non-text or empty update' }, 200);
  }

  const sender = message.from;
  const chatId = message.chat.id;
  const text = message.text.trim();

  const telegramClient = new TelegramClient(c.env.TELEGRAM_BOT_TOKEN);
  const dbService = c.env.DB ? new DatabaseService(c.env.DB) : null;

  // Access control check for private agent
  const allowedUserIds = getAllowedUserIds(c.env.ALLOWED_TELEGRAM_USER_IDS);
  const isAllowed =
    allowedUserIds.length === 0 || (sender && allowedUserIds.includes(sender.id));

  if (sender && dbService) {
    try {
      await dbService.upsertUser({
        id: sender.id,
        first_name: sender.first_name,
        last_name: sender.last_name,
        username: sender.username,
        is_allowed: Boolean(isAllowed)
      });
    } catch (err) {
      console.warn('Failed to upsert user in D1:', err);
    }
  }

  if (!isAllowed) {
    if (dbService) {
      await dbService.logEvent('UNAUTHORIZED_ACCESS_ATTEMPT', sender?.id, chatId, {
        username: sender?.username,
        text
      });
    }
    await telegramClient.sendMessage({
      chat_id: chatId,
      text: '⛔ Access denied. This is a private AI agent. You are not authorized to use this service.',
      reply_to_message_id: message.message_id
    });
    return c.json({ success: true, message: 'Unauthorized sender notified' }, 200);
  }

  // Handle standard slash commands
  if (text === '/start') {
    await telegramClient.sendMessage({
      chat_id: chatId,
      text: `👋 Hello ${sender?.first_name || 'there'}! I am your private AI Assistant powered by Cloudflare Workers and OpenAI.\n\nType any question or prompt to get started!`,
      reply_to_message_id: message.message_id
    });
    return c.json({ success: true, message: 'Handled /start' }, 200);
  }

  if (text === '/help') {
    await telegramClient.sendMessage({
      chat_id: chatId,
      text: '🤖 *Commands:*\n/start - Initialize or reset conversation\n/help - View this help message\n\nSimply send any message to chat with the AI model.',
      parse_mode: 'Markdown',
      reply_to_message_id: message.message_id
    });
    return c.json({ success: true, message: 'Handled /help' }, 200);
  }

  // Send typing indicator while processing AI query
  c.executionCtx.waitUntil(telegramClient.sendChatAction(chatId, 'typing').catch(() => {}));

  // Process message through OpenAI
  try {
    const openai = new OpenAIService(c.env.OPENAI_API_KEY);
    const model = c.env.OPENAI_MODEL || 'gpt-4o-mini';

    let conversationId = `chat_${chatId}`;
    const chatHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content:
          'You are a helpful, concise, and highly capable private AI assistant communicating via Telegram. Keep responses formatted cleanly with markdown.'
      }
    ];

    if (dbService && sender) {
      try {
        const conv = await dbService.getOrCreateConversation(chatId, sender.id, model);
        conversationId = conv.id;
        const recentMessages = await dbService.getRecentMessages(conversationId, 6);
        for (const msg of recentMessages) {
          chatHistory.push({ role: msg.role, content: msg.content });
        }
      } catch (dbErr) {
        console.warn('Failed to retrieve conversation history from D1:', dbErr);
      }
    }

    // Add current user message
    chatHistory.push({ role: 'user', content: text });

    // Generate AI response
    const aiResponse = await openai.generateChatCompletion({
      messages: chatHistory,
      model,
      temperature: c.env.AI_TEMPERATURE ? parseFloat(c.env.AI_TEMPERATURE) : 0.7,
      maxTokens: c.env.MAX_TOKENS ? parseInt(c.env.MAX_TOKENS, 10) : 1000
    });

    // Send reply back to Telegram
    await telegramClient.sendMessage({
      chat_id: chatId,
      text: aiResponse,
      reply_to_message_id: message.message_id
    });

    // Save history to D1 in background
    if (dbService && sender) {
      c.executionCtx.waitUntil(
        (async () => {
          try {
            await dbService.saveMessage({
              conversationId,
              telegramMessageId: message.message_id,
              role: 'user',
              content: text
            });
            await dbService.saveMessage({
              conversationId,
              role: 'assistant',
              content: aiResponse
            });
          } catch (e) {
            console.error('Failed to save messages to D1:', e);
          }
        })()
      );
    }

    return c.json({ success: true, message: 'Message processed' }, 200);
  } catch (err) {
    console.error('Error generating AI response:', err);
    await telegramClient.sendMessage({
      chat_id: chatId,
      text: '⚠️ An error occurred while generating a response. Please try again later.',
      reply_to_message_id: message.message_id
    });
    return c.json({ success: false, error: 'Failed to process AI response' }, 500);
  }
});

// Helper endpoint to check or set Telegram webhook status (requires ADMIN_API_KEY)
telegramRouter.get('/webhook/info', async (c) => {
  const adminKey = c.req.header('x-admin-key');
  if (!c.env.ADMIN_API_KEY || adminKey !== c.env.ADMIN_API_KEY) {
    return c.json({ success: false, error: 'Unauthorized admin request' }, 401);
  }

  const telegramClient = new TelegramClient(c.env.TELEGRAM_BOT_TOKEN);
  const info = await telegramClient.getWebhookInfo();
  return c.json({ success: true, data: info });
});
