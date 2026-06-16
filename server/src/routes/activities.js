import { Router } from 'express';
import db from '../db.js';
import { v4 as uuid } from 'uuid';

const router = Router();

router.get('/', (req, res) => {
  const activities = db.prepare('SELECT * FROM activities ORDER BY show_time DESC').all();
  res.json(activities);
});

router.get('/:id', (req, res) => {
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Not found' });
  res.json(activity);
});

router.post('/', (req, res) => {
  const { name, venue, show_time } = req.body;
  if (!name || !venue || !show_time) return res.status(400).json({ error: 'name, venue, show_time required' });
  const id = uuid();
  db.prepare('INSERT INTO activities (id, name, venue, show_time) VALUES (?, ?, ?, ?)').run(id, name, venue, show_time);
  res.status(201).json(db.prepare('SELECT * FROM activities WHERE id = ?').get(id));
});

router.put('/:id', (req, res) => {
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Not found' });
  const { name, venue, show_time, status } = req.body;
  db.prepare('UPDATE activities SET name = COALESCE(?, name), venue = COALESCE(?, venue), show_time = COALESCE(?, show_time), status = COALESCE(?, status) WHERE id = ?').run(name, venue, show_time, status, req.params.id);
  res.json(db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM activities WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
