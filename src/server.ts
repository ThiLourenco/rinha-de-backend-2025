import express from 'express';
import 'dotenv/config';
import paymentRoutes from './routes/payment.routes';
import { redisClient, redisUrl } from './lib/redis';
import { startHealthChecks } from './services/healthCheck.service';
import { startWorker } from './worker';

const app = express();
const port = process.env.PORT || 3000;

const initializeApp = async () => {
    try {
        await redisClient.connect();
        console.log('Successfully connected to Redis.');

        app.use(express.json());

        app.use(paymentRoutes);
        app.get('/health', (req, res) => res.status(200).send('OK'));

        app.listen(port, () => {
            console.log(`🚀 Server is running on port ${port}`);
        });

        startWorker(redisUrl!);
        startHealthChecks();

    } catch (error) {
        console.error('Failed to start the application:', error);
        process.exit(1);
    }
};

initializeApp();
