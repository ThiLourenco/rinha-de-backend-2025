import { Router } from 'express';
import { createPayment, getPaymentsSummary, purgePayments } from '../controllers/payment.controller';

const router = Router();

router.post('/payments', createPayment);
router.get('/payments-summary', getPaymentsSummary);
router.post('/purge-payments', purgePayments);

export default router;