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
import {
  DEFAULT_WORKERS_AI_MODEL,
  DEFAULT_WORKERS_AI_FALLBACK_MODELS,
  DEFAULT_WORKERS_AI_EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS
} from '../config/constants';
import { parseReminderInput } from '../services/scheduler/reminder-parser';
import { executeAutoTool, fetchLiveWeather, fetchLiveWebSearch } from '../services/tools';

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
  if (!message) {
    return c.json({ success: true, message: 'Non-message update ignored' }, 200);
  }

  const isVoice = Boolean(message.voice || message.audio);
  const isPhoto = Boolean(message.photo && message.photo.length > 0);
  let text = (message.text || message.caption || '').trim();

  if (!text && !isVoice && !isPhoto) {
    return c.json({ success: true, message: 'Unsupported message format ignored' }, 200);
  }

  const sender = message.from;
  const chat = message.chat;
  const chatId = chat.id;

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

  // Handle Incoming Photo / Image Messages (Cloudflare Workers AI Vision)
  if (isPhoto) {
    runBackgroundTask(telegramClient.sendChatAction(chatId, 'upload_photo'));
    try {
      const photos = message.photo!;
      const largestPhoto = photos[photos.length - 1];
      const fileInfo = await telegramClient.getFile(largestPhoto.file_id);
      if (!fileInfo.file_path) {
        throw new Error('Telegram did not return file_path for photo');
      }
      const buffer = await telegramClient.downloadFile(fileInfo.file_path);
      const prompt = text || 'Describe what you see in this image in detail and extract any text or important elements.';
      const aiService = new UnifiedAIService(c.env);
      const memoryService = new SemanticMemoryService(c.env, aiService);
      const analysis = await aiService.describeImage(new Uint8Array(buffer), prompt);

      await sendSafeTelegramMessage(
        telegramClient,
        chatId,
        `📸 *Image Analysis:*\n\n${analysis}`,
        message.message_id
      );

      if (dbService) {
        const conv = await dbService.getOrCreateConversation(
          chatId,
          sender.id,
          c.env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL
        );
        await dbService.saveMessage({
          conversationId: conv.id,
          telegramMessageId: message.message_id,
          role: 'user',
          content: `[Photo: ${prompt}]`
        });
        await dbService.saveMessage({
          conversationId: conv.id,
          role: 'assistant',
          content: analysis
        });
        if (memoryService.isVectorizeReady()) {
          await memoryService.storeMemory(
            sender.id,
            `User sent an image (${prompt}). AI Visual Analysis: "${analysis.slice(0, 250)}"`
          );
        }
      }
      return c.json({ success: true, message: 'Handled photo message' }, 200);
    } catch (photoErr) {
      console.error('Error processing photo message:', photoErr);
      await sendSafeTelegramMessage(
        telegramClient,
        chatId,
        '⚠️ Failed to process image. Please try sending a different photo.',
        message.message_id
      );
      return c.json({ success: false, error: 'Photo processing error' }, 500);
    }
  }

  // Handle Incoming Voice / Audio Messages (Cloudflare Workers AI Whisper)
  let isVoiceNote = false;
  if (isVoice) {
    runBackgroundTask(telegramClient.sendChatAction(chatId, 'typing'));
    try {
      const voice = message.voice || message.audio;
      const fileInfo = await telegramClient.getFile(voice!.file_id);
      if (!fileInfo.file_path) {
        throw new Error('Telegram did not return file_path for voice note');
      }
      const buffer = await telegramClient.downloadFile(fileInfo.file_path);
      const aiService = new UnifiedAIService(c.env);
      const transcription = await aiService.transcribeAudio(new Uint8Array(buffer));
      if (!transcription || transcription.trim().length === 0) {
        await sendSafeTelegramMessage(
          telegramClient,
          chatId,
          '⚠️ Could not transcribe audio. Please try speaking closer to the microphone.',
          message.message_id
        );
        return c.json({ success: true, message: 'Empty voice transcription' }, 200);
      }
      text = transcription.trim();
      isVoiceNote = true;
    } catch (voiceErr) {
      console.error('Error processing voice message:', voiceErr);
      await sendSafeTelegramMessage(
        telegramClient,
        chatId,
        '⚠️ Failed to transcribe audio note. Please try again or send a text message.',
        message.message_id
      );
      return c.json({ success: false, error: 'Voice transcription error' }, 500);
    }
  }

  // 4. Command Handling
  // /start command
  if (text === '/start') {
    const welcomeText =
      `👋 *Hello ${sender.first_name || 'there'}!*\n\n` +
      `I am your private AI Agent running on Cloudflare Workers and powered entirely by Cloudflare Workers AI.\n\n` +
      `*Features:*\n` +
      `• 💬 Conversational chat with Meta LLaMA 3.3 70B\n` +
      `• 🎙️ Voice note transcription via Workers AI Whisper\n` +
      `• 📸 Image understanding via Workers AI Vision\n` +
      `• ⏰ Scheduled proactive reminders via Cron Triggers\n` +
      `• 🌤️ Live weather forecasts & 🔍 Web search\n\n` +
      `*Commands:*\n` +
      `• \`/help\` - View commands and help guide\n` +
      `• \`/weather <city>\` - Real-time weather observation\n` +
      `• \`/search <query>\` - Live web & encyclopedia search\n` +
      `• \`/remind <time> <text>\` - Schedule a proactive reminder\n` +
      `• \`/reminders\` - View pending reminders\n` +
      `• \`/clearreminders\` - Cancel all reminders\n` +
      `• \`/status\` - View system status, active model & usage\n` +
      `• \`/new\` - Start a brand new conversation session\n` +
      `• \`/clear\` - Clear current conversation context\n\n` +
      `Send any message, voice note, or photo to begin!`;

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
      `• \`/weather <city>\` - Live weather forecasts (e.g. \`/weather Tokyo\`)\n` +
      `• \`/search <query>\` - Web search (e.g. \`/search Cloudflare Workers\`)\n` +
      `• \`/remind <time> <text>\` - Set a proactive reminder (e.g. \`/remind in 15m check oven\`)\n` +
      `• \`/reminders\` - View all active scheduled reminders\n` +
      `• \`/clearreminders\` - Cancel all active scheduled reminders\n` +
      `• \`/new\` - Start a fresh conversation topic\n` +
      `• \`/clear\` - Clear context for current chat session\n\n` +
      `*Capabilities:*\n` +
      `• 🎙️ *Voice Notes:* Send audio/voice messages to transcribe and chat.\n` +
      `• 📸 *Image Understanding:* Send photos or documents to analyze.\n` +
      `• 🧠 *Long-term Memory:* Important context stored in Vectorize.\n` +
      `• ⚡ *Edge-Native:* Exclusively powered by Cloudflare Workers AI.`;

    await sendSafeTelegramMessage(telegramClient, chatId, helpText, message.message_id);
    return c.json({ success: true, message: 'Handled /help' }, 200);
  }

  // /weather command
  if (text.startsWith('/weather')) {
    const loc = text.replace(/^\/weather\s*/i, '').trim();
    if (!loc) {
      await sendSafeTelegramMessage(
        telegramClient,
        chatId,
        '🌤️ *Usage:* `/weather <city>`\n\nExample: `/weather Tokyo` or `/weather London`',
        message.message_id
      );
      return c.json({ success: true, message: 'Handled /weather usage' }, 200);
    }
    runBackgroundTask(telegramClient.sendChatAction(chatId, 'typing'));
    const weatherResult = await fetchLiveWeather(loc);
    await sendSafeTelegramMessage(telegramClient, chatId, weatherResult, message.message_id);
    return c.json({ success: true, message: 'Handled /weather' }, 200);
  }

  // /search command
  if (text.startsWith('/search')) {
    const query = text.replace(/^\/search\s*/i, '').trim();
    if (!query) {
      await sendSafeTelegramMessage(
        telegramClient,
        chatId,
        '🔍 *Usage:* `/search <query>`\n\nExample: `/search Cloudflare Workers AI` or `/search Alan Turing`',
        message.message_id
      );
      return c.json({ success: true, message: 'Handled /search usage' }, 200);
    }
    runBackgroundTask(telegramClient.sendChatAction(chatId, 'typing'));
    const searchResult = await fetchLiveWebSearch(query);
    await sendSafeTelegramMessage(telegramClient, chatId, searchResult, message.message_id);
    return c.json({ success: true, message: 'Handled /search' }, 200);
  }

  // /status command (and /stats, /model aliases)
  if (text === '/status' || text === '/stats' || text === '/model') {
    const activeModel = c.env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL;
    const envName = (c.env.APP_ENV || 'development').toUpperCase();

    let usageInfo = '• *Lifetime Messages:* 0\n• *Estimated Cost:* $0.00';
    if (dbService) {
      const stats = await dbService.getUserStats(sender.id);
      const usage = await dbService.getUserUsageStats(sender.id);
      usageInfo =
        `• *Total Messages:* ${stats.messageCount}\n` +
        `• *Conversations:* ${stats.conversationCount}\n` +
        `• *Tokens Used:* ${usage.totalTokens.toLocaleString()}\n` +
        `• *Estimated Compute Cost:* $${usage.totalCostUsd.toFixed(5)}`;
    }

    const fallbackList = DEFAULT_WORKERS_AI_FALLBACK_MODELS.map(m => `\`${m}\``).join(', ');
    const statusText =
      `⚡ *System Status & Telemetry*\n\n` +
      `• *Environment:* \`${envName}\`\n` +
      `• *Primary AI Provider:* \`WORKERS-AI\` (Cloudflare Edge)\n` +
      `• *Active Model:* \`${activeModel}\`\n` +
      `• *Fallback Models:* ${fallbackList}\n` +
      `• *Embedding Model:* \`${DEFAULT_WORKERS_AI_EMBEDDING_MODEL}\` (${EMBEDDING_DIMENSIONS} dims)\n` +
      `• *D1 Database:* \`ONLINE\`\n\n` +
      `📊 *Your Account Usage:*\n${usageInfo}`;

    await sendSafeTelegramMessage(telegramClient, chatId, statusText, message.message_id);
    return c.json({ success: true, message: 'Handled /status' }, 200);
  }

  // /new command (Starts a brand new conversation session)
  if (text === '/new') {
    const activeModel = c.env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL;
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
    if (c.env.SESSION_DO) {
      try {
        const doId = c.env.SESSION_DO.idFromName(`chat_${chatId}`);
        const sessionDO = c.env.SESSION_DO.get(doId) as any;
        await sessionDO.clearSession();
      } catch (doErr) {
        console.warn('Session Durable Object clearSession skipped:', doErr);
      }
    }
    await sendSafeTelegramMessage(
      telegramClient,
      chatId,
      '🧹 *Conversation context cleared.*\nPrevious context has been reset for this session.',
      message.message_id
    );
    return c.json({ success: true, message: 'Handled /clear' }, 200);
  }

  // /reminders command (List user's pending scheduled reminders)
  if (text === '/reminders') {
    if (!dbService) {
      await sendSafeTelegramMessage(telegramClient, chatId, '⚠️ Database is unavailable.', message.message_id);
      return c.json({ success: true, message: 'Database unavailable' }, 200);
    }
    const reminders = await dbService.getUserPendingReminders(sender.id);
    if (reminders.length === 0) {
      await sendSafeTelegramMessage(
        telegramClient,
        chatId,
        '⏰ *No Active Reminders*\nYou currently have no scheduled reminders.\n\nUse `/remind in 15m check oven` or `/remind at 3pm meeting` to schedule one!',
        message.message_id
      );
    } else {
      const list = reminders
        .map((r, i) => `${i + 1}. *${r.reminder_text}*\n   _Due: ${new Date(r.remind_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${new Date(r.remind_at).toLocaleDateString()})_`)
        .join('\n\n');
      await sendSafeTelegramMessage(
        telegramClient,
        chatId,
        `⏰ *Your Active Reminders:*\n\n${list}\n\n_Use /clearreminders to cancel all._`,
        message.message_id
      );
    }
    return c.json({ success: true, message: 'Handled /reminders' }, 200);
  }

  // /clearreminders command (Cancel all pending reminders)
  if (text === '/clearreminders') {
    if (dbService) {
      await dbService.clearUserReminders(sender.id);
    }
    await sendSafeTelegramMessage(
      telegramClient,
      chatId,
      '🧹 *All active reminders cancelled.*',
      message.message_id
    );
    return c.json({ success: true, message: 'Handled /clearreminders' }, 200);
  }

  // Scheduled Reminder Natural Parsing & Command Handling
  const reminderParsed = parseReminderInput(text);
  if (reminderParsed && dbService) {
    await dbService.createReminder({
      userId: sender.id,
      chatId,
      reminderText: reminderParsed.reminderText,
      remindAt: reminderParsed.remindAt
    });

    const targetDate = new Date(reminderParsed.remindAt);
    const timeFormatted = targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isToday = targetDate.toDateString() === new Date().toDateString();
    const dateFormatted = isToday ? 'today' : `on ${targetDate.toLocaleDateString()}`;

    await sendSafeTelegramMessage(
      telegramClient,
      chatId,
      `⏰ *Reminder Scheduled!*\n\n• *Task:* ${reminderParsed.reminderText}\n• *Time:* ${timeFormatted} (${dateFormatted})\n\nI will send you a direct message when it's time!`,
      message.message_id
    );
    return c.json({ success: true, message: 'Handled reminder creation' }, 200);
  }

  // 5. Send typing indicator while processing AI query
  runBackgroundTask(telegramClient.sendChatAction(chatId, 'typing'));

  // 6. Text Message Handling & AI Execution with Durable Object Concurrency Locking
  let sessionDO: any = null;
  if (c.env.SESSION_DO) {
    try {
      const doId = c.env.SESSION_DO.idFromName(`chat_${chatId}`);
      sessionDO = c.env.SESSION_DO.get(doId);
      const lockAcquired = await sessionDO.acquireLock(chatId, sender.id);
      if (!lockAcquired) {
        await sendSafeTelegramMessage(
          telegramClient,
          chatId,
          '⏳ *Please wait a moment*\nI am still processing your previous message. Your next reply will begin shortly.',
          message.message_id
        );
        return c.json({ success: true, message: 'Concurrent request throttled by Durable Object' }, 200);
      }
    } catch (doErr) {
      console.warn('Session Durable Object lock acquisition skipped:', doErr);
    }
  }

  try {
    const aiService = new UnifiedAIService(c.env);
    const memoryService = new SemanticMemoryService(c.env, aiService);
    const activeModel = c.env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL;

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

    // Auto Tool Execution: check if user asks about weather or web search naturally
    try {
      const autoTool = await executeAutoTool(text);
      if (autoTool.output) {
        systemInstruction += `\n\nLive real-time edge tool data retrieved for this inquiry:\n${autoTool.output}`;
      }
    } catch (toolErr) {
      console.warn('Auto tool execution skipped:', toolErr);
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
      temperature: c.env.AI_TEMPERATURE ? parseFloat(c.env.AI_TEMPERATURE) : 0.7,
      maxTokens: c.env.MAX_TOKENS ? parseInt(c.env.MAX_TOKENS, 10) : 1000
    });

    // Send reply back to Telegram safely (prefix transcribed text if received as voice note)
    const finalReply = isVoiceNote ? `🎙️ _"${text}"_\n\n${aiResult.text}` : aiResult.text;
    await sendSafeTelegramMessage(telegramClient, chatId, finalReply, message.message_id);

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

            // Sync ephemeral context into Durable Object buffer
            if (sessionDO) {
              await sessionDO.appendEphemeralMessage('user', text);
              await sessionDO.appendEphemeralMessage('assistant', aiResult.text);
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
    const errorDetails = err instanceof Error ? err.message : String(err);
    console.error('Error generating AI response:', err);
    await sendSafeTelegramMessage(
      telegramClient,
      chatId,
      '⚠️ An error occurred while generating a response. Please try again in a moment.',
      message.message_id
    );
    return c.json({ success: false, error: errorDetails, stack: err instanceof Error ? err.stack : undefined }, 500);
  } finally {
    if (sessionDO) {
      try {
        await sessionDO.releaseLock();
      } catch (releaseErr) {
        console.warn('Session Durable Object releaseLock skipped:', releaseErr);
      }
    }
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
