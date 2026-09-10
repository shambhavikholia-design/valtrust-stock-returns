import { Router } from 'express';
import { validateTicker } from '../middleware/validateTicker.js';
import { getStockReturns } from '../services/stockService.js';
import { cacheStats } from '../cache/memoryCache.js';

const router = Router();

router.get('/returns/:ticker', validateTicker, async (req, res, next) => {
  try {
    const result = await getStockReturns(req.params.ticker);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    time: new Date().toISOString(),
    cache: cacheStats(),
  });
});

export default router;
