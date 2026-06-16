import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const { entity_type, entity_id, limit } = req.query;
  let sql = 'SELECT * FROM state_log';
  const params = [];
  const conditions = [];

  if (entity_type) {
    conditions.push('entity_type = ?');
    params.push(entity_type);
  }
  if (entity_id) {
    conditions.push('entity_id = ?');
    params.push(entity_id);
  }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC';
  if (limit) {
    params.push(Number(limit));
    sql += ' LIMIT ?';
  }

  res.json(db.prepare(sql).all(...params));
});

router.get('/stats', (req, res) => {
  const groupStats = db.prepare("SELECT status, COUNT(*) as count FROM groups GROUP BY status").all();
  const orderStats = db.prepare("SELECT status, COUNT(*) as count FROM orders GROUP BY status").all();
  const ticketStats = db.prepare("SELECT status, COUNT(*) as count FROM tickets GROUP BY status").all();
  res.json({ groups: groupStats, orders: orderStats, tickets: ticketStats });
});

export default router;
