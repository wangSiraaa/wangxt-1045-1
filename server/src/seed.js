import { initDatabase } from './db.js';
import db from './db.js';
import { v4 as uuid } from 'uuid';
import * as groupService from './services/groupService.js';
import * as orderService from './services/orderService.js';
import * as verificationService from './services/verificationService.js';

async function seed() {
  await initDatabase();
  console.log('=== Seeding demo data ===\n');

  const activityId = uuid();
  const showTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO activities (id, name, venue, show_time, status) VALUES (?, ?, ?, ?, ?)').run(activityId, '《红楼梦》大型舞剧', '国家大剧院', showTime, 'on_sale');
  console.log(`[Activity] ${activityId} - 《红楼梦》大型舞剧`);

  const areas = [
    { name: 'A区贵宾', rows: 3, cols: 6, price: 880 },
    { name: 'B区标准', rows: 5, cols: 8, price: 480 },
    { name: 'C区经济', rows: 5, cols: 10, price: 280 }
  ];
  const seatInsert = db.prepare('INSERT OR IGNORE INTO seats (id, activity_id, area, row_num, col_num, price, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const allSeats = [];
  for (const area of areas) {
    for (let r = 1; r <= area.rows; r++) {
      for (let c = 1; c <= area.cols; c++) {
        const sid = uuid();
        seatInsert.run(sid, activityId, area.name, r, c, area.price, 'available');
        allSeats.push({ id: sid, area: area.name, row: r, col: c, price: area.price });
      }
    }
  }
  console.log(`[Seats] Generated ${allSeats.length} seats across ${areas.length} areas`);

  const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  console.log('\n--- Scenario 1: 成团出票 + 入场核销 ---');
  const group1 = groupService.createGroup({
    activity_id: activityId,
    leader_name: '张团长',
    leader_phone: '13800001111',
    area: 'A区贵宾',
    min_members: 2,
    payment_deadline: deadline,
    refund_rule: 'before_show'
  });
  console.log(`[Group-1] Created: ${group1.id}, status: forming`);

  const aSeats = allSeats.filter(s => s.area === 'A区贵宾');
  const order1 = orderService.createOrder({ group_id: group1.id, user_name: '张团长', user_phone: '13800001111', seat_id: aSeats[0].id });
  console.log(`[Order-1] Created: ${order1.id}, status: ${order1.status}, seat: A区-${aSeats[0].row}排${aSeats[0].col}座`);

  const paid1 = orderService.payOrder(order1.id, 'wechat');
  console.log(`[Order-1] Paid: status: ${paid1.status}`);

  const order2 = orderService.createOrder({ group_id: group1.id, user_name: '李观众', user_phone: '13800002222', seat_id: aSeats[1].id });
  console.log(`[Order-2] Created: ${order2.id}, status: ${order2.status}`);

  const paid2 = orderService.payOrder(order2.id, 'alipay');
  console.log(`[Order-2] Paid: status: ${paid2.status}`);

  const checked1 = groupService.checkAndTransition(group1.id);
  console.log(`[Group-1] After check: status: ${checked1.status}`);

  const tickets1 = groupService.issueGroupTickets(group1.id);
  console.log(`[Group-1] Tickets issued: ${tickets1.length} tickets`);
  for (const t of tickets1) {
    console.log(`  Ticket: ${t.code}`);
  }

  const ticket1 = db.prepare("SELECT * FROM tickets WHERE order_id = ?").get(order1.id);
  const verified1 = verificationService.verifyTicket(ticket1.id, '前台小王', 'scan', '正常入场');
  console.log(`[Ticket-1] Verified: status: ${verified1.status}`);

  console.log('\n--- Scenario 2: 未成团自动退款 ---');
  const group2 = groupService.createGroup({
    activity_id: activityId,
    leader_name: '王团长',
    leader_phone: '13800003333',
    area: 'B区标准',
    min_members: 5,
    payment_deadline: new Date(Date.now() - 1000).toISOString(),
    refund_rule: 'before_deadline'
  });
  console.log(`[Group-2] Created: ${group2.id}, status: forming`);

  const bSeats = allSeats.filter(s => s.area === 'B区标准');
  const order3 = orderService.createOrder({ group_id: group2.id, user_name: '王团长', user_phone: '13800003333', seat_id: bSeats[0].id });
  orderService.payOrder(order3.id, 'wechat');
  console.log(`[Order-3] Created & Paid: ${order3.id}`);

  const order4 = orderService.createOrder({ group_id: group2.id, user_name: '赵观众', user_phone: '13800004444', seat_id: bSeats[1].id });
  orderService.payOrder(order4.id, 'alipay');
  console.log(`[Order-4] Created & Paid: ${order4.id}`);

  const checked2 = groupService.checkAndTransition(group2.id);
  console.log(`[Group-2] After check (deadline passed, only 2/5): status: ${checked2.status}`);

  const refunds2 = groupService.processFailedGroupRefunds(group2.id);
  console.log(`[Group-2] Auto refunds: ${refunds2.length} refunds processed`);
  const g2final = groupService.getById(group2.id);
  console.log(`[Group-2] Final status: ${g2final.status}`);

  console.log('\n--- Scenario 3: 团长取消 + 部分支付失败 + 退款补偿 ---');
  const group3 = groupService.createGroup({
    activity_id: activityId,
    leader_name: '刘团长',
    leader_phone: '13800005555',
    area: 'C区经济',
    min_members: 3,
    payment_deadline: deadline,
    refund_rule: 'before_show'
  });
  console.log(`[Group-3] Created: ${group3.id}, status: forming`);

  const cSeats = allSeats.filter(s => s.area === 'C区经济');
  const order5 = orderService.createOrder({ group_id: group3.id, user_name: '刘团长', user_phone: '13800005555', seat_id: cSeats[0].id });
  orderService.payOrder(order5.id, 'wechat');
  console.log(`[Order-5] Created & Paid: ${order5.id}`);

  const order6 = orderService.createOrder({ group_id: group3.id, user_name: '孙观众', user_phone: '13800006666', seat_id: cSeats[1].id });
  console.log(`[Order-6] Created: ${order6.id}, status: pending_payment`);

  const timeout6 = orderService.paymentTimeout(order6.id);
  console.log(`[Order-6] Payment timeout: status: ${timeout6.status}`);

  const retry6 = orderService.retryPayment(order6.id);
  console.log(`[Order-6] Retry: status: ${retry6.status}`);
  orderService.payOrder(order6.id, 'wechat');
  console.log(`[Order-6] Paid on retry`);

  const order7 = orderService.createOrder({ group_id: group3.id, user_name: '周观众', user_phone: '13800007777', seat_id: cSeats[2].id });
  console.log(`[Order-7] Created: ${order7.id}`);

  const cancelled3 = groupService.cancelGroup(group3.id, '刘团长');
  console.log(`[Group-3] Leader cancelled: status: ${cancelled3.status}`);

  const o5 = orderService.getById(order5.id);
  const o7 = orderService.getById(order7.id);
  console.log(`[Order-5] After cancel: status: ${o5.status}`);
  console.log(`[Order-7] After cancel: status: ${o7.status}`);

  const refunds3 = groupService.processFailedGroupRefunds(group3.id);
  console.log(`[Group-3] Refunds processed: ${refunds3.length}`);

  console.log('\n--- Final State Summary ---');
  const groupStats = db.prepare("SELECT status, COUNT(*) as count FROM groups GROUP BY status").all();
  const orderStats = db.prepare("SELECT status, COUNT(*) as count FROM orders GROUP BY status").all();
  const ticketStats = db.prepare("SELECT status, COUNT(*) as count FROM tickets GROUP BY status").all();
  console.log('Groups:', groupStats.map(s => `${s.status}=${s.count}`).join(', '));
  console.log('Orders:', orderStats.map(s => `${s.status}=${s.count}`).join(', '));
  console.log('Tickets:', ticketStats.map(s => `${s.status}=${s.count}`).join(', '));

  console.log('\n=== Seed complete ===');
  db.save();
}

seed();
