import db from '../db.js';
import { v4 as uuid } from 'uuid';

export function createAdjacentGroup(seatIds, groupId) {
  const groupKey = uuid();

  const seats = db.prepare(
    `SELECT * FROM seats WHERE id IN (${seatIds.map(() => '?').join(',')})
     ORDER BY row_num, col_num`
  ).all(...seatIds);

  if (seats.length !== seatIds.length) {
    throw new Error('Some seats not found');
  }

  const rows = [...new Set(seats.map(s => s.row_num))];
  if (rows.length > 1) {
    throw new Error('Adjacent seats must be in the same row');
  }

  const cols = seats.map(s => s.col_num).sort((a, b) => a - b);
  for (let i = 1; i < cols.length; i++) {
    if (cols[i] - cols[i - 1] !== 1) {
      throw new Error('Seats are not adjacent');
    }
  }

  db.prepare(
    "UPDATE seats SET adjacent_group_id = ? WHERE id IN (" + seatIds.map(() => '?').join(',') + ")"
  ).run(groupKey, ...seatIds);

  db.prepare(
    "UPDATE orders SET adjacent_group_id = ? WHERE seat_id IN (" + seatIds.map(() => '?').join(',') + ") AND group_id = ?"
  ).run(groupKey, ...seatIds, groupId);

  return {
    groupId: groupKey,
    seats: seats.map(s => ({ id: s.id, row: s.row_num, col: s.col_num }))
  };
}

export function checkAdjacentBreakOnRefund(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new Error('Order not found');
  if (!order.adjacent_group_id) {
    return { wouldBreak: false, reason: 'no_adjacent_group' };
  }

  const groupOrders = db.prepare(
    `SELECT o.*, s.row_num, s.col_num
     FROM orders o
     JOIN seats s ON o.seat_id = s.id
     WHERE o.adjacent_group_id = ? AND o.status NOT IN ('cancelled', 'refunded')
     ORDER BY s.row_num, s.col_num`
  ).all(order.adjacent_group_id);

  if (groupOrders.length <= 1) {
    return { wouldBreak: false, reason: 'single_seat_group' };
  }

  const issuedOrders = groupOrders.filter(o => o.status === 'ticket_issued' || o.status === 'verified');
  const thisOrderIndex = groupOrders.findIndex(o => o.id === orderId);

  if (issuedOrders.length === 0) {
    return { wouldBreak: false, reason: 'no_tickets_issued_yet' };
  }

  const issuedIndices = issuedOrders.map(o => groupOrders.findIndex(go => go.id === o.id));
  const minIssued = Math.min(...issuedIndices);
  const maxIssued = Math.max(...issuedIndices);

  if (thisOrderIndex >= minIssued && thisOrderIndex <= maxIssued) {
    const leftIssued = issuedIndices.some(i => i < thisOrderIndex);
    const rightIssued = issuedIndices.some(i => i > thisOrderIndex);

    if (leftIssued && rightIssued) {
      return {
        wouldBreak: true,
        reason: 'breaks_issued_adjacency',
        description: '退票会破坏已出票座位的相邻关系，中间出现空位',
        affectedOrders: groupOrders.filter((_, i) => i >= minIssued && i <= maxIssued && i !== thisOrderIndex),
        gapSeat: {
          row: groupOrders[thisOrderIndex].row_num,
          col: groupOrders[thisOrderIndex].col_num
        }
      };
    }
  }

  return { wouldBreak: false, reason: 'edge_seat_or_unissued' };
}

export function markBlockedSeat(seatId, blockReason, needsManual = true) {
  db.prepare(
    "UPDATE seats SET status = 'blocked', block_reason = ?, needs_manual = ? WHERE id = ?"
  ).run(blockReason, needsManual ? 1 : 0, seatId);

  db.prepare(
    "INSERT INTO state_log (entity_type, entity_id, from_state, to_state, operator, reason) VALUES (?, ?, ?, ?, ?, ?)"
  ).run('seat', seatId, 'available', 'blocked', 'system', blockReason);

  return db.prepare('SELECT * FROM seats WHERE id = ?').get(seatId);
}

export function unmarkBlockedSeat(seatId, operator = 'admin', reason = '人工解除座位锁定') {
  const seat = db.prepare('SELECT * FROM seats WHERE id = ?').get(seatId);
  if (!seat) throw new Error('Seat not found');

  db.prepare(
    "UPDATE seats SET status = 'available', block_reason = NULL, needs_manual = 0 WHERE id = ?"
  ).run(seatId);

  db.prepare(
    "INSERT INTO state_log (entity_type, entity_id, from_state, to_state, operator, reason) VALUES (?, ?, ?, ?, ?, ?)"
  ).run('seat', seatId, 'blocked', 'available', operator, reason);

  return db.prepare('SELECT * FROM seats WHERE id = ?').get(seatId);
}

