const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const seatLocks = new Map();

export function lockSeat(seatId, orderId) {
  const existing = seatLocks.get(seatId);
  if (existing) {
    if (existing.orderId === orderId) return true;
    if (Date.now() - existing.lockedAt > LOCK_TIMEOUT_MS) {
      seatLocks.delete(seatId);
    } else {
      return false;
    }
  }
  seatLocks.set(seatId, { orderId, lockedAt: Date.now() });
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
    if (now - lock.lockedAt > LOCK_TIMEOUT_MS) {
      seatLocks.delete(seatId);
    }
  }
}

setInterval(releaseExpiredLocks, 30000);
