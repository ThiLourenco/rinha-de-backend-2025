import { Request, Response } from 'express';
import { redisClient } from '../lib/redis';
import { paymentQueue } from '../lib/queue';

export const createPayment = async (req: Request, res: Response) => {
    const { correlationId, amount } = req.body;

    if (!correlationId || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).send({ message: 'Missing or invalid correlationId or amount' });
    }

    try {
        await paymentQueue.add('process-payment', { correlationId, amount }, {
            jobId: correlationId,
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: true,
            backoff: { type: 'fixed', delay: 0 },
        });
        return res.status(202).send({ message: 'Payment processing queued' });
    } catch (error) {
        console.error('Error queueing payment job:', error);
        return res.status(500).send('Internal Server Error');
    }
};

export const getPaymentsSummary = async (req: Request, res: Response) => {
    const { from, to } = req.query;

    try {
        if (!from || !to) {
            const summaryData = await redisClient.hGetAll('summary');
            return res.status(200).json({
                default: {
                    totalRequests: Number(summaryData['default:totalRequests']) || 0,
                    totalAmount: Number(summaryData['default:totalAmount']) || 0,
                },
                fallback: {
                    totalRequests: Number(summaryData['fallback:totalRequests']) || 0,
                    totalAmount: Number(summaryData['fallback:totalAmount']) || 0,
                },
            });
        }

        const fromTimestamp = new Date(from as string).getTime();
        const toTimestamp = new Date(to as string).getTime();

        const [defaultPayments, fallbackPayments] = await Promise.all([
            redisClient.zRange('payments:default', fromTimestamp, toTimestamp, { BY: 'SCORE' }),
            redisClient.zRange('payments:fallback', fromTimestamp, toTimestamp, { BY: 'SCORE' })
        ]);

        const calculateSummary = (payments: string[]) => {
            let totalAmount = 0;
            for (const payment of payments) {
                const amount = parseFloat(payment.split(':')[1]);
                if (!isNaN(amount)) {
                    totalAmount += amount;
                }
            }
            return { totalRequests: payments.length, totalAmount };
        };

        res.status(200).json({
            default: calculateSummary(defaultPayments),
            fallback: calculateSummary(fallbackPayments),
        });

    } catch (error) {
        console.error('Error fetching payments summary:', error);
        res.status(500).send('Internal Server Error');
    }
};

export const purgePayments = async (req: Request, res: Response) => {
    try {
        await redisClient.del(['summary', 'payments:default', 'payments:fallback']);

        let cursor = 0;
        do {
            const reply = await redisClient.scan(cursor, { MATCH: 'payment:*', COUNT: 100 });
            cursor = reply.cursor;
            if (reply.keys.length > 0) {
                await redisClient.del(reply.keys);
            }
        } while (cursor !== 0);
        
        console.log('All Redis data (hashes, summary, sorted sets) have been purged.');
        res.status(204).send();
    } catch (error) {
        console.error('Error purging payments from Redis:', error);
        res.status(500).send('Internal Server Error');
    }
};
