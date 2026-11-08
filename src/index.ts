import { createApp } from './app';
import { processQueueBatch } from './services/queue/consumer';
import { SessionDurableObject } from './durable-objects/SessionDurableObject';

const app = createApp();

export { SessionDurableObject };

export default {
  fetch: app.fetch,
  queue: processQueueBatch
};
