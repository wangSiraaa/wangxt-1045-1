import { Router } from 'express';
import * as recService from '../services/reconciliationService.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(recService.listAll());
});

router.get('/activity/:activityId', (req, res) => {
  res.json(recService.listByActivity(req.params.activityId));
});

router.post('/', (req, res) => {
  try {
    const rec = recService.createReconciliation(req.body);
    res.status(201).json(rec);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/reconcile', (req, res) => {
  try {
    const rec = recService.reconcile(req.params.id, req.body.actual_amount, req.body.note);
    res.json(rec);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
