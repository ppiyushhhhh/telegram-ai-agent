import { createApp } from './app';
import { processQueueBatch } from './services/queue/consumer';
import { SessionDurableObject } from './durable-objects/SessionDurableObject';
import { processDueReminders } from './services/scheduler/reminder-processor';

const app = createApp();

export { SessionDurableObject };

export default {
  fetch: app.fetch,
  queue: processQueueBatch,
  scheduled: async (event: ScheduledEvent, env: any, ctx: ExecutionContext) => {
    ctx.waitUntil(processDueReminders(env));
  }
};
