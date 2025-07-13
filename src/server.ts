import express from 'express';
import 'dotenv/config';
import paymentRoutes from './routes/payment.routes';
import { startHealthChecks } from './services/healthCheck.service';
import { redisClient } from './lib/redis';
import { prisma } from './lib/prisma';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(paymentRoutes);

const startServer = async () => {
    try {
        await redisClient.ping();
        console.log('Successfully connected to Redis.');
        
        await prisma.$connect();
        console.log('Successfully connected to PostgreSQL.');

        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
            startHealthChecks();
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();