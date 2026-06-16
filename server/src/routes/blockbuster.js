import { Router } from 'express';
import db from '../db.js';
import * as groupService from '../services/groupService.js';
import * as seatConflictService from '../services/seatConflictService.js';

const router = Router();

router.post('/', (req, res) => {
  try {
    const { activity_id, leader_name, leader_phone, area, payment_deadline, refund_rule, reserved_seats, priority, blockbuster_company } = req.body;
    const group = groupService.createGroup({
      activity_id,
      leader_name,
      leader_phone,
      area,
      min_members: 1,
      payment_deadline,
      refund_rule: refund_rule || 'before_show',
      type: 'blockbuster',
      reserved_seats: reserved_seats || 0,
      priority: priority || 10,
      blockbuster_company
    });
    res.status(201).json(group);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/activity/:activityId', (req, res) => {
  try {
    const groups = groupService.listBlockbusterGroups(req.params.activityId);
    res.json(groups);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/activity/:activityId/stats', (req, res) => {
  try {
    const stats = groupService.getBlockbusterStats(req.params.activityId);
    res.json(stats);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:groupId/reserve-guests', (req, res) => {
  try {
    const { seat_ids, operator } = req.body;
    const results = groupService.reserveGuestSeats(req.params.groupId, seat_ids, operator || 'system');
    res.json(results);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/issue-guest-ticket', (req, res) => {
  try {
    const { seat_id, guest_name, guest_phone, operator } = req.body;
    const ticket = groupService.issueGuestTicket(seat_id, guest_name, guest_phone, operator || 'front_desk');
    res.json(ticket);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:groupId/occupy-seats', (req, res) => {
  try {
    const { seat_ids, operator } = req.body;
    const results = groupService.blockbusterOccupySeats(req.params.groupId, seat_ids, operator || 'system');
    res.json(results);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/:groupId/seats', (req, res) => {
  try {
    const seats = groupService.getGroupSeats(req.params.groupId);
    res.json(seats);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/auto-form/:groupId', (req, res) => {
  try {
    const group = groupService.checkAndTransition(req.params.groupId);
    res.json(group);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
