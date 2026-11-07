import { Hono } from 'hono';
import type { Env, AppVariables, ApiResponse } from '../types';
import type { TelegramUpdate } from '../services/telegram/types';
import { telegramWebhookAuthMiddleware } from '../middleware/telegram-auth';
import { TelegramClient } from '../services/telegram/client';
import { sendSafeTelegramMessage } from '../services/telegram/utils';
import { UnifiedAIService } from '../services/ai/unified';
import { SemanticMemoryService } from '../services/memory/semantic';
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
    await sendSafeTelegramMessage(
      telegramClient,
      chatId,
      `👋 *Hello ${sender?.first_name || 'there'}!*\n\nI am your private AI Assistant powered by Cloudflare Workers and OpenAI.\n\n*Available Commands:*\n• /help - Show available commands\n• /reset - Clear active conversation context\n• /model - Show active model info\n• /stats - View your usage statistics\n\nSimply send any message to start chatting!`,
      message.message_id
    );
    return c.json({ success: true, message: 'Handled /start' }, 200);
  }

  if (text === '/help') {
    await sendSafeTelegramMessage(
      telegramClient,
      chatId,
      '🤖 *Private Telegram AI Assistant Commands:*\n\n• `/start` - Welcome message & capabilities\n• `/help` - View this help guide\n• `/reset` - Clear current context and start fresh\n• `/model` - Inspect active model parameters\n• `/stats` - View your interaction count\n\n*Tips:*\nYou can ask coding questions, drafting help, or conversational prompts directly.',
      message.message_id
    );
    return c.json({ success: true, message: 'Handled /help' }, 200);
  }

  if (text === '/reset') {
    if (dbService) {
      await dbService.resetConversation(chatId);
    }
    await sendSafeTelegramMessage(
      telegramClient,
      chatId,
      '🔄 *Conversation context has been cleared.*\nWhat would you like to talk about next?',
      message.message_id
    );
    return c.json({ success: true, message: 'Handled /reset' }, 200);
  }

  if (text === '/model') {
    const activeModel = c.env.OPENAI_MODEL || 'gpt-4o-mini';
    const temp = c.env.AI_TEMPERATURE || '0.7';
    const maxTokens = c.env.MAX_TOKENS || '1000';
    await sendSafeTelegramMessage(
      telegramClient,
      chatId,
      `🧠 *Model Configuration:*\n\n• *Model:* \`${activeModel}\`\n• *Temperature:* \`${temp}\`\n• *Max Tokens:* \`${maxTokens}\`\n• *Environment:* \`${c.env.APP_ENV || 'development'}\``,
      message.message_id
    );
    return c.json({ success: true, message: 'Handled /model' }, 200);
  }

  if (text === '/stats') {
    let statsMsg = '📊 *Your Activity Stats:*\n';
    if (dbService && sender) {
      const stats = await dbService.getUserStats(sender.id);
      statsMsg += `\n• *Messages Exchanged:* ${stats.messageCount}\n• *Conversations Created:* ${stats.conversationCount}`;
    } else {
      statsMsg += '\nDatabase stats unavailable in stateless mode.';
    }
    await sendSafeTelegramMessage(telegramClient, chatId, statsMsg, message.message_id);
    return c.json({ success: true, message: 'Handled /stats' }, 200);
  }

  // Send typing indicator while processing AI query
  c.executionCtx.waitUntil(telegramClient.sendChatAction(chatId, 'typing').catch(() => {}));

  // Process message through Unified AI Service (OpenAI with automatic Gemini fallback)
  try {
    const aiService = new UnifiedAIService(c.env);
    const memoryService = new SemanticMemoryService(c.env, aiService);
    const activeModel = c.env.OPENAI_MODEL || 'gpt-4o-mini';

    let conversationId = `chat_${chatId}`;
    let systemInstruction =
      'You are a helpful, concise, and highly capable private AI assistant communicating via Telegram. Keep responses formatted cleanly with markdown.';

    // 1. Retrieve Semantic Long-Term Memories (from Cloudflare Vectorize)
    if (sender) {
      try {
        const memories = await memoryService.queryRelevantMemories(sender.id, text, 3);
        if (memories.length > 0) {
          systemInstruction +=
            '\n\nRelevant context recalled from your long-term memory about this user:\n' +
            memories.map((m) => `• ${m.content}`).join('\n');
        }
      } catch (memErr) {
        console.warn('Semantic memory query skipped:', memErr);
      }
    }

    const chatHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: systemInstruction
      }
    ];

    // 2. Retrieve Short-Term Relational Conversation History (from Cloudflare D1)
    if (dbService && sender) {
      try {
        const conv = await dbService.getOrCreateConversation(chatId, sender.id, activeModel);
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

    // 3. Generate AI response (OpenAI primary with Gemini fallback)
    const aiResult = await aiService.generateChatResponse(chatHistory, {
      model: activeModel,
      temperature: c.env.AI_TEMPERATURE ? parseFloat(c.env.AI_TEMPERATURE) : 0.7,
      maxTokens: c.env.MAX_TOKENS ? parseInt(c.env.MAX_TOKENS, 10) : 1000
    });

    // 4. Send reply back to Telegram safely (handles chunking if > 4096 chars and markdown fallback)
    await sendSafeTelegramMessage(telegramClient, chatId, aiResult.text, message.message_id);

    // 5. Asynchronously persist message history to D1 and index semantic memory
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
              content: aiResult.text,
              tokensUsed: aiResult.usage?.totalTokens
            });

            // Index meaningful exchanges into Vectorize for future semantic recall
            if (text.length > 15 && memoryService.isVectorizeReady()) {
              await memoryService.storeMemory(
                sender.id,
                `User asked: "${text}" | Assistant replied: "${aiResult.text.slice(0, 300)}"`
              );
            }
          } catch (e) {
            console.error('Failed to save messages to D1 or Vectorize:', e);
          }
        })()
      );
    }

    return c.json({ success: true, provider: aiResult.provider, model: aiResult.model }, 200);
  } catch (err) {
    console.error('Error generating AI response:', err);
    await sendSafeTelegramMessage(
      telegramClient,
      chatId,
      '⚠️ An error occurred while generating a response. Please try again later.',
      message.message_id
    );
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
