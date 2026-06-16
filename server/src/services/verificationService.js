import db from '../db.js';
import { v4 as uuid } from 'uuid';

export function verifyTicket(ticketId, operator, method = 'scan', note = '') {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket) throw new Error('Ticket not found');
  if (ticket.status === 'verified') throw new Error('Ticket already verified');
  if (ticket.status !== 'issued') throw new Error(`Ticket status ${ticket.status} cannot be verified`);

  const verId = uuid();
  db.prepare("INSERT INTO verifications (id, ticket_id, operator, method, status, note) VALUES (?, ?, ?, ?, 'success', ?)").run(verId, ticketId, operator, method, note);
  db.prepare("UPDATE tickets SET status = 'verified', verified_at = datetime('now') WHERE id = ?").run(ticketId);
  db.prepare("UPDATE orders SET status = 'verified' WHERE id = ?").run(ticket.order_id);

  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
}

export function supplementaryVerification(ticketId, operator, note = '') {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket) throw new Error('Ticket not found');

  const verId = uuid();
  db.prepare("INSERT INTO verifications (id, ticket_id, operator, method, status, note) VALUES (?, ?, ?, 'manual', 'success', ?)").run(verId, ticketId, operator, note);
  if (ticket.status !== 'verified') {
    db.prepare("UPDATE tickets SET status = 'verified', verified_at = datetime('now') WHERE id = ?").run(ticketId);
    db.prepare("UPDATE orders SET status = 'verified' WHERE id = ?").run(ticket.order_id);
  }
  return db.prepare('SELECT * FROM verifications WHERE id = ?').get(verId);
}

export function listByActivity(activityId) {
  return db.prepare('SELECT v.* FROM verifications v JOIN tickets t ON v.ticket_id = t.id WHERE t.activity_id = ? ORDER BY v.verified_at DESC').all(activityId);
}

export function listAll() {
  return db.prepare('SELECT * FROM verifications ORDER BY verified_at DESC').all();
}
