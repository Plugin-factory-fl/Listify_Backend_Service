import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import logger from './logger.js';
import { fetchSellerSales } from './scraper.js';

const PORT = process.env.PORT || 4000;
const API_SECRET = process.env.API_SECRET;

if (!API_SECRET) {
  logger.error('API_SECRET is not set. Exiting.');
  process.exit(1);
}

const app = express();
app.use(helmet());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: '200kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.post('/seller-sales', async (req, res) => {
  try {
    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (token !== API_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { seller, timeframeDays } = req.body || {};
    if (!seller || typeof seller !== 'string') {
      return res.status(400).json({ error: 'seller (string) is required' });
    }

    const result = await fetchSellerSales({
      seller,
      timeframeDays: Number(timeframeDays) || 7
    });

    res.json(result);
  } catch (err) {
    logger.error({ err, seller: req.body?.seller }, 'Failed to handle /seller-sales');
    res.status(500).json({
      error: 'Internal server error',
      reason: err?.message || 'Unknown error'
    });
  }
});

app.use((req, res) => {
  logger.warn({ path: req.path }, 'Unhandled route');
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  logger.info(`listify-backend listening on port ${PORT}`);
});

