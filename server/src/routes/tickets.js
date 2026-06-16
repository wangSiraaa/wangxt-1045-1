import { Router } from 'express';
import db from '../db.js';
import * as verificationService from '../services/verificationService.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM tickets ORDER BY issued_at DESC').all());
});

router.get('/activity/:activityId', (req, res) => {
  res.json(db.prepare('SELECT * FROM tickets WHERE activity_id = ? ORDER BY issued_at DESC').all(req.params.activityId));
});

router.get('/:id', (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Not found' });
  res.json(ticket);
});

router.post('/:id/verify', (req, res) => {
  try {
    const ticket = verificationService.verifyTicket(req.params.id, req.body.operator || 'front_desk', req.body.method, req.body.note);
    res.json(ticket);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/supplementary', (req, res) => {
  try {
    const ver = verificationService.supplementaryVerification(req.params.id, req.body.operator || 'front_desk', req.body.note);
    res.json(ver);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
