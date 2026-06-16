import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM payments ORDER BY created_at DESC').all());
});

router.get('/order/:orderId', (req, res) => {
  res.json(db.prepare('SELECT * FROM payments WHERE order_id = ?').all(req.params.orderId));
});

export default router;