export function listBlockedSeats(activityId) {
  return db.prepare(
    `SELECT s.*, o.user_name, o.user_phone, o.status as order_status, g.leader_name
     FROM seats s
     LEFT JOIN orders o ON s.original_order_id = o.id
     LEFT JOIN groups g ON o.group_id = g.id
     WHERE s.activity_id = ? AND s.status = 'blocked'
     ORDER BY s.area, s.row_num, s.col_num`
  ).all(activityId);
}

export function listManualAdjustOrders(activityId) {
  return db.prepare(
    `SELECT o.*, s.row_num, s.col_num, s.area, s.block_reason,
            g.leader_name, g.type as group_type, a.name as activity_name
     FROM orders o
     JOIN seats s ON o.seat_id = s.id
     JOIN groups g ON o.group_id = g.id
     JOIN activities a ON g.activity_id = a.id
     WHERE s.needs_manual = 1 OR o.is_adjacent_break = 1
     ORDER BY o.created_at DESC`
  ).all();
}

export function processRefundWithAdjacentCheck(orderId, reason, operator = 'system') {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new Error('Order not found');

  const checkResult = checkAdjacentBreakOnRefund(orderId);

  if (checkResult.wouldBreak) {
    if (order.seat_id) {
      db.prepare(
        "UPDATE seats SET original_order_id = ?, block_reason = ?, needs_manual = 1 WHERE id = ?"
      ).run(orderId, checkResult.description, order.seat_id);

      db.prepare(
        "INSERT INTO state_log (entity_type, entity_id, from_state, to_state, operator, reason) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('seat', order.seat_id, 'sold', 'blocked', 'system', checkResult.description);
    }

    db.prepare(
      "UPDATE orders SET is_adjacent_break = 1 WHERE id = ?"
    ).run(orderId);

    return {
      success: true,
      refundAllowed: true,
      adjacentBroken: true,
      blockedReason: checkResult.description,
      blockReason: checkResult.description,
      blockedSeats: order.seat_id ? [order.seat_id] : [],
      needsManualAdjust: true,
      affectedOrders: checkResult.affectedOrders
    };
  }

  return {
    success: true,
    refundAllowed: true,
    adjacentBroken: false,
    blockedSeats: []
  };
}

export function manualAdjustSeat(orderId, newSeatId, operator, reason = 'manual adjustment') {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new Error('Order not found');

  const oldSeatId = order.seat_id;

  if (oldSeatId) {
    db.prepare(
      "UPDATE seats SET status = 'available', block_reason = NULL, needs_manual = 0, original_order_id = NULL, adjacent_group_id = NULL WHERE id = ?"
    ).run(oldSeatId);
  }

  const newSeat = db.prepare('SELECT * FROM seats WHERE id = ?').get(newSeatId);
  if (!newSeat || newSeat.status !== 'available') {
    throw new Error('New seat is not available');
  }

  db.prepare(
    "UPDATE seats SET status = 'sold', locked_by = NULL, locked_at = NULL WHERE id = ?"
  ).run(newSeatId);

  db.prepare(
    "UPDATE orders SET seat_id = ?, adjacent_group_id = NULL, is_adjacent_break = 0 WHERE id = ?"
  ).run(newSeatId, orderId);

  if (order.ticket_id) {
    db.prepare(
      "UPDATE tickets SET seat_id = ? WHERE id = ?"
    ).run(newSeatId, order.ticket_id);
  }

  db.prepare(
    "INSERT INTO state_log (entity_type, entity_id, from_state, to_state, operator, reason) VALUES (?, ?, ?, ?, ?, ?)"
  ).run('order', orderId, 'manual_adjust', 'adjusted', operator, reason || `人工调座: ${oldSeatId} -> ${newSeatId}`);

  return {
    success: true,
    orderId,
    oldSeat: oldSeatId,
    newSeat: newSeatId,
    operator
  };
}

export function getAdjacentGroupInfo(groupId) {
  const orders = db.prepare(
    `SELECT o.*, s.row_num, s.col_num, s.area, s.status as seat_status
     FROM orders o
     JOIN seats s ON o.seat_id = s.id
     WHERE o.adjacent_group_id = ?
     ORDER BY s.row_num, s.col_num`
  ).all(groupId);

  const seatStatuses = [...new Set(orders.map(o => o.seat_status))];
  const orderStatuses = [...new Set(orders.map(o => o.status))];

  return {
    groupId,
    orderCount: orders.length,
    orders,
    seatStatuses,
    orderStatuses,
    hasIssuedTickets: orderStatuses.some(s => s === 'ticket_issued' || s === 'verified'),
    hasBlockedSeats: seatStatuses.includes('blocked')
  };
}
