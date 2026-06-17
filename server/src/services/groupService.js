import db from '../db.js';
import { v4 as uuid } from 'uuid';
import { validateGroupTransition, canRefund } from '../stateMachine.js';
import { lockSeat, unlockSeat, forceUnlockSeat, unlockSeatsByOrderId } from '../seatLock.js';
import * as seatConflictService from './seatConflictService.js';
import * as adjacentSeatService from './adjacentSeatService.js';

function logState(entityType, entityId, fromState, toState, operator, reason) {
  db.prepare(`INSERT INTO state_log (entity_type, entity_id, from_state, to_state, operator, reason) VALUES (?, ?, ?, ?, ?, ?)`).run(entityType, entityId, fromState, toState, operator, reason);
}

export function createGroup({ activity_id, leader_name, leader_phone, area, min_members, payment_deadline, refund_rule, type = 'normal', reserved_seats = 0, priority = 0, blockbuster_company }) {
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(activity_id);
  if (!activity) throw new Error('Activity not found');

  const effectivePriority = priority || activity.priority || 0;
  const effectiveType = type === 'blockbuster' ? 'blockbuster' : 'normal';

  const finalMinMembers = effectiveType === 'blockbuster' ? 1 : min_members;

  const id = uuid();
  db.prepare(`INSERT INTO groups (id, activity_id, leader_name, leader_phone, area, min_members, payment_deadline, refund_rule, status, type, reserved_seats, priority, blockbuster_company) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'forming', ?, ?, ?, ?)`).run(
    id, activity_id, leader_name, leader_phone, area, finalMinMembers, payment_deadline, refund_rule,
    effectiveType, reserved_seats, effectivePriority, blockbuster_company || null
  );
  logState('group', id, null, 'forming', leader_name, `create ${effectiveType} group`);
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
  if (group.status !== 'forming') {
    const paidOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE group_id = ? AND status = 'paid'").get(id);
    return { ...group, current_members: paidOrders.cnt };
  }

  const groupType = group.type || 'normal';
  const paidOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE group_id = ? AND status = 'paid'").get(id);

  if (groupType === 'blockbuster') {
    const result = validateGroupTransition('forming', 'blockbuster_auto_form', 'blockbuster');
    if (result.valid) {
      db.prepare("UPDATE groups SET status = 'grouped', formed_at = datetime('now') WHERE id = ?").run(id);
      logState('group', id, 'forming', 'grouped', 'system', 'blockbuster auto formed, no min members required');
    }
    const updated = getById(id);
    return { ...updated, current_members: paidOrders.cnt };
  }

  if (paidOrders.cnt >= group.min_members) {
    const result = validateGroupTransition('forming', 'check_formed', 'normal');
    if (result.valid) {
      db.prepare("UPDATE groups SET status = 'grouped', formed_at = datetime('now') WHERE id = ?").run(id);
      logState('group', id, 'forming', 'grouped', 'system', `reached min members: ${paidOrders.cnt}/${group.min_members}`);
    }
  }

  const deadline = new Date(group.payment_deadline);
  if (new Date() > deadline && group.status === 'forming') {
    const paidNow = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE group_id = ? AND status = 'paid'").get(id);
    if (paidNow.cnt < group.min_members) {
      const result = validateGroupTransition('forming', 'deadline_passed', 'normal');
      if (result.valid) {
        db.prepare("UPDATE groups SET status = 'failed' WHERE id = ?").run(id);
        logState('group', id, 'forming', 'failed', 'system', 'deadline passed without enough members');
      }
    }
  }

  const updated = getById(id);
  return { ...updated, current_members: paidOrders.cnt };
}

