import db from '../db.js';
import { v4 as uuid } from 'uuid';

const PAYMENT_STATUS_WEIGHT = {
  'ticket_issued': 4,
  'verified': 5,
  'paid': 3,
  'pending_payment': 2,
  'payment_failed': 1,
  'refunding': 0,
  'refunded': 0,
  'cancelled': 0
};

function getPaymentStatusWeight(status) {
  return PAYMENT_STATUS_WEIGHT[status] || 0;
}

export function analyzeRowConflicts(activityId, rowNum, area) {
  const sql = `SELECT s.*, o.status as order_status, g.type as group_type, g.priority as group_priority,
            g.id as group_id, o.id as order_id
     FROM seats s
     LEFT JOIN orders o ON s.id = o.seat_id AND o.status NOT IN ('cancelled', 'refunded')
     LEFT JOIN groups g ON o.group_id = g.id
     WHERE s.activity_id = ? AND s.row_num = ?` + (area ? ' AND s.area = ?' : '') + `
     ORDER BY s.col_num`;
  
  const params = area ? [activityId, rowNum, area] : [activityId, rowNum];
  const seats = db.prepare(sql).all(...params);

  const conflicts = [];
  const seatGroups = new Map();

  for (const seat of seats) {
    if (seat.group_type && seat.status !== 'available') {
      const key = `${seat.row_num}-${seat.col_num}`;
      if (!seatGroups.has(seat.group_type)) {
        seatGroups.set(seat.group_type, []);
      }
      seatGroups.get(seat.group_type).push(seat);
    }
  }

  const normalSeats = seatGroups.get('normal') || [];
  const blockbusterSeats = seatGroups.get('blockbuster') || [];

  for (const normalSeat of normalSeats) {
    for (const bbSeat of blockbusterSeats) {
      if (normalSeat.row_num === bbSeat.row_num &&
          Math.abs(normalSeat.col_num - bbSeat.col_num) <= 1) {
        conflicts.push({
          type: 'adjacent_conflict',
          row: normalSeat.row_num,
          seats: [normalSeat, bbSeat],
          description: `第${normalSeat.row_num}排${normalSeat.col_num}座(普通)与${bbSeat.col_num}座(包场)相邻`
        });
      }
    }
  }

  return {
    seats,
    conflicts,
    normalCount: normalSeats.length,
    blockbusterCount: blockbusterSeats.length
  };
}

export function resolveSeatConflict(seatId, requestingGroupId) {
  const requestingGroup = db.prepare('SELECT * FROM groups WHERE id = ?').get(requestingGroupId);
  if (!requestingGroup) throw new Error('Requesting group not found');

  const existingOrder = db.prepare(
    `SELECT o.*, g.type as group_type, g.priority as group_priority
     FROM orders o
     JOIN groups g ON o.group_id = g.id
     WHERE o.seat_id = ? AND o.status NOT IN ('cancelled', 'refunded')`
  ).get(seatId);

  if (!existingOrder) {
    return { canTake: true, reason: 'seat_available' };
  }

  const existingWeight = getPaymentStatusWeight(existingOrder.status);
  const requestingPriority = requestingGroup.priority || 0;
  const existingPriority = existingOrder.group_priority || 0;

  if (requestingGroup.type === 'blockbuster' && existingOrder.group_type === 'normal') {
    if (existingWeight < 3) {
      return {
        canTake: true,
        reason: 'blockbuster_priority_over_unpaid',
        evictOrderId: existingOrder.id,
        evictReason: '包场活动优先级更高，该座位已被包场抢占'
      };
    } else if (existingWeight >= 3 && requestingPriority > existingPriority) {
      return {
        canTake: true,
        reason: 'higher_priority_blockbuster',
        evictOrderId: existingOrder.id,
        evictReason: '高优先级包场活动抢占，请联系客服处理座位调整'
      };
    }
  }

  if (requestingGroup.type === 'normal' && existingOrder.group_type === 'blockbuster') {
    return {
      canTake: false,
      reason: 'blockbuster_seat_protected',
      conflictGroupId: existingOrder.group_id
    };
  }

  if (requestingPriority > existingPriority) {
    if (existingWeight < 3) {
      return {
        canTake: true,
        reason: 'higher_priority_unpaid',
        evictOrderId: existingOrder.id,
        evictReason: '高优先级活动抢占未支付座位'
      };
    }
  }

  return {
    canTake: false,
    reason: 'seat_occupied_by_higher_or_equal_priority',
    conflictOrderId: existingOrder.id,
    conflictGroupId: existingOrder.group_id
  };
}

export function evictOrderFromSeat(orderId, reason, operator = 'system') {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new Error('Order not found');

  if (order.seat_id) {
    db.prepare(
      "UPDATE seats SET status = 'available', locked_by = NULL, locked_at = NULL, block_reason = NULL WHERE id = ?"
    ).run(order.seat_id);
  }

  if (order.status === 'paid') {
    db.prepare("UPDATE orders SET status = 'refunding' WHERE id = ?").run(orderId);
    db.prepare(
      "INSERT INTO refunds (id, order_id, amount, reason, status) VALUES (?, ?, ?, ?, 'pending')"
    ).run(uuid(), orderId, order.amount, reason);
  } else {
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(orderId);
  }

  db.prepare(
    "INSERT INTO state_log (entity_type, entity_id, from_state, to_state, operator, reason) VALUES (?, ?, ?, ?, ?, ?)"
  ).run('order', orderId, order.status, order.status === 'paid' ? 'refunding' : 'cancelled', operator, reason);

  return order;
}

export function listActivityConflicts(activityId) {
  const rows = db.prepare(
    `SELECT DISTINCT s.row_num, s.area
     FROM seats s
     JOIN orders o ON s.id = o.seat_id
     JOIN groups g ON o.group_id = g.id
     WHERE s.activity_id = ? AND o.status NOT IN ('cancelled', 'refunded')
     ORDER BY s.area, s.row_num`
  ).all(activityId);

  const allConflicts = [];
  for (const row of rows) {
    const result = analyzeRowConflicts(activityId, row.row_num, row.area);
    allConflicts.push(...result.conflicts);
  }

  return allConflicts;
}

export function getConflictResolutionRules() {
  return {
    priorityOrder: ['blockbuster_high', 'blockbuster_normal', 'normal_high', 'normal_low'],
    paymentStatusOrder: ['verified', 'ticket_issued', 'paid', 'pending_payment', 'payment_failed'],
    rules: [
      { condition: '包场 vs 未支付普通团购', result: '包场抢占成功', action: 'evict_unpaid' },
      { condition: '包场 vs 已支付普通团购', result: '包场优先级高则抢占', action: 'evict_paid_with_notification' },
      { condition: '普通团购 vs 包场', result: '包场座位受保护', action: 'reject' },
      { condition: '同类型活动', result: '比较优先级+付款状态', action: 'compare_priority' }
    ]
  };
}
