import { Router } from 'express';
import * as orderService from '../services/orderService.js';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(orderService.listAll());
});

router.get('/group/:groupId', (req, res) => {
  res.json(orderService.listByGroup(req.params.groupId));
});

router.get('/:id', (req, res) => {
  const order = orderService.getById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});

router.post('/', (req, res) => {
  try {
    const order = orderService.createOrder(req.body);
    res.status(201).json(order);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/pay', (req, res) => {
  try {
    const order = orderService.payOrder(req.params.id, req.body.method);
    res.json(order);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/timeout', (req, res) => {
  try {
    const order = orderService.paymentTimeout(req.params.id);
    res.json(order);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/retry', (req, res) => {
  try {
    const order = orderService.retryPayment(req.params.id);
    res.json(order);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/refund', (req, res) => {
  try {
    const order = db.prepare('SELECT o.*, g.refund_rule, a.show_time FROM orders o JOIN groups g ON o.group_id = g.id JOIN activities a ON g.activity_id = a.id WHERE o.id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Not found' });
    const result = orderService.requestRefund(req.params.id, req.body.reason, order.show_time, order.refund_rule);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/complete-refund', (req, res) => {
  try {
    const order = orderService.completeRefund(req.params.id);
    res.json(order);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
