import db from '../db.js';
import { v4 as uuid } from 'uuid';
import { validateOrderTransition, canRefund } from '../stateMachine.js';
import { lockSeat, unlockSeat } from '../seatLock.js';

function logState(entityType, entityId, fromState, toState, operator, reason) {
  db.prepare(`INSERT INTO state_log (entity_type, entity_id, from_state, to_state, operator, reason) VALUES (?, ?, ?, ?, ?, ?)`).run(entityType, entityId, fromState, toState, operator, reason);
}

export function createOrder({ group_id, user_name, user_phone, seat_id }) {
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(group_id);
  if (!group) throw new Error('Group not found');
  if (group.status !== 'forming' && group.status !== 'grouped') throw new Error(`Group status ${group.status} does not allow new orders`);

  if (seat_id) {
    const seat = db.prepare('SELECT * FROM seats WHERE id = ?').get(seat_id);
    if (!seat) throw new Error('Seat not found');
    if (seat.status !== 'available' && seat.status !== 'locked') throw new Error(`Seat status is ${seat.status}, cannot select`);
    if (seat.area !== group.area) throw new Error('Seat area does not match group area');

    const orderId = uuid();
    const locked = lockSeat(seat_id, orderId);
    if (!locked) throw new Error('Seat is currently locked by another user');

    const existingOrder = db.prepare("SELECT id FROM orders WHERE seat_id = ? AND status NOT IN ('cancelled', 'refunded')").get(seat_id);
    if (existingOrder) {
      unlockSeat(seat_id, orderId);
      throw new Error('Seat already occupied by another order');
    }

    db.prepare("UPDATE seats SET status = 'locked', locked_by = ?, locked_at = datetime('now') WHERE id = ?").run(orderId, seat_id);

    const id = uuid();
    db.prepare("INSERT INTO orders (id, group_id, user_name, user_phone, seat_id, amount, status) VALUES (?, ?, ?, ?, ?, ?, 'pending_payment')").run(id, group_id, user_name, user_phone, seat_id, seat.price);
    logState('order', id, null, 'pending_payment', user_name, 'create order with seat');
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  }

  const id = uuid();
  db.prepare("INSERT INTO orders (id, group_id, user_name, user_phone, amount, status) VALUES (?, ?, ?, ?, 0, 'pending_payment')").run(id, group_id, user_name, user_phone);
  logState('order', id, null, 'pending_payment', user_name, 'create order without seat');
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

export function getById(id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

export function listByGroup(groupId) {
  return db.prepare('SELECT * FROM orders WHERE group_id = ? ORDER BY created_at DESC').all(groupId);
}

export function listAll() {
  return db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
}

export function payOrder(id, method = 'online') {
  const order = getById(id);
  if (!order) throw new Error('Order not found');

  const result = validateOrderTransition(order.status, 'pay');
  if (!result.valid) throw new Error(result.error);

  if (order.seat_id) {
    const seat = db.prepare('SELECT * FROM seats WHERE id = ?').get(order.seat_id);
    if (seat && seat.status === 'sold') {
      throw new Error('Seat already sold to another person');
    }
  }

  const paymentId = uuid();
  db.prepare("INSERT INTO payments (id, order_id, amount, method, status, paid_at) VALUES (?, ?, ?, ?, 'completed', datetime('now'))").run(paymentId, id, order.amount, method);
  db.prepare("UPDATE orders SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(id);
  logState('order', id, 'pending_payment', 'paid', order.user_name, 'payment completed');
  return getById(id);
}

export function paymentTimeout(id) {
  const order = getById(id);
  if (!order) throw new Error('Order not found');

  const result = validateOrderTransition(order.status, 'timeout');
  if (!result.valid) throw new Error(result.error);

  db.prepare("UPDATE orders SET status = 'payment_failed' WHERE id = ?").run(id);
  if (order.seat_id) {
    unlockSeat(order.seat_id, id);
    db.prepare("UPDATE seats SET status = 'available', locked_by = NULL, locked_at = NULL WHERE id = ?").run(order.seat_id);
  }
  logState('order', id, 'pending_payment', 'payment_failed', 'system', 'payment timeout');
  return getById(id);
}

export function retryPayment(id) {
  const order = getById(id);
  if (!order) throw new Error('Order not found');

  const result = validateOrderTransition(order.status, 'retry');
  if (!result.valid) throw new Error(result.error);

  if (order.seat_id) {
    const seat = db.prepare('SELECT * FROM seats WHERE id = ?').get(order.seat_id);
    if (seat && seat.status === 'available') {
      const locked = lockSeat(order.seat_id, id);
      if (locked) {
        db.prepare("UPDATE seats SET status = 'locked', locked_by = ?, locked_at = datetime('now') WHERE id = ?").run(id, order.seat_id);
      }
    }
  }

  db.prepare("UPDATE orders SET status = 'pending_payment' WHERE id = ?").run(id);
  logState('order', id, 'payment_failed', 'pending_payment', order.user_name, 'retry payment');
  return getById(id);
}

export function requestRefund(id, reason, showTime, refundRule) {
  const order = getById(id);
  if (!order) throw new Error('Order not found');

  if (!canRefund(order.status, refundRule || 'before_show', showTime)) {
    throw new Error('Refund not allowed: either already verified, or show has started, or refund rule prohibits');
  }

  const result = validateOrderTransition(order.status, 'refund');
  if (!result.valid) {
    const cancelResult = validateOrderTransition(order.status, 'cancel_by_group');
    if (!cancelResult.valid) throw new Error(result.error);
  }

  const refundId = uuid();
  db.prepare("INSERT INTO refunds (id, order_id, amount, reason, status) VALUES (?, ?, ?, ?, 'pending')").run(refundId, id, order.amount, reason || 'user request');
  db.prepare("UPDATE orders SET status = 'refunding' WHERE id = ?").run(id);
  logState('order', id, order.status, 'refunding', order.user_name, reason || 'refund request');
  return { refundId, order: getById(id) };
}

export function completeRefund(id) {
  const order = getById(id);
  if (!order) throw new Error('Order not found');
  if (order.status !== 'refunding') throw new Error('Order is not in refunding state');

  const pendingRefund = db.prepare("SELECT * FROM refunds WHERE order_id = ? AND status = 'pending'").get(id);
  if (pendingRefund) {
    db.prepare("UPDATE refunds SET status = 'completed', processed_at = datetime('now') WHERE id = ?").run(pendingRefund.id);
  }
  db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").run(id);
  if (order.seat_id) {
    unlockSeat(order.seat_id, id);
    db.prepare("UPDATE seats SET status = 'available', locked_by = NULL, locked_at = NULL WHERE id = ?").run(order.seat_id);
  }
  logState('order', id, 'refunding', 'refunded', 'finance', 'refund completed');
  return getById(id);
}
