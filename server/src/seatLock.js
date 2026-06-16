import db from './db.js';

const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const seatLocks = new Map();

function getOrderInfo(orderId) {
  try {
    const order = db.prepare(
      `SELECT o.*, g.type as group_type, g.priority as group_priority
       FROM orders o
       JOIN groups g ON o.group_id = g.id
       WHERE o.id = ?`
    ).get(orderId);
    return order;
  } catch (e) {
    console.error('getOrderInfo error:', e.message);
    return null;
  }
}

export function lockSeat(seatId, orderId, options = {}) {
  const { priority = 0, groupType = 'normal', force = false } = options;
  const existing = seatLocks.get(seatId);

  if (existing) {
    if (existing.orderId === orderId) return true;

    if (Date.now() - existing.lockedAt > LOCK_TIMEOUT_MS) {
      seatLocks.delete(seatId);
    } else {
      if (force) {
        seatLocks.set(seatId, { orderId, lockedAt: Date.now(), priority, groupType, forceLocked: true });
        return true;
      }

      const existingOrder = getOrderInfo(existing.orderId);
      const existingPriority = existingOrder?.group_priority || existing.priority || 0;
      const existingType = existingOrder?.group_type || existing.groupType || 'normal';

      if (groupType === 'blockbuster' && existingType !== 'blockbuster') {
        seatLocks.set(seatId, { orderId, lockedAt: Date.now(), priority, groupType, evictedOrderId: existing.orderId });
        return { success: true, evictedOrderId: existing.orderId, reason: 'blockbuster_priority' };
      }

      if (priority > existingPriority) {
        seatLocks.set(seatId, { orderId, lockedAt: Date.now(), priority, groupType, evictedOrderId: existing.orderId });
        return { success: true, evictedOrderId: existing.orderId, reason: 'higher_priority' };
      }

      return false;
    }
  }

  seatLocks.set(seatId, { orderId, lockedAt: Date.now(), priority, groupType });
  return true;
}

export function unlockSeat(seatId, orderId) {
  const existing = seatLocks.get(seatId);
  if (existing && existing.orderId === orderId) {
    seatLocks.delete(seatId);
    return true;
  }
  return false;
}

export function isSeatLocked(seatId) {
  const existing = seatLocks.get(seatId);
  if (!existing) return false;
  if (Date.now() - existing.lockedAt > LOCK_TIMEOUT_MS) {
    seatLocks.delete(seatId);
    return false;
  }
  return true;
}

export function releaseExpiredLocks() {
  const now = Date.now();
  for (const [seatId, lock] of seatLocks) {
    if (now - lock.lockedAt > LOCK_TIMEOUT_MS && !lock.forceLocked) {
      seatLocks.delete(seatId);
    }
  }
}

setInterval(releaseExpiredLocks, 30000);

export function getLockInfo(seatId) {
  const existing = seatLocks.get(seatId);
  if (!existing) return null;
  if (Date.now() - existing.lockedAt > LOCK_TIMEOUT_MS && !existing.forceLocked) {
    seatLocks.delete(seatId);
    return null;
  }
  return existing;
}

export function listAllLocks() {
  const result = [];
  const now = Date.now();
  for (const [seatId, lock] of seatLocks) {
    if (now - lock.lockedAt <= LOCK_TIMEOUT_MS || lock.forceLocked) {
      result.push({
        seatId,
        ...lock,
        expiresIn: Math.max(0, LOCK_TIMEOUT_MS - (now - lock.lockedAt))
      });
    }
  }
  return result;
}

export function forceUnlock(seatId, operator) {
  const existing = seatLocks.get(seatId);
  if (existing) {
    seatLocks.delete(seatId);
    return { success: true, releasedOrderId: existing.orderId, operator };
  }
  return { success: false, reason: 'no_lock_found' };
}
