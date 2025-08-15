import { Worker } from 'bullmq';
import { redisClient, redisUrl } from './lib/redis';
import { processPaymentWithProvider } from './services/paymentProcessor.service';
import { getHealthProcessor, startHealthChecks } from './services/healthCheck.service';

interface PaymentJob {
    correlationId: string;
    amount: number;
}

const initializeWorker = async () => {
    try {
        await redisClient.connect();
        console.log('✅ Worker process successfully connected to Redis.');

        startHealthChecks();

        console.log('✅ Worker initiated.');

        new Worker<PaymentJob>('payment-queue',
            async (job) => {
                const { correlationId, amount } = job.data;
                const paymentKey = `payment:${correlationId}`;

                let success = false;
                let usedProcessor: 'default' | 'fallback' | null = null;

                const selectedProcessor = await getHealthProcessor();

                success = await processPaymentWithProvider(selectedProcessor, { correlationId, amount });

                if (success) {
                    usedProcessor = selectedProcessor;
                } else {
                    const fallbackProcessor = selectedProcessor === 'default' ? 'fallback' : 'default';
                    success = await processPaymentWithProvider(fallbackProcessor, { correlationId, amount });
                    if (success) usedProcessor = fallbackProcessor;
                }

                if (success && usedProcessor) {
                    const now = new Date();
                    const timestamp = now.getTime();
                    const pipeline = redisClient.multi();

                    pipeline.hSet(paymentKey, {
                        status: 'SUCCESS',
                        processor: usedProcessor,
                        processedAt: now.toISOString(),
                    });
                    pipeline.hIncrBy('summary', `${usedProcessor}:totalRequests`, 1);
                    pipeline.hIncrByFloat('summary', `${usedProcessor}:totalAmount`, amount);

                    const sortedSetKey = `payments:${usedProcessor}`;
                    const sortedSetMember = `${correlationId}:${amount}`;
                    pipeline.zAdd(sortedSetKey, { score: timestamp, value: sortedSetMember });

                    await pipeline.exec();
                    console.log(`[${correlationId}] ✅ Payment finalized and indexed.`);
                } else {
                    throw new Error(`External processing failed for ${correlationId}`);
                }
            },
            { connection: redisUrl ? { url: redisUrl } : { url: 'redis://localhost:6379' } }
        );
    } catch (error) {
        console.error('❌ Failed to start the Worker process:', error);
        process.exit(1);
    }
};

initializeWorker();