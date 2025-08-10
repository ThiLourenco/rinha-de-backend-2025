import { Queue } from 'bullmq';
import { redisUrl } from './redis';

export const paymentQueue = new Queue('payment-queue', {
  connection: redisUrl ? { url: redisUrl } : { url: process.env.REDIS_URL },
});