export function cancelGroup(id, operatorName) {
  const group = getById(id);
  if (!group) throw new Error('Group not found');

  const result = validateGroupTransition(group.status, 'cancel');
  if (!result.valid) throw new Error(result.error);

  db.prepare("UPDATE groups SET status = 'cancelled' WHERE id = ?").run(id);
  logState('group', id, group.status, 'cancelled', operatorName, 'leader cancelled');

  const orders = db.prepare("SELECT * FROM orders WHERE group_id = ? AND status IN ('pending_payment', 'paid', 'payment_failed')").all(id);
  for (const order of orders) {
    if (order.status === 'paid') {
      db.prepare("UPDATE orders SET status = 'refunding' WHERE id = ?").run(order.id);
      logState('order', order.id, 'paid', 'refunding', 'system', 'group cancelled, refund needed');
    } else if (order.status === 'pending_payment') {
      db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(order.id);
      if (order.seat_id) {
        forceUnlockSeat(order.seat_id);
        unlockSeatsByOrderId(order.id);
        db.prepare("UPDATE seats SET status = 'available', locked_by = NULL, locked_at = NULL WHERE id = ?").run(order.seat_id);
      }
      logState('order', order.id, 'pending_payment', 'cancelled', 'system', 'group cancelled');
    } else if (order.status === 'payment_failed') {
      db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(order.id);
      if (order.seat_id) {
        forceUnlockSeat(order.seat_id);
        unlockSeatsByOrderId(order.id);
        db.prepare("UPDATE seats SET status = 'available', locked_by = NULL, locked_at = NULL WHERE id = ?").run(order.seat_id);
      }
      logState('order', order.id, 'payment_failed', 'cancelled', 'system', 'group cancelled');
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

  const result = validateGroupTransition(group.status, 'issue_tickets', group.type || 'normal');
  if (!result.valid) throw new Error(result.error);

  const orders = db.prepare("SELECT * FROM orders WHERE group_id = ? AND status = 'paid'").all(id);
  const tickets = [];

  const areaRowGroups = new Map();
  for (const order of orders) {
    if (!order.seat_id) continue;
    const seat = db.prepare('SELECT * FROM seats WHERE id = ?').get(order.seat_id);
    if (!seat) continue;
    const key = `${seat.area}-${seat.row_num}`;
    if (!areaRowGroups.has(key)) areaRowGroups.set(key, []);
    areaRowGroups.get(key).push({ order, seat });
  }

  for (const [, groupSeats] of areaRowGroups) {
    groupSeats.sort((a, b) => a.seat.col_num - b.seat.col_num);
    let currentAdjacentGroup = [];

    for (let i = 0; i < groupSeats.length; i++) {
      const { order, seat } = groupSeats[i];

      if (currentAdjacentGroup.length === 0) {
        currentAdjacentGroup.push({ order, seat });
      } else {
        const lastSeat = currentAdjacentGroup[currentAdjacentGroup.length - 1].seat;
        if (seat.col_num - lastSeat.col_num === 1) {
          currentAdjacentGroup.push({ order, seat });
        } else {
          if (currentAdjacentGroup.length >= 2) {
            adjacentSeatService.createAdjacentGroup(
              currentAdjacentGroup.map(x => x.seat.id),
              id
            );
          }
          currentAdjacentGroup = [{ order, seat }];
        }
      }

      if (i === groupSeats.length - 1 && currentAdjacentGroup.length >= 2) {
        adjacentSeatService.createAdjacentGroup(
          currentAdjacentGroup.map(x => x.seat.id),
          id
        );
      }
    }
  }

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
      forceUnlockSeat(order.seat_id);
      unlockSeatsByOrderId(order.id);
      db.prepare("UPDATE seats SET status = 'available', locked_by = NULL, locked_at = NULL WHERE id = ?").run(order.seat_id);
    }
    logState('order', order.id, order.status, 'refunded', 'system', 'auto refund for failed group');
    refunds.push({ refundId, orderId: order.id, amount: order.amount });
  }
  db.prepare("UPDATE groups SET status = 'refunded' WHERE id = ?").run(id);
  logState('group', id, group.status, 'refunded', 'system', 'auto refund all orders');

  return refunds;
}

