// === File: server/index.js ===
import './config/dotenv.js';


import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import process from 'process';


import reportRoutes from './routes/reportRoutes.js';
import { requestLimiter } from './middleware/rateLimiter.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


process.on('unhandledRejection', (reason) => console.warn('Unhandled promise rejection:', reason));


const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '15mb' }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));


// mount routes (rate limiter applied inside routes as needed)
app.use(reportRoutes);


app.get('/health', (_req, res) => res.json({ status: 'ok' }));


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));