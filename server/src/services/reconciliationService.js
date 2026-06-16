import db from '../db.js';
import { v4 as uuid } from 'uuid';

export function createReconciliation({ activity_id, period_start, period_end, note = '' }) {
  const payments = db.prepare(`SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p JOIN orders o ON p.order_id = o.id WHERE o.id IN (SELECT id FROM orders WHERE group_id IN (SELECT id FROM groups WHERE activity_id = ?)) AND p.status = 'completed' AND p.paid_at BETWEEN ? AND ?`).get(activity_id, period_start, period_end);

  const refunds = db.prepare(`SELECT COALESCE(SUM(r.amount), 0) as total FROM refunds r JOIN orders o ON r.order_id = o.id WHERE o.id IN (SELECT id FROM orders WHERE group_id IN (SELECT id FROM groups WHERE activity_id = ?)) AND r.status = 'completed' AND r.processed_at BETWEEN ? AND ?`).get(activity_id, period_start, period_end);

  const expected = payments.total - refunds.total;
  const actual = expected;
  const difference = expected - actual;

  const id = uuid();
  db.prepare("INSERT INTO reconciliations (id, activity_id, period_start, period_end, expected_amount, actual_amount, difference, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)").run(id, activity_id, period_start, period_end, expected, actual, difference, note);
  return db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(id);
}

export function reconcile(id, actualAmount, note = '') {
  const rec = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(id);
  if (!rec) throw new Error('Reconciliation not found');

  const difference = rec.expected_amount - actualAmount;
  db.prepare("UPDATE reconciliations SET actual_amount = ?, difference = ?, status = 'completed', note = ? WHERE id = ?").run(actualAmount, difference, note, id);
  return db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(id);
}

export function listByActivity(activityId) {
  return db.prepare('SELECT * FROM reconciliations WHERE activity_id = ? ORDER BY created_at DESC').all(activityId);
}

export function listAll() {
  return db.prepare('SELECT * FROM reconciliations ORDER BY created_at DESC').all();
}
