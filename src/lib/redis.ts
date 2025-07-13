import { createClient } from 'redis';
import 'dotenv/config';

export const redisClient = createClient({
  url: process.env.REDIS_URL
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

(async () => {
    await redisClient.connect();
})();