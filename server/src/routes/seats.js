import { Router } from 'express';
import db from '../db.js';
import { v4 as uuid } from 'uuid';

const router = Router();

router.get('/activity/:activityId', (req, res) => {
  const seats = db.prepare('SELECT * FROM seats WHERE activity_id = ? ORDER BY area, row_num, col_num').all(req.params.activityId);
  res.json(seats);
});

router.get('/activity/:activityId/area/:area', (req, res) => {
  const seats = db.prepare('SELECT * FROM seats WHERE activity_id = ? AND area = ? ORDER BY row_num, col_num').all(req.params.activityId, req.params.area);
  res.json(seats);
});

router.post('/generate', (req, res) => {
  const { activity_id, areas } = req.body;
  if (!activity_id || !areas) return res.status(400).json({ error: 'activity_id and areas required' });

  const insert = db.prepare('INSERT OR IGNORE INTO seats (id, activity_id, area, row_num, col_num, price, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const generated = [];

  const txn = db.transaction(() => {
    for (const area of areas) {
      const { name, rows, cols, price } = area;
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          const id = uuid();
          insert.run(id, activity_id, name, r, c, price, 'available');
          generated.push({ id, activity_id, area: name, row: r, col: c, price, status: 'available' });
        }
      }
    }
  });

  txn();
  res.status(201).json({ count: generated.length, seats: generated });
});

export default router;
