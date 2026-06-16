import { Router } from 'express';
import * as adjacentSeatService from '../services/adjacentSeatService.js';

const router = Router();

router.get('/orders', (req, res) => {
  try {
    const { activity_id } = req.query;
    const orders = adjacentSeatService.listManualAdjustOrders(activity_id);
    res.json(orders);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/blocked-seats/:activityId', (req, res) => {
  try {
    const seats = adjacentSeatService.listBlockedSeats(req.params.activityId);
    res.json(seats);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/adjust', (req, res) => {
  try {
    const { order_id, new_seat_id, operator } = req.body;
    const result = adjacentSeatService.manualAdjustSeat(order_id, new_seat_id, operator || 'admin');
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/unblock-seat', (req, res) => {
  try {
    const { seat_id } = req.body;
    const seat = adjacentSeatService.unmarkBlockedSeat(seat_id);
    res.json(seat);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/block-seat', (req, res) => {
  try {
    const { seat_id, reason, needs_manual } = req.body;
    const seat = adjacentSeatService.markBlockedSeat(seat_id, reason, needs_manual !== false);
    res.json(seat);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/adjacent-group/:groupId', (req, res) => {
  try {
    const info = adjacentSeatService.getAdjacentGroupInfo(req.params.groupId);
    res.json(info);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/check-refund', (req, res) => {
  try {
    const { order_id } = req.body;
    const result = adjacentSeatService.checkAdjacentBreakOnRefund(order_id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/create-adjacent-group', (req, res) => {
  try {
    const { seat_ids, group_id } = req.body;
    const result = adjacentSeatService.createAdjacentGroup(seat_ids, group_id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
