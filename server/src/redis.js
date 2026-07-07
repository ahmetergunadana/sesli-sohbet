import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redis = createClient({
  url: process.env.REDIS_URL,
  socket: {
    tls: true,
    rejectUnauthorized: false,
  },
});

redis.on('error', (err) => console.error('Redis error:', err));
redis.on('connect', () => console.log('Redis connected'));

export const connectRedis = async () => {
  await redis.connect();
};

export default redis;
