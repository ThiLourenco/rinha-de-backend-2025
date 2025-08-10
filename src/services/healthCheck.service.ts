import axios from 'axios';
import { redisClient } from '../lib/redis';
import 'dotenv/config';
import { ProcessorTypes } from '../types';

const DEFAULT_PROCESSOR_URL = process.env.PAYMENT_PROCESSOR_DEFAULT_URL!;
const FALLBACK_PROCESSOR_URL = process.env.PAYMENT_PROCESSOR_FALLBACK_URL!;

const HEALTH_CACHE_KEY = 'cachedProcessor';
const HEALTH_LOCK_KEY = 'health_check_lock';
// secs
const HEALTH_LOCK_TTL = 3;
const HEALTH_CACHE_TTL = 5;
const HEALTH_STATUS_TTL = 10;
const HEALTH_CHECK_INTERVAL = 5000; //ms


interface HealthStatus {
  failing: boolean;
  minResponseTime: number;
}

const fetchHealthStatus = async (url: string): Promise<HealthStatus | null> => {
  try {
    const resp = await axios.get<HealthStatus>(`${url}/payments/service-health`, {
      timeout: 2000,
    });
    return resp.data;
  } catch {
    return null;
  }
};

export const getHealthProcessor = async (): Promise<ProcessorTypes> => {
  const cachedProcessor = await redisClient.get(HEALTH_CACHE_KEY);

  if (cachedProcessor === ProcessorTypes.default || cachedProcessor === ProcessorTypes.fallback) {
    return cachedProcessor as ProcessorTypes;
  }

  const lockResult = await redisClient.set(HEALTH_LOCK_KEY, '1', {
    NX: true,
    EX: HEALTH_LOCK_TTL,
  });

  if (lockResult !== 'OK') {
    return ProcessorTypes.default;
  }

  try {
    const [defaultHealth, fallbackHealth] = await Promise.all([
      fetchHealthStatus(DEFAULT_PROCESSOR_URL),
      fetchHealthStatus(FALLBACK_PROCESSOR_URL),
    ]);

    if (!defaultHealth || !fallbackHealth) {
      return ProcessorTypes.default;
    }

    let processor: ProcessorTypes;
    if (
      defaultHealth.failing ||
      fallbackHealth.minResponseTime < defaultHealth.minResponseTime
    ) {
      processor = ProcessorTypes.fallback;
    } else {
      processor = ProcessorTypes.default;
    }

    await redisClient.set(HEALTH_CACHE_KEY, processor, { EX: HEALTH_CACHE_TTL });

    return processor;
  } catch {
    return ProcessorTypes.default;
  } finally {
    await redisClient.del(HEALTH_LOCK_KEY);
  }
};

export const startHealthChecks = () => {
  console.log('[***] Starting background health checks...[***]');

  const runCheck = async () => {
    const [defaultHealth, fallbackHealth] = await Promise.all([
      fetchHealthStatus(DEFAULT_PROCESSOR_URL),
      fetchHealthStatus(FALLBACK_PROCESSOR_URL),
    ]);

    await redisClient.set('health:default', JSON.stringify(defaultHealth), { EX: HEALTH_STATUS_TTL });
    await redisClient.set('health:fallback', JSON.stringify(fallbackHealth), { EX: HEALTH_STATUS_TTL });

    console.log('Health status updated', {
      default: defaultHealth,
      fallback: fallbackHealth,
    });
  };

  runCheck();
  setInterval(runCheck, HEALTH_CHECK_INTERVAL);
};