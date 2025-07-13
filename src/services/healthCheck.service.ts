import axios from 'axios';
import { redisClient } from '../lib/redis';
import 'dotenv/config';

const DEFAULT_PROCESSOR_URL = process.env.PAYMENT_PROCESSOR_DEFAULT_URL;
const FALLBACK_PROCESSOR_URL = process.env.PAYMENT_PROCESSOR_FALLBACK_URL;
const HEALTH_CHECK_INTERVAL = 5000;

interface HealthStatus {
  failing: boolean;
  minResponseTime: number;
}

const checkServiceHealth = async (url: string, serviceName: string) => {
  try {
    const response = await axios.get<HealthStatus>(`${url}/payments/service-health`);
    const status: HealthStatus = response.data;
    await redisClient.set(`health:${serviceName}`, JSON.stringify(status));
    console.log(`Health status for ${serviceName} updated:`, status);
  } catch (error) {
    const status: HealthStatus = { failing: true, minResponseTime: 99999 };
    await redisClient.set(`health:${serviceName}`, JSON.stringify(status));
    console.error(`Failed to check health for ${serviceName}. Marking as failing.`);
  }
};

export const startHealthChecks = () => {
  console.log('Starting background health checks...');
  
  checkServiceHealth(DEFAULT_PROCESSOR_URL!, 'default');
  checkServiceHealth(FALLBACK_PROCESSOR_URL!, 'fallback');

  setInterval(() => {
    checkServiceHealth(DEFAULT_PROCESSOR_URL!, 'default');
    checkServiceHealth(FALLBACK_PROCESSOR_URL!, 'fallback');
  }, HEALTH_CHECK_INTERVAL);
};