import db from '../db.js';
import { v4 as uuid } from 'uuid';
import { validateGroupTransition, canRefund } from '../stateMachine.js';
import { lockSeat, unlockSeat } from '../seatLock.js';

function logState(entityType, entityId, fromState, toState, operator, reason) {
  db.prepare(`INSERT INTO state_log (entity_type, entity_id, from_state, to_state, operator, reason) VALUES (?, ?, ?, ?, ?, ?)`).run(entityType, entityId, fromState, toState, operator, reason);
}

export function createGroup({ activity_id, leader_name, leader_phone, area, min_members, payment_deadline, refund_rule }) {
  const id = uuid();
  db.prepare(`INSERT INTO groups (id, activity_id, leader_name, leader_phone, area, min_members, payment_deadline, refund_rule, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'forming')`).run(id, activity_id, leader_name, leader_phone, area, min_members, payment_deadline, refund_rule);
  logState('group', id, null, 'forming', leader_name, 'create group');
  return getById(id);
}

export function getById(id) {
  return db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
}

export function listByActivity(activityId) {
  return db.prepare('SELECT * FROM groups WHERE activity_id = ?').all(activityId);
}

export function listAll() {
  return db.prepare('SELECT * FROM groups ORDER BY created_at DESC').all();
}

export function checkAndTransition(id) {
  const group = getById(id);
  if (!group) throw new Error('Group not found');
  if (group.status !== 'forming') return group;

  const paidOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE group_id = ? AND status = 'paid'").get(id);
  if (paidOrders.cnt >= group.min_members) {
    const result = validateGroupTransition('forming', 'check_formed');
    if (result.valid) {
      db.prepare("UPDATE groups SET status = 'grouped', formed_at = datetime('now') WHERE id = ?").run(id);
      logState('group', id, 'forming', 'grouped', 'system', `reached min members: ${paidOrders.cnt}/${group.min_members}`);
    }
  }

  const deadline = new Date(group.payment_deadline);
  if (new Date() > deadline && group.status === 'forming') {
    const paidNow = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE group_id = ? AND status = 'paid'").get(id);
    if (paidNow.cnt < group.min_members) {
      const result = validateGroupTransition('forming', 'deadline_passed');
      if (result.valid) {
        db.prepare("UPDATE groups SET status = 'failed' WHERE id = ?").run(id);
        logState('group', id, 'forming', 'failed', 'system', 'deadline passed without enough members');
      }
    }
  }

  return getById(id);
}

export function cancelGroup(id, operatorName) {
  const group = getById(id);
  if (!group) throw new Error('Group not found');

  const result = validateGroupTransition(group.status, 'cancel');
  if (!result.valid) throw new Error(result.error);

  db.prepare("UPDATE groups SET status = 'cancelled' WHERE id = ?").run(id);
  logState('group', id, group.status, 'cancelled', operatorName, 'leader cancelled');

  const orders = db.prepare("SELECT * FROM orders WHERE group_id = ? AND status IN ('pending_payment', 'paid')").all(id);
  for (const order of orders) {
    if (order.status === 'paid') {
      db.prepare("UPDATE orders SET status = 'refunding' WHERE id = ?").run(order.id);
      logState('order', order.id, 'paid', 'refunding', 'system', 'group cancelled, refund needed');
    } else {
      db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(order.id);
      if (order.seat_id) {
        unlockSeat(order.seat_id, order.id);
        db.prepare("UPDATE seats SET status = 'available', locked_by = NULL, locked_at = NULL WHERE id = ?").run(order.seat_id);
      }
      logState('order', order.id, 'pending_payment', 'cancelled', 'system', 'group cancelled');
    }
  }

  return getById(id);
}

export function processFailedGroups() {
  const groups = db.prepare("SELECT * FROM groups WHERE status = 'forming'").all();
  const results = [];
  for (const g of groups) {
    try {
      const updated = checkAndTransition(g.id);
      if (updated.status !== g.status) results.push(updated);
    } catch (e) {
      results.push({ id: g.id, error: e.message });
    }
  }
  return results;
}

export function issueGroupTickets(id) {
  const group = getById(id);
  if (!group) throw new Error('Group not found');

  const result = validateGroupTransition(group.status, 'issue_tickets');
  if (!result.valid) throw new Error(result.error);

  const orders = db.prepare("SELECT * FROM orders WHERE group_id = ? AND status = 'paid'").all(id);
  const tickets = [];
  for (const order of orders) {
    if (!order.seat_id) continue;
    const ticketId = uuid();
    const code = `TK-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    db.prepare("INSERT INTO tickets (id, order_id, seat_id, activity_id, code, status) VALUES (?, ?, ?, ?, ?, 'issued')").run(ticketId, order.id, order.seat_id, group.activity_id, code);
    db.prepare("UPDATE orders SET status = 'ticket_issued', ticket_id = ? WHERE id = ?").run(ticketId, order.id);
    db.prepare("UPDATE seats SET status = 'sold', locked_by = NULL, locked_at = NULL WHERE id = ?").run(order.seat_id);
    logState('order', order.id, 'paid', 'ticket_issued', 'system', 'batch issue');
    logState('ticket', ticketId, null, 'issued', 'system', 'issued with group tickets');
    tickets.push({ ticketId, code, orderId: order.id });
  }
  db.prepare("UPDATE groups SET status = 'ticket_issued' WHERE id = ?").run(id);
  logState('group', id, group.status, 'ticket_issued', 'system', 'batch issue tickets');

  return tickets;
}

export function processFailedGroupRefunds(id) {
  const group = getById(id);
  if (!group) throw new Error('Group not found');
  if (group.status !== 'failed' && group.status !== 'cancelled') throw new Error('Group is not in failed/cancelled state');

  const result = validateGroupTransition(group.status, 'auto_refund');
  if (!result.valid) throw new Error(result.error);

  const orders = db.prepare("SELECT * FROM orders WHERE group_id = ? AND status IN ('paid', 'refunding')").all(id);
  const refunds = [];
  for (const order of orders) {
    const refundId = uuid();
    db.prepare("INSERT INTO refunds (id, order_id, amount, reason, status) VALUES (?, ?, ?, 'group_failed_auto_refund', 'completed')").run(refundId, order.id, order.amount);
    db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").run(order.id);
    if (order.seat_id) {
      unlockSeat(order.seat_id, order.id);
      db.prepare("UPDATE seats SET status = 'available', locked_by = NULL, locked_at = NULL WHERE id = ?").run(order.seat_id);
    }
    logState('order', order.id, order.status, 'refunded', 'system', 'auto refund for failed group');
    refunds.push({ refundId, orderId: order.id, amount: order.amount });
  }
  db.prepare("UPDATE groups SET status = 'refunded' WHERE id = ?").run(id);
  logState('group', id, group.status, 'refunded', 'system', 'auto refund all orders');

  return refunds;
}
