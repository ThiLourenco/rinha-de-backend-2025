import axios from 'axios';
import 'dotenv/config';

const DEFAULT_PROCESSOR_URL = process.env.PAYMENT_PROCESSOR_DEFAULT_URL;
const FALLBACK_PROCESSOR_URL = process.env.PAYMENT_PROCESSOR_FALLBACK_URL;

interface PaymentRequestBody {
  correlationId: string;
  amount: number;
  requestedAt: string;
}

export const processPaymentWithProvider = async (
  processor: 'default' | 'fallback',
  data: { correlationId: string, amount: number }
): Promise<boolean> => {
  const url = processor === 'default' ? DEFAULT_PROCESSOR_URL : FALLBACK_PROCESSOR_URL;
  const body: PaymentRequestBody = {
    ...data,
    requestedAt: new Date().toISOString()
  };

  try {
    const response = await axios.post(`${url}/payments`, body, { timeout: 4000 }); // ms
    return response.status >= 200 && response.status < 300;
  } catch (error) {
    console.error(`Error processing payment with ${processor} processor:`, error instanceof Error ? error.message : error);
    return false;
  }
};