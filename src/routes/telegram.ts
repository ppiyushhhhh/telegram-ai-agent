import { Hono } from 'hono';
import type { Env, AppVariables } from '../types';
import type { TelegramUpdate } from '../services/telegram/types';
import { telegramWebhookAuthMiddleware } from '../middleware/telegram-auth';
import { TelegramClient } from '../services/telegram/client';
import { sendSafeTelegramMessage } from '../services/telegram/utils';
import { UnifiedAIService } from '../services/ai/unified';
import { SemanticMemoryService } from '../services/memory/semantic';
import { DatabaseService } from '../services/db/client';
import { estimateUsageCost } from '../services/ai/cost';
import { getAllowedUserIds } from '../config/env';

export const telegramRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Apply secret token verification middleware to all incoming webhook paths
telegramRouter.use('*', telegramWebhookAuthMiddleware);

const handleTelegramUpdate = async (c: any) => {
  let update: TelegramUpdate;

  const runBackgroundTask = (promise: Promise<unknown>) => {
    try {
      if (c.executionCtx && typeof c.executionCtx.waitUntil === 'function') {
        c.executionCtx.waitUntil(promise);
        return;
      }
    } catch {
      // In test or non-Worker environments, executionCtx getter throws
    }
    promise.catch((err: unknown) => console.error('Background task error:', err));
  };

  try {
    update = (await c.req.json()) as TelegramUpdate;
  } catch {
    return c.json({ success: false, error: 'Invalid JSON payload' }, 400);
  }

  if (!update || typeof update.update_id !== 'number') {
    return c.json({ success: false, error: 'Missing update_id' }, 400);
  }

  const dbService = c.env.DB ? new DatabaseService(c.env.DB) : null;
  const telegramClient = new TelegramClient(c.env.TELEGRAM_BOT_TOKEN);

  // 1. Duplicate Update Prevention (Idempotency check via update_id)
  if (dbService) {
    const isProcessed = await dbService.isUpdateProcessed(update.update_id);
    if (isProcessed) {
      console.log(`Duplicate Telegram update_id ${update.update_id} ignored.`);
      return c.json({ success: true, message: 'Duplicate update ignored' }, 200);
    }
    // Mark update as processed in D1
    await dbService.markUpdateProcessed(
      update.update_id,
      update.message?.chat?.id,
      update.message?.from?.id
    );
  }

  // We primarily handle message updates
  const message = update.message;
  if (!message || !message.text) {
    // Acknowledge non-text updates (e.g. status changes, edited messages) with 200 OK
    return c.json({ success: true, message: 'Non-text update ignored' }, 200);
  }

  const sender = message.from;
  const chat = message.chat;
  const chatId = chat.id;
  const text = message.text.trim();

  // 2. Private Chat Enforcement
  if (chat.type !== 'private') {
    await sendSafeTelegramMessage(
      telegramClient,
      chatId,
      '🔒 *Direct Chat Only*\nThis private AI agent is configured strictly for direct 1-on-1 private chats. Please message me directly.',
      message.message_id
    );
    return c.json({ success: true, message: 'Non-private chat notification sent' }, 200);
  }

  // 3. User Authorization (Numeric Telegram user ID allowlist)
  if (!sender) {
    return c.json({ success: false, error: 'Missing sender information' }, 400);
  }

  const allowedUserIds = getAllowedUserIds(c.env.ALLOWED_TELEGRAM_USER_IDS);
  const isAllowed =
    allowedUserIds.length === 0 || allowedUserIds.includes(sender.id);

  if (dbService) {
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
      await dbService.logEvent('UNAUTHORIZED_ACCESS_ATTEMPT', sender.id, chatId, {
        username: sender.username,
        text
      });
    }
    await sendSafeTelegramMessage(
      telegramClient,
      chatId,
      '⛔ *Access Denied*\nThis is a private AI agent. Your Telegram user ID is not authorized to access this service.',
      message.message_id
    );
    return c.json({ success: true, message: 'Unauthorized user notified' }, 200);
  }

  // 4. Command Handling
  // /start command
  if (text === '/start') {
    const welcomeText =
      `👋 *Hello ${sender.first_name || 'there'}!*\n\n` +
      `I am your private AI Agent running on Cloudflare Workers and powered by OpenAI.\n\n` +
      `*Commands:*\n` +
      `• \`/help\` - View commands and help guide\n` +
      `• \`/status\` - View system status, active model & usage\n` +
      `• \`/new\` - Start a brand new conversation session\n` +
      `• \`/clear\` - Clear current conversation context\n\n` +
      `Send any message to begin!`;

    await sendSafeTelegramMessage(telegramClient, chatId, welcomeText, message.message_id);
    return c.json({ success: true, message: 'Handled /start' }, 200);
  }

  // /help command
  if (text === '/help') {
    const helpText =
      `🤖 *Telegram AI Agent Guide*\n\n` +
      `• \`/start\` - Welcome screen and agent introduction\n` +
      `• \`/help\` - View this command guide\n` +
      `• \`/status\` - View active AI model, latency & token stats\n` +
      `• \`/new\` - Start a fresh conversation topic\n` +
      `• \`/clear\` - Clear context for current chat session\n\n` +
      `*Tips:*\n` +
      `• You can ask complex programming questions, drafting, or analysis prompts.\n` +
      `• Conversation context is maintained automatically.\n` +
      `• Long responses are cleanly split to comply with Telegram message limits.`;

    await sendSafeTelegramMessage(telegramClient, chatId, helpText, message.message_id);
    return c.json({ success: true, message: 'Handled /help' }, 200);
  }

  // /status command (and /stats, /model aliases)
  if (text === '/status' || text === '/stats' || text === '/model') {
    const activeModel = c.env.OPENAI_MODEL || 'gpt-4o-mini';
    const primaryProvider = c.env.PRIMARY_AI_PROVIDER || 'openai';
    const envName = (c.env.APP_ENV || 'development').toUpperCase();

    let usageInfo = '• *Lifetime Messages:* 0\n• *Estimated Cost:* $0.00';
    if (dbService) {
      const stats = await dbService.getUserStats(sender.id);
      const usage = await dbService.getUserUsageStats(sender.id);
      usageInfo =
        `• *Total Messages:* ${stats.messageCount}\n` +
        `• *Conversations:* ${stats.conversationCount}\n` +
        `• *Tokens Used:* ${usage.totalTokens.toLocaleString()}\n` +
        `• *Estimated API Cost:* $${usage.totalCostUsd.toFixed(5)}`;
    }

    const statusText =
      `⚡ *System Status & Telemetry*\n\n` +
      `• *Environment:* \`${envName}\`\n` +
      `• *Primary AI Provider:* \`${primaryProvider.toUpperCase()}\`\n` +
      `• *Active Model:* \`${activeModel}\`\n` +
      `• *D1 Database:* \`ONLINE\`\n\n` +
      `📊 *Your Account Usage:*\n${usageInfo}`;

    await sendSafeTelegramMessage(telegramClient, chatId, statusText, message.message_id);
    return c.json({ success: true, message: 'Handled /status' }, 200);
  }

  // /new command (Starts a brand new conversation session)
  if (text === '/new') {
    const activeModel = c.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (dbService) {
      await dbService.createNewConversation(chatId, sender.id, activeModel);
    }
    await sendSafeTelegramMessage(
      telegramClient,
      chatId,
      '🆕 *Started a new conversation session.*\nWhat would you like to explore next?',
      message.message_id
    );
    return c.json({ success: true, message: 'Handled /new' }, 200);
  }

  // /clear command (and /reset alias)
  if (text === '/clear' || text === '/reset') {
    if (dbService) {
      await dbService.resetConversation(chatId);
    }
    await sendSafeTelegramMessage(
      telegramClient,
      chatId,
      '🧹 *Conversation context cleared.*\nPrevious context has been reset for this session.',
      message.message_id
    );
    return c.json({ success: true, message: 'Handled /clear' }, 200);
  }

  // 5. Send typing indicator while processing AI query
  runBackgroundTask(telegramClient.sendChatAction(chatId, 'typing'));

  // 6. Text Message Handling & OpenAI Execution
  try {
    const aiService = new UnifiedAIService(c.env);
    const memoryService = new SemanticMemoryService(c.env, aiService);
    const activeModel = c.env.OPENAI_MODEL || 'gpt-4o-mini';

    let conversationId = `chat_${chatId}`;
    let systemInstruction =
      'You are a helpful, concise, and highly capable private AI assistant communicating via Telegram. Keep responses formatted cleanly with markdown.';

    // Retrieve Semantic Long-Term Memories (from Cloudflare Vectorize)
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

    const chatHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: systemInstruction
      }
    ];

    // Retrieve Short-Term Relational Conversation History (from Cloudflare D1)
    if (dbService) {
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

    // Generate AI response
    const aiResult = await aiService.generateChatResponse(chatHistory, {
      model: activeModel,
      temperature: c.env.AI_TEMPERATURE ? parseFloat(c.env.AI_TEMPERATURE) : 0.7,
      maxTokens: c.env.MAX_TOKENS ? parseInt(c.env.MAX_TOKENS, 10) : 1000
    });

    // Send reply back to Telegram safely
    await sendSafeTelegramMessage(telegramClient, chatId, aiResult.text, message.message_id);

    // Track token usage and estimated cost
    const promptTokens = aiResult.usage?.promptTokens || 0;
    const completionTokens = aiResult.usage?.completionTokens || 0;
    const totalTokens = aiResult.usage?.totalTokens || promptTokens + completionTokens;
    const estimatedCost = estimateUsageCost(aiResult.model, promptTokens, completionTokens);

    // Persist messages and record AI usage in D1 in the background
    if (dbService) {
      runBackgroundTask(
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
              tokensUsed: totalTokens
            });
            await dbService.recordAiUsage({
              userId: sender.id,
              conversationId,
              provider: aiResult.provider,
              model: aiResult.model,
              promptTokens,
              completionTokens,
              totalTokens,
              estimatedCostUsd: estimatedCost
            });

            // Index meaningful exchanges into Vectorize for future semantic recall
            if (text.length > 15 && memoryService.isVectorizeReady()) {
              await memoryService.storeMemory(
                sender.id,
                `User asked: "${text}" | Assistant replied: "${aiResult.text.slice(0, 300)}"`
              );
            }
          } catch (e) {
            console.error('Failed to save message or record usage in D1:', e);
          }
        })()
      );
    }

    return c.json(
      {
        success: true,
        provider: aiResult.provider,
        model: aiResult.model,
        usage: { totalTokens, estimatedCostUsd: estimatedCost }
      },
      200
    );
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
};

// Mount handler on root (for /webhooks/telegram) and on /webhook (for /telegram/webhook)
telegramRouter.post('/', handleTelegramUpdate);
telegramRouter.post('/webhook', handleTelegramUpdate);

// Helper endpoint to check Telegram webhook status (requires ADMIN_API_KEY)
telegramRouter.get('/webhook/info', async (c) => {
  const adminKey = c.req.header('x-admin-key');
  if (!c.env.ADMIN_API_KEY || adminKey !== c.env.ADMIN_API_KEY) {
    return c.json({ success: false, error: 'Unauthorized admin request' }, 401);
  }

  const telegramClient = new TelegramClient(c.env.TELEGRAM_BOT_TOKEN);
  const info = await telegramClient.getWebhookInfo();
  return c.json({ success: true, data: info });
});
