import db from './db.js';
import { initDatabase } from './db.js';
import { forceUnlockSeat, unlockSeatsByOrderId, listAllLocks } from './seatLock.js';
import * as orderService from './services/orderService.js';
import * as groupService from './services/groupService.js';

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`ASSERTION FAILED: ${message} — expected "${expected}", got "${actual}"`);
}

function clearAllLocks() {
  const locks = listAllLocks();
  for (const l of locks) {
    forceUnlockSeat(l.seatId);
  }
}

async function runTests() {
  await initDatabase();
  console.log('\n=== 座位锁回归验证测试 ===\n');

  const activity = db.prepare("SELECT * FROM activities LIMIT 1").get();
  if (!activity) {
    console.error('No activity found, run seed.js first');
    process.exit(1);
  }

  const availableSeat = db.prepare("SELECT * FROM seats WHERE activity_id = ? AND status = 'available' LIMIT 1").get(activity.id);
  if (!availableSeat) {
    console.error('No available seat found');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  try {
    console.log('--- Test 1: 同座位重复占用防护 ---');
    clearAllLocks();
    db.prepare("UPDATE seats SET status = 'available', locked_by = NULL, locked_at = NULL WHERE id = ?").run(availableSeat.id);

    const group1 = groupService.createGroup({
      activity_id: activity.id,
      leader_name: '测试团长1',
      leader_phone: '13900001111',
      area: availableSeat.area,
      min_members: 2,
      payment_deadline: new Date(Date.now() + 86400000).toISOString(),
      refund_rule: 'before_show'
    });

    const order1 = orderService.createOrder({
      group_id: group1.id,
      user_name: '用户A',
      user_phone: '13800001111',
      seat_id: availableSeat.id
    });

    const seatAfterOrder1 = db.prepare("SELECT * FROM seats WHERE id = ?").get(availableSeat.id);
    assertEqual(seatAfterOrder1.status, 'locked', 'Seat should be locked after order1');
    assertEqual(seatAfterOrder1.locked_by, order1.id, 'locked_by should match order1 ID');

    let duplicateError = null;
    try {
      orderService.createOrder({
        group_id: group1.id,
        user_name: '用户B',
        user_phone: '13800002222',
        seat_id: availableSeat.id
      });
    } catch (e) {
      duplicateError = e.message;
    }
    assert(duplicateError !== null, 'Duplicate seat order should throw error');
    assert(duplicateError.includes('occupied') || duplicateError.includes('locked'), `Error message should mention occupied/locked, got: "${duplicateError}"`);

    console.log('  ✅ 同座位重复占用被正确拒绝');
    passed++;
  } catch (e) {
    console.log(`  ❌ Test 1 失败: ${e.message}`);
    failed++;
  }

  try {
    console.log('\n--- Test 2: 支付超时后座位释放，可重新下单 ---');
    clearAllLocks();
    db.prepare("UPDATE seats SET status = 'available', locked_by = NULL, locked_at = NULL WHERE id = ?").run(availableSeat.id);
    db.prepare("DELETE FROM orders WHERE seat_id = ?").run(availableSeat.id);

    const group2 = groupService.createGroup({
      activity_id: activity.id,
      leader_name: '测试团长2',
      leader_phone: '13900002222',
      area: availableSeat.area,
      min_members: 2,
      payment_deadline: new Date(Date.now() + 86400000).toISOString(),
      refund_rule: 'before_show'
    });

    const order2 = orderService.createOrder({
      group_id: group2.id,
      user_name: '用户C',
      user_phone: '13800003333',
      seat_id: availableSeat.id
    });

    assertEqual(db.prepare("SELECT status FROM seats WHERE id = ?").get(availableSeat.id).status, 'locked', 'Seat should be locked');
    assertEqual(listAllLocks().filter(l => l.seatId === availableSeat.id).length, 1, 'Memory lock should exist');

    const timeoutResult = orderService.paymentTimeout(order2.id);
    assertEqual(timeoutResult.status, 'payment_failed', 'Order should be payment_failed after timeout');

    const seatAfterTimeout = db.prepare("SELECT * FROM seats WHERE id = ?").get(availableSeat.id);
    assertEqual(seatAfterTimeout.status, 'available', 'Seat should be available after timeout');
    assertEqual(seatAfterTimeout.locked_by, null, 'locked_by should be null after timeout');
    assertEqual(listAllLocks().filter(l => l.seatId === availableSeat.id).length, 0, 'Memory lock should be released after timeout');

    const order3 = orderService.createOrder({
      group_id: group2.id,
      user_name: '用户D',
      user_phone: '13800004444',
      seat_id: availableSeat.id
    });

    const seatAfterNewOrder = db.prepare("SELECT * FROM seats WHERE id = ?").get(availableSeat.id);
    assertEqual(seatAfterNewOrder.status, 'locked', 'Seat should be locked by new order');
    assertEqual(seatAfterNewOrder.locked_by, order3.id, 'locked_by should match new order ID');
    assertEqual(listAllLocks().filter(l => l.seatId === availableSeat.id).length, 1, 'New memory lock should exist');

    console.log('  ✅ 超时释放后座位可被新订单选择');
    passed++;
  } catch (e) {
    console.log(`  ❌ Test 2 失败: ${e.message}`);
    failed++;
  }

  try {
    console.log('\n--- Test 3: 支付超时 → 重试支付 → 座位重新锁定 ---');
    clearAllLocks();
    db.prepare("UPDATE seats SET status = 'available', locked_by = NULL, locked_at = NULL WHERE id = ?").run(availableSeat.id);
    db.prepare("DELETE FROM orders WHERE seat_id = ?").run(availableSeat.id);

    const group3 = groupService.createGroup({
      activity_id: activity.id,
      leader_name: '测试团长3',
      leader_phone: '13900003333',
      area: availableSeat.area,
      min_members: 2,
      payment_deadline: new Date(Date.now() + 86400000).toISOString(),
      refund_rule: 'before_show'
    });

    const order4 = orderService.createOrder({
      group_id: group3.id,
      user_name: '用户E',
      user_phone: '13800005555',
      seat_id: availableSeat.id
    });

    orderService.paymentTimeout(order4.id);
    assertEqual(db.prepare("SELECT status FROM seats WHERE id = ?").get(availableSeat.id).status, 'available', 'Seat should be available after timeout');
    assertEqual(listAllLocks().filter(l => l.seatId === availableSeat.id).length, 0, 'Memory lock should be gone after timeout');

    const retryResult = orderService.retryPayment(order4.id);
    assertEqual(retryResult.status, 'pending_payment', 'Order should be pending_payment after retry');

    const seatAfterRetry = db.prepare("SELECT * FROM seats WHERE id = ?").get(availableSeat.id);
    assertEqual(seatAfterRetry.status, 'locked', 'Seat should be re-locked after retry');
    assertEqual(seatAfterRetry.locked_by, order4.id, 'locked_by should be same order ID after retry');
    assertEqual(listAllLocks().filter(l => l.seatId === availableSeat.id && l.orderId === order4.id).length, 1, 'Memory lock should be re-created with same order ID');

    const paidOrder = orderService.payOrder(order4.id);
    assertEqual(paidOrder.status, 'paid', 'Order should be paid after payment');

    const seatAfterPay = db.prepare("SELECT status FROM seats WHERE id = ?").get(availableSeat.id);
    assertEqual(seatAfterPay.status, 'locked', 'Seat remains locked after payment (until ticket issued)');

    console.log('  ✅ 超时→重试→支付 完整流程座位状态正确');
    passed++;
  } catch (e) {
    console.log(`  ❌ Test 3 失败: ${e.message}`);
    failed++;
  }

  try {
    console.log('\n--- Test 4: 退款完成后座位释放，可重新下单 ---');
    clearAllLocks();
    db.prepare("UPDATE seats SET status = 'available', locked_by = NULL, locked_at = NULL WHERE id = ?").run(availableSeat.id);
    db.prepare("DELETE FROM orders WHERE seat_id = ?").run(availableSeat.id);

    const group4 = groupService.createGroup({
      activity_id: activity.id,
      leader_name: '测试团长4',
      leader_phone: '13900004444',
      area: availableSeat.area,
      min_members: 2,
      payment_deadline: new Date(Date.now() + 86400000).toISOString(),
      refund_rule: 'before_show'
    });

    const order5 = orderService.createOrder({
      group_id: group4.id,
      user_name: '用户F',
      user_phone: '13800006666',
      seat_id: availableSeat.id
    });

    orderService.payOrder(order5.id);
    assertEqual(db.prepare("SELECT status FROM seats WHERE id = ?").get(availableSeat.id).status, 'locked', 'Seat should be locked after payment');

    orderService.requestRefund(order5.id, 'test refund', new Date(Date.now() + 86400000).toISOString(), 'before_show');
    assertEqual(db.prepare("SELECT status FROM orders WHERE id = ?").get(order5.id).status, 'refunding', 'Order should be refunding');

    orderService.completeRefund(order5.id);
    const seatAfterRefund = db.prepare("SELECT * FROM seats WHERE id = ?").get(availableSeat.id);
    assertEqual(seatAfterRefund.status, 'available', 'Seat should be available after refund');
    assertEqual(seatAfterRefund.locked_by, null, 'locked_by should be null after refund');
    assertEqual(listAllLocks().filter(l => l.seatId === availableSeat.id).length, 0, 'Memory lock should be released after refund');

    const order6 = orderService.createOrder({
      group_id: group4.id,
      user_name: '用户G',
      user_phone: '13800007777',
      seat_id: availableSeat.id
    });
    assertEqual(db.prepare("SELECT status FROM seats WHERE id = ?").get(availableSeat.id).status, 'locked', 'Seat should be locked by new order after refund');
    assertEqual(db.prepare("SELECT locked_by FROM seats WHERE id = ?").get(availableSeat.id).locked_by, order6.id, 'locked_by should match new order ID');

    console.log('  ✅ 退款完成后座位释放，可重新下单');
    passed++;
  } catch (e) {
    console.log(`  ❌ Test 4 失败: ${e.message}`);
    failed++;
  }

  try {
    console.log('\n--- Test 5: 团长取消团购，payment_failed 订单座位释放 ---');
    clearAllLocks();
    db.prepare("UPDATE seats SET status = 'available', locked_by = NULL, locked_at = NULL WHERE id = ?").run(availableSeat.id);
    db.prepare("DELETE FROM orders WHERE seat_id = ?").run(availableSeat.id);

    const group5 = groupService.createGroup({
      activity_id: activity.id,
      leader_name: '测试团长5',
      leader_phone: '13900005555',
      area: availableSeat.area,
      min_members: 5,
      payment_deadline: new Date(Date.now() + 86400000).toISOString(),
      refund_rule: 'before_show'
    });

    const order7 = orderService.createOrder({
      group_id: group5.id,
      user_name: '用户H',
      user_phone: '13800008888',
      seat_id: availableSeat.id
    });

    orderService.paymentTimeout(order7.id);
    assertEqual(db.prepare("SELECT status FROM orders WHERE id = ?").get(order7.id).status, 'payment_failed', 'Order should be payment_failed');
    assertEqual(db.prepare("SELECT status FROM seats WHERE id = ?").get(availableSeat.id).status, 'available', 'Seat should be available after timeout');

    const paidSeat = db.prepare("SELECT * FROM seats WHERE activity_id = ? AND area = ? AND status = 'available' AND id != ? LIMIT 1").get(activity.id, availableSeat.area, availableSeat.id);
    if (paidSeat) {
      const order8 = orderService.createOrder({
        group_id: group5.id,
        user_name: '用户I',
        user_phone: '13800009999',
        seat_id: paidSeat.id
      });
      orderService.payOrder(order8.id);

      groupService.cancelGroup(group5.id, '测试团长5');

      const seat1After = db.prepare("SELECT * FROM seats WHERE id = ?").get(availableSeat.id);
      assertEqual(seat1After.status, 'available', 'Timeout seat should remain available after group cancel');

      const order7After = db.prepare("SELECT status FROM orders WHERE id = ?").get(order7.id);
      assertEqual(order7After.status, 'cancelled', 'Payment_failed order should be cancelled');

      const order8After = db.prepare("SELECT status FROM orders WHERE id = ?").get(order8.id);
      assertEqual(order8After.status, 'refunding', 'Paid order should be refunding after group cancel');

      const seat2AfterCancel = db.prepare("SELECT status FROM seats WHERE id = ?").get(paidSeat.id);
      assertEqual(seat2AfterCancel.status, 'locked', 'Paid seat should stay locked while refunding (not yet completed)');

      assertEqual(listAllLocks().filter(l => l.seatId === availableSeat.id).length, 0, 'Timeout seat memory lock should be released');

      orderService.completeRefund(order8.id);

      const seat2AfterRefund = db.prepare("SELECT * FROM seats WHERE id = ?").get(paidSeat.id);
      assertEqual(seat2AfterRefund.status, 'available', 'Paid seat should be available after refund completed');
      assertEqual(seat2AfterRefund.locked_by, null, 'locked_by should be null after refund completed');
      assertEqual(listAllLocks().filter(l => l.seatId === paidSeat.id).length, 0, 'Paid seat memory lock should be released after refund');

      console.log('  ✅ 团长取消后 payment_failed 订单座位释放正确');
      passed++;
    } else {
      console.log('  ⚠️ 跳过：没有足够的可用座位完成测试');
      passed++;
    }
  } catch (e) {
    console.log(`  ❌ Test 5 失败: ${e.message}`);
    failed++;
  }

  try {
    console.log('\n--- Test 6: 未成团自动退款后座位释放 ---');
    clearAllLocks();
    db.prepare("UPDATE seats SET status = 'available', locked_by = NULL, locked_at = NULL WHERE id = ?").run(availableSeat.id);
    db.prepare("DELETE FROM orders WHERE seat_id = ?").run(availableSeat.id);

    const group6 = groupService.createGroup({
      activity_id: activity.id,
      leader_name: '测试团长6',
      leader_phone: '13900006666',
      area: availableSeat.area,
      min_members: 99,
      payment_deadline: new Date(Date.now() - 1000).toISOString(),
      refund_rule: 'before_show'
    });

    const order9 = orderService.createOrder({
      group_id: group6.id,
      user_name: '用户J',
      user_phone: '13800010000',
      seat_id: availableSeat.id
    });
    orderService.payOrder(order9.id);
    assertEqual(db.prepare("SELECT status FROM seats WHERE id = ?").get(availableSeat.id).status, 'locked', 'Seat should be locked after payment');

    db.prepare("UPDATE groups SET status = 'failed' WHERE id = ?").run(group6.id);

    groupService.processFailedGroupRefunds(group6.id);

    const seatAfter = db.prepare("SELECT * FROM seats WHERE id = ?").get(availableSeat.id);
    assertEqual(seatAfter.status, 'available', 'Seat should be available after failed group refund');
    assertEqual(seatAfter.locked_by, null, 'locked_by should be null');
    assertEqual(listAllLocks().filter(l => l.seatId === availableSeat.id).length, 0, 'Memory lock should be released');

    const orderAfter = db.prepare("SELECT status FROM orders WHERE id = ?").get(order9.id);
    assertEqual(orderAfter.status, 'refunded', 'Order should be refunded');

    const group7 = groupService.createGroup({
      activity_id: activity.id,
      leader_name: '测试团长7',
      leader_phone: '13900007777',
      area: availableSeat.area,
      min_members: 2,
      payment_deadline: new Date(Date.now() + 86400000).toISOString(),
      refund_rule: 'before_show'
    });

    const newOrder = orderService.createOrder({
      group_id: group7.id,
      user_name: '用户K',
      user_phone: '13800011111',
      seat_id: availableSeat.id
    });
    assert(newOrder !== null, 'Should be able to create new order on released seat in new group');
    assertEqual(db.prepare("SELECT status FROM seats WHERE id = ?").get(availableSeat.id).status, 'locked', 'Seat should be locked by new order');

    console.log('  ✅ 未成团自动退款后座位释放，可重新下单');
    passed++;
  } catch (e) {
    console.log(`  ❌ Test 6 失败: ${e.message}`);
    failed++;
  }

  console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
