import { Worker } from 'bullmq';
import { redisClient, redisUrl } from './lib/redis';
import { processPaymentWithProvider } from './services/paymentProcessor.service';
import { PaymentJob } from './types';

export const startWorker = (connectionUrl: string) => {
    console.log('Worker initiated');

    new Worker<PaymentJob>('payment-queue',
      async (job) => {
        const { correlationId, amount } = job.data;
        const paymentKey = `payment:${correlationId}`;
        
        const defaultHealthStr = await redisClient.get('health:default');
        const defaultHealth = defaultHealthStr ? JSON.parse(defaultHealthStr) : { failing: true };

        let success = false;
        let usedProcessor: 'default' | 'fallback' | null = null;

        if (!defaultHealth.failing) {
            success = await processPaymentWithProvider('default', { correlationId, amount });
            if (success) usedProcessor = 'default';
        }

        if (!success) {
            success = await processPaymentWithProvider('fallback', { correlationId, amount });
            if (success) usedProcessor = 'fallback';
        }

        if (success && usedProcessor) {
            const now = new Date();
            const timestamp = now.getTime();
            
            const pipeline = redisClient.multi();

            pipeline.hSet(paymentKey, {
                'status': 'SUCCESS',
                'processor': usedProcessor,
                'processedAt': now.toISOString()
            });

            pipeline.hIncrBy('summary', `${usedProcessor}:totalRequests`, 1);
            pipeline.hIncrByFloat('summary', `${usedProcessor}:totalAmount`, amount);

            const sortedSetKey = `payments:${usedProcessor}`;
            const sortedSetMember = `${correlationId}:${amount}`;
            pipeline.zAdd(sortedSetKey, { score: timestamp, value: sortedSetMember });
            
            await pipeline.exec();
            
            console.log(`[${correlationId}] Pagamento finalizado e indexado para consulta por data.`);
        } else {
            throw new Error(`Processamento externo falhou para ${correlationId}`);
        }
      },
      { connection: redisUrl ? { url: redisUrl } : { url: 'redis://localhost:6379' }, concurrency: 20 }
    );
};

startWorker(redisUrl!);
