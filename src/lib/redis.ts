import { createClient, RedisClientType, RedisModules, RedisFunctions, RedisScripts } from 'redis';
import 'dotenv/config';

export type RedisStackClient = RedisClientType<RedisModules, RedisFunctions, RedisScripts>;

export const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('URL Redis not found.');
}

export const redisClient: RedisStackClient = createClient({
  url: redisUrl
}) as RedisStackClient;


redisClient.on('error', (err) => {
  console.error('Redis Client Error', err);
});

export const connectRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    const pong = await redisClient.ping();
    console.log("Redis connected:", pong);
    
  }
};

export const disconnectRedis = async () => {
  if (redisClient.isOpen) {
    await redisClient.quit();
    console.log('Disconnected from Redis.');
  }
};