export function reserveGuestSeats(groupId, seatIdsOrCount, operator) {
  const group = getById(groupId);
  if (!group) throw new Error('Group not found');
  if (group.type !== 'blockbuster') throw new Error('Only blockbuster groups can reserve guest seats');

  let seatIds;
  if (Array.isArray(seatIdsOrCount)) {
    seatIds = seatIdsOrCount;
  } else if (typeof seatIdsOrCount === 'number') {
    const count = seatIdsOrCount;
    const availableSeats = db.prepare(`
      SELECT s.* FROM seats s
      LEFT JOIN orders o ON o.seat_id = s.id AND o.group_id = ?
      WHERE s.activity_id = ? AND s.area = ? AND s.status = 'available' AND s.seat_type = 'normal'
        AND o.id IS NULL
      ORDER BY s.row_num, s.col_num
      LIMIT ?
    `).all(groupId, group.activity_id, group.area, count);
    if (availableSeats.length < count) {
      throw new Error(`Not enough available seats, need ${count}, only ${availableSeats.length} available`);
    }
    seatIds = availableSeats.map(s => s.id);
  } else {
    throw new Error('Second argument must be an array of seat IDs or a count number');
  }

  const currentReserved = db.prepare(
    "SELECT COUNT(*) as cnt FROM seats WHERE seat_type = 'reserved' AND id IN (SELECT seat_id FROM orders WHERE group_id = ?)"
  ).get(groupId);

  const newCount = currentReserved.cnt + seatIds.length;
  if (newCount > group.reserved_seats) {
    throw new Error(`Cannot reserve more than ${group.reserved_seats} guest seats, current: ${currentReserved.cnt}, trying: ${seatIds.length}`);
  }

  const results = [];
  for (const seatId of seatIds) {
    const seat = db.prepare('SELECT * FROM seats WHERE id = ?').get(seatId);
    if (!seat) continue;

    const conflict = seatConflictService.resolveSeatConflict(seatId, groupId);
    if (conflict.canTake && conflict.evictOrderId) {
      seatConflictService.evictOrderFromSeat(conflict.evictOrderId, conflict.evictReason, operator);
    } else if (!conflict.canTake) {
      throw new Error(`Seat ${seatId} cannot be reserved: ${conflict.reason}`);
    }

    const orderId = uuid();
    db.prepare(
      "INSERT INTO orders (id, group_id, user_name, user_phone, seat_id, amount, status, adjacent_group_id) VALUES (?, ?, ?, ?, ?, 0, 'paid', NULL)"
    ).run(orderId, groupId, '嘉宾席预留', 'guest-reserved', seatId);

    db.prepare(
      "UPDATE seats SET status = 'sold', seat_type = 'reserved', group_type = 'blockbuster', group_id = ?, locked_by = NULL, locked_at = NULL WHERE id = ?"
    ).run(groupId, seatId);

    logState('order', orderId, null, 'paid', operator, 'guest seat reserved for blockbuster');
    logState('seat', seatId, seat.status, 'sold', operator, 'reserved as guest seat');
    results.push(db.prepare('SELECT * FROM seats WHERE id = ?').get(seatId));
  }

  return results;
}

