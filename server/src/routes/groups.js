import { Router } from 'express';
import * as groupService from '../services/groupService.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(groupService.listAll());
});

router.get('/activity/:activityId', (req, res) => {
  res.json(groupService.listByActivity(req.params.activityId));
});

router.get('/:id', (req, res) => {
  const group = groupService.getById(req.params.id);
  if (!group) return res.status(404).json({ error: 'Not found' });
  res.json(group);
});

router.post('/', (req, res) => {
  try {
    const group = groupService.createGroup(req.body);
    res.status(201).json(group);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/cancel', (req, res) => {
  try {
    const group = groupService.cancelGroup(req.params.id, req.body.operator || 'leader');
    res.json(group);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/check', (req, res) => {
  try {
    const group = groupService.checkAndTransition(req.params.id);
    res.json(group);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/issue-tickets', (req, res) => {
  try {
    const tickets = groupService.issueGroupTickets(req.params.id);
    res.json(tickets);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/auto-refund', (req, res) => {
  try {
    const refunds = groupService.processFailedGroupRefunds(req.params.id);
    res.json(refunds);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/process-failed', (req, res) => {
  const results = groupService.processFailedGroups();
  res.json(results);
});

export default router;
