import { Router } from 'express';
import * as seatConflictService from '../services/seatConflictService.js';
import * as adjacentSeatService from '../services/adjacentSeatService.js';

const router = Router();

router.get('/activity/:activityId', (req, res) => {
  try {
    const conflicts = seatConflictService.listActivityConflicts(req.params.activityId);
    res.json(conflicts);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/row/:activityId/:rowNum/:area', (req, res) => {
  try {
    const result = seatConflictService.analyzeRowConflicts(
      req.params.activityId,
      parseInt(req.params.rowNum),
      req.params.area
    );
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/resolve', (req, res) => {
  try {
    const { seat_id, group_id } = req.body;
    const result = seatConflictService.resolveSeatConflict(seat_id, group_id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/evict', (req, res) => {
  try {
    const { order_id, reason, operator } = req.body;
    const result = seatConflictService.evictOrderFromSeat(order_id, reason, operator || 'system');
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/rules', (req, res) => {
  res.json(seatConflictService.getConflictResolutionRules());
});

export default router;