export function issueGuestTicket(seatId, guestName, guestPhone, operator) {
  const seat = db.prepare('SELECT * FROM seats WHERE id = ?').get(seatId);
  if (!seat) throw new Error('Seat not found');
  if (seat.seat_type !== 'reserved') throw new Error('Seat is not a reserved guest seat');

  const order = db.prepare(
    "SELECT * FROM orders WHERE seat_id = ? AND status = 'paid' AND user_name = '嘉宾席预留'"
  ).get(seatId);

  if (!order) throw new Error('No reserved order found for this seat');

  db.prepare(
    "UPDATE orders SET user_name = ?, user_phone = ? WHERE id = ?"
  ).run(guestName, guestPhone, order.id);

  db.prepare(
    "UPDATE seats SET guest_issued_by = ?, guest_issued_at = datetime('now') WHERE id = ?"
  ).run(operator, seatId);

  const ticketId = uuid();
  const code = `TK-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  db.prepare(
    "INSERT INTO tickets (id, order_id, seat_id, activity_id, code, status) VALUES (?, ?, ?, ?, ?, 'issued')"
  ).run(ticketId, order.id, seatId, seat.activity_id, code);

  db.prepare(
    "UPDATE orders SET status = 'ticket_issued', ticket_id = ? WHERE id = ?"
  ).run(ticketId, order.id);

  logState('order', order.id, 'paid', 'ticket_issued', operator, 'guest ticket issued at front desk');
  logState('ticket', ticketId, null, 'issued', operator, 'guest ticket issued');

  return { ticketId, code, orderId: order.id, guestName, guestPhone };
}

export function getGroupSeats(groupId) {
  return db.prepare(
    `SELECT s.*, o.status as order_status, o.user_name, o.user_phone, o.id as order_id
     FROM seats s
     LEFT JOIN orders o ON s.id = o.seat_id AND o.group_id = ? AND o.status NOT IN ('cancelled', 'refunded')
     WHERE s.id IN (SELECT seat_id FROM orders WHERE group_id = ? AND status NOT IN ('cancelled', 'refunded'))
     ORDER BY s.area, s.row_num, s.col_num`
  ).all(groupId, groupId);
}

export function listBlockbusterGroups(activityId) {
  return db.prepare(
    "SELECT * FROM groups WHERE activity_id = ? AND type = 'blockbuster' ORDER BY created_at DESC"
  ).all(activityId);
}

export function getBlockbusterStats(activityId) {
  const groups = listBlockbusterGroups(activityId);
  const normalGroups = db.prepare(
    "SELECT * FROM groups WHERE activity_id = ? AND type = 'normal' ORDER BY created_at DESC"
  ).all(activityId);

  let bbSeats = 0, bbSold = 0, normalSeats = 0, normalSold = 0;
  let reservedSeats = 0, issuedGuests = 0;

  for (const g of groups) {
    const seats = getGroupSeats(g.id);
    bbSeats += seats.length;
    bbSold += seats.filter(s => s.order_status === 'paid' || s.order_status === 'ticket_issued' || s.order_status === 'verified').length;
    reservedSeats += seats.filter(s => s.seat_type === 'reserved').length;
    issuedGuests += seats.filter(s => s.guest_issued_by !== null).length;
  }

  for (const g of normalGroups) {
    const seats = getGroupSeats(g.id);
    normalSeats += seats.length;
    normalSold += seats.filter(s => s.order_status === 'paid' || s.order_status === 'ticket_issued' || s.order_status === 'verified').length;
  }

  return {
    blockbuster: {
      groupCount: groups.length,
      totalSeats: bbSeats,
      soldSeats: bbSold,
      reservedSeats,
      issuedGuests
    },
    normal: {
      groupCount: normalGroups.length,
      totalSeats: normalSeats,
      soldSeats: normalSold
    }
  };
}

export function blockbusterOccupySeats(groupId, seatIds, operator) {
  const group = getById(groupId);
  if (!group) throw new Error('Group not found');
  if (group.type !== 'blockbuster') throw new Error('Only blockbuster groups can bulk occupy seats');

  const results = [];
  for (const seatId of seatIds) {
    const seat = db.prepare('SELECT * FROM seats WHERE id = ?').get(seatId);
    if (!seat) continue;

    const conflict = seatConflictService.resolveSeatConflict(seatId, groupId);
    if (conflict.canTake && conflict.evictOrderId) {
      seatConflictService.evictOrderFromSeat(conflict.evictOrderId, conflict.evictReason, operator);
    } else if (!conflict.canTake) {
      results.push({ seatId, success: false, reason: conflict.reason });
      continue;
    }

    const orderId = uuid();
    db.prepare(
      "INSERT INTO orders (id, group_id, user_name, user_phone, seat_id, amount, status) VALUES (?, ?, ?, ?, ?, ?, 'pending_payment')"
    ).run(orderId, groupId, group.leader_name, group.leader_phone, seatId, seat.price);

    db.prepare(
      "UPDATE seats SET status = 'locked', group_type = 'blockbuster', locked_by = ?, locked_at = datetime('now') WHERE id = ?"
    ).run(orderId, seatId);

    lockSeat(seatId, orderId);

    logState('order', orderId, null, 'pending_payment', operator, 'blockbuster bulk seat lock');
    results.push({ seatId, success: true, orderId });
  }

  return results;
}
