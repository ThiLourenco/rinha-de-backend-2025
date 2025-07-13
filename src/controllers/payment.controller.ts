import { Request, Response } from 'express';
import { redisClient } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { processPaymentWithProvider } from '../services/paymentProcessor.service';
import { Decimal } from '@prisma/client/runtime/library';

export const createPayment = async (req: Request, res: Response) => {
  const { correlationId, amount } = req.body;

  if (!correlationId || !amount) {
    return res.status(400).send('Missing correlationId or amount');
  }

  try {
    const defaultHealthStr = await redisClient.get('health:default');
    const defaultHealth = defaultHealthStr ? JSON.parse(defaultHealthStr) : { failing: true };

    let success = false;
    let usedProcessor: 'default' | 'fallback' | null = null;

    if (!defaultHealth.failing) {
      success = await processPaymentWithProvider('default', { correlationId, amount });
      if (success) {
        usedProcessor = 'default';
      }
    }

    if (!success) {
      // Fallback logic
      console.log('Default processor failed or is unhealthy. Trying fallback...');
      success = await processPaymentWithProvider('fallback', { correlationId, amount });
      if (success) {
        usedProcessor = 'fallback';
      }
    }

    if (success && usedProcessor) {
      prisma.payment.create({
        data: {
          correlationId,
          amount: new Decimal(amount),
          processor: usedProcessor,
          status: 'SUCCESS',
        },
      }).catch(dbError => {
          console.error('Failed to save payment record to DB:', dbError);
      });

      return res.status(202).send({ message: 'Payment processing initiated' });
    } else {
      return res.status(503).send({ message: 'All payment processors are unavailable' });
    }
  } catch (error) {
    console.error('Error in createPayment controller:', error);
    return res.status(500).send('Internal Server Error');
  }
};

export const getPaymentsSummary = async (req: Request, res: Response) => {
  const { from, to } = req.query;

  try {
    const whereClause: any = {
      status: 'SUCCESS',
    };

    if (from || to) {
        whereClause.createdAt = {};
        if (from) whereClause.createdAt.gte = new Date(from as string);
        if (to) whereClause.createdAt.lte = new Date(to as string);
    }

    const summary = await prisma.payment.groupBy({
      by: ['processor'],
      where: whereClause,
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    });

    const result = {
      default: { totalRequests: 0, totalAmount: 0 },
      fallback: { totalRequests: 0, totalAmount: 0 },
    };

    summary.forEach(item => {
      const processorKey = item.processor as 'default' | 'fallback';
      
      if (result.hasOwnProperty(processorKey)) {
        result[processorKey] = {
          totalRequests: item._count._all,
          totalAmount: item._sum.amount?.toNumber() || 0,
        };
      }
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching payments summary:', error);
    res.status(500).send('Internal Server Error');
  }
};

export const purgePayments = async (req: Request, res: Response) => {
  try {
    await prisma.payment.deleteMany({});
    console.log('All payment records have been purged.');
    res.status(204).send();
  } catch (error) {
    console.error('Error purging payments:', error);
    res.status(500).send('Internal Server Error');
  }
};
