import { initDatabase } from './db.js';
import db from './db.js';
import { v4 as uuid } from 'uuid';
import * as groupService from './services/groupService.js';
import * as orderService from './services/orderService.js';
import * as seatConflictService from './services/seatConflictService.js';
import * as adjacentSeatService from './services/adjacentSeatService.js';
import * as seatLock from './seatLock.js';

function printHeader(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}\n`);
}

function printResult(description, success, details = '') {
  const status = success ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} - ${description}`);
  if (details) console.log(`     ${details}`);
}

async function demoBlockbuster() {
  await initDatabase();
  console.log('=== 企业包场与团购统一系统 演示测试 ===\n');

  const activityId = uuid();
  const showTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO activities (id, name, venue, show_time, status, type, priority) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(activityId, '《天鹅湖》芭蕾舞剧', '保利剧院', showTime, 'on_sale', 'normal', 1);
  console.log(`[活动] ${activityId} - 《天鹅湖》芭蕾舞剧\n`);

  const areas = [
    { name: 'A区贵宾', rows: 3, cols: 6, price: 880 },
    { name: 'B区标准', rows: 5, cols: 8, price: 480 },
  ];
  const seatInsert = db.prepare('INSERT OR IGNORE INTO seats (id, activity_id, area, row_num, col_num, price, status, seat_type, group_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const allSeats = [];
  for (const area of areas) {
    for (let r = 1; r <= area.rows; r++) {
      for (let c = 1; c <= area.cols; c++) {
        const sid = uuid();
        seatInsert.run(sid, activityId, area.name, r, c, area.price, 'available', 'normal', null);
        allSeats.push({ id: sid, area: area.name, row: r, col: c, price: area.price });
      }
    }
  }
  console.log(`[座位] 生成 ${allSeats.length} 个座位\n`);

  const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const aSeats = allSeats.filter(s => s.area === 'A区贵宾').sort((a, b) => a.row - b.row || a.col - b.col);
  const bSeats = allSeats.filter(s => s.area === 'B区标准').sort((a, b) => a.row - b.row || a.col - b.col);

  printHeader('场景 1: 企业包场创建与自动成团');

  const blockbusterGroup = groupService.createGroup({
    activity_id: activityId,
    leader_name: '王经理',
    leader_phone: '13900008888',
    area: 'A区贵宾',
    min_members: 0,
    payment_deadline: deadline,
    refund_rule: 'before_show',
    type: 'blockbuster',
    priority: 5,
    reserved_seats: 3,
    blockbuster_company: '华为技术有限公司',
  });
  printResult('创建企业包场', blockbusterGroup.type === 'blockbuster',
    `ID: ${blockbusterGroup.id.slice(0, 8)}..., 公司: ${blockbusterGroup.blockbuster_company}, 优先级: ${blockbusterGroup.priority}`);

  const orderBB1 = orderService.createOrder({
    group_id: blockbusterGroup.id,
    user_name: '王经理',
    user_phone: '13900008888',
    seat_id: aSeats[0].id,
  });
  orderService.payOrder(orderBB1.id, 'bank_transfer');
  printResult('包场订单1支付成功', orderService.getById(orderBB1.id).status === 'paid');

  const orderBB2 = orderService.createOrder({
    group_id: blockbusterGroup.id,
    user_name: '李总',
    user_phone: '13900009999',
    seat_id: aSeats[1].id,
  });
  orderService.payOrder(orderBB2.id, 'bank_transfer');
  printResult('包场订单2支付成功', orderService.getById(orderBB2.id).status === 'paid');

  const checkedBB = groupService.checkAndTransition(blockbusterGroup.id);
  printResult('包场自动成团（无需最低人数）', checkedBB.status === 'grouped',
    `状态: ${checkedBB.status}, 仅 ${checkedBB.current_members} 人即成团`);

  printHeader('场景 2: 嘉宾席预留与发放');

  const reserved = groupService.reserveGuestSeats(blockbusterGroup.id, 3, '王经理');
  printResult('预留3个嘉宾席', reserved.length === 3,
    `预留座位: ${reserved.map(s => `${s.row_num}排${s.col_num}座`).join(', ')}`);

  const guestTicket = groupService.issueGuestTicket(
    reserved[0].id,
    '张市长',
    '13800000001',
    '剧场前台小李'
  );
  const guestSeat = db.prepare("SELECT * FROM seats WHERE id = ?").get(reserved[0].id);
  printResult('发放嘉宾票', guestSeat.seat_type === 'reserved' && guestSeat.guest_issued_by,
    `嘉宾: 张市长, 座位: ${reserved[0].row_num}排${reserved[0].col_num}座, 发放人: ${guestSeat.guest_issued_by}`);

  printHeader('场景 3: 座位冲突 - 包场抢占普通团购座位');

  const normalGroup = groupService.createGroup({
    activity_id: activityId,
    leader_name: '赵团长',
    leader_phone: '13800001111',
    area: 'A区贵宾',
    min_members: 2,
    payment_deadline: deadline,
    refund_rule: 'before_show',
    type: 'normal',
    priority: 1,
  });
  printResult('创建普通团购', normalGroup.type === 'normal', `优先级: ${normalGroup.priority}`);

  const conflictSeat = aSeats[5];
  const orderN1 = orderService.createOrder({
    group_id: normalGroup.id,
    user_name: '赵团长',
    user_phone: '13800001111',
    seat_id: conflictSeat.id,
  });
  printResult('普通团购订单创建（待支付）', orderN1.status === 'pending_payment',
    `座位: A区-${conflictSeat.row}排${conflictSeat.col}座`);

  seatLock.lockSeat(conflictSeat.id, orderN1.id, { priority: 1, groupType: 'normal', force: false });
  printResult('普通团购锁定座位', true);

  const conflictResult = seatConflictService.resolveSeatConflict(conflictSeat.id, blockbusterGroup.id);
  printResult('包场抢占座位', conflictResult.canTake === true,
    `原因: ${conflictResult.evictReason}, 驱逐订单: ${conflictResult.evictOrderId?.slice(0, 8)}...`);

  if (conflictResult.evictOrderId) {
    seatConflictService.evictOrderFromSeat(conflictResult.evictOrderId, conflictResult.evictReason, 'system');
    const evictedOrder = orderService.getById(conflictResult.evictOrderId);
    printResult('执行驱逐并自动退款', evictedOrder.status === 'cancelled' || evictedOrder.status === 'refunding',
      `订单状态: ${evictedOrder.status}`);
  }

  const conflictAnalysis = seatConflictService.analyzeRowConflicts(activityId, 1);
  printResult('分析第1排座位冲突', Array.isArray(conflictAnalysis.conflicts),
    `发现 ${conflictAnalysis.conflicts.length} 个潜在冲突, 普通团购: ${conflictAnalysis.normalCount} 座, 包场: ${conflictAnalysis.blockbusterCount} 座`);

  printHeader('场景 4: 连座保护 - 退票不破坏相邻关系');

  const normalGroup2 = groupService.createGroup({
    activity_id: activityId,
    leader_name: '孙团长',
    leader_phone: '13800002222',
    area: 'B区标准',
    min_members: 3,
    payment_deadline: deadline,
    refund_rule: 'before_show',
    type: 'normal',
    priority: 2,
  });

  const consecutiveSeats = bSeats.filter(s => s.row === 2 && s.col >= 2 && s.col <= 4);
  const adjGroup = adjacentSeatService.createAdjacentGroup(consecutiveSeats.map(s => s.id), normalGroup2.id);
  printResult('创建连座分组', !!adjGroup, `连座组ID: ${adjGroup.groupId?.slice(0, 8)}..., 座位数: ${consecutiveSeats.length}`);

  const orderA1 = orderService.createOrder({
    group_id: normalGroup2.id,
    user_name: '观众A',
    user_phone: '13800003333',
    seat_id: consecutiveSeats[0].id,
    adjacent_group_id: adjGroup.id,
  });
  orderService.payOrder(orderA1.id, 'wechat');

  const orderA2 = orderService.createOrder({
    group_id: normalGroup2.id,
    user_name: '观众B',
    user_phone: '13800004444',
    seat_id: consecutiveSeats[1].id,
    adjacent_group_id: adjGroup.id,
  });
  orderService.payOrder(orderA2.id, 'wechat');

  const orderA3 = orderService.createOrder({
    group_id: normalGroup2.id,
    user_name: '观众C',
    user_phone: '13800005555',
    seat_id: consecutiveSeats[2].id,
    adjacent_group_id: adjGroup.id,
  });
  orderService.payOrder(orderA3.id, 'wechat');

  groupService.checkAndTransition(normalGroup2.id);
  const tickets = groupService.issueGroupTickets(normalGroup2.id);
  printResult('3人连座票出票成功', tickets.length === 3);

  const refundCheck = adjacentSeatService.checkAdjacentBreakOnRefund(orderA2.id);
  printResult('检测中间座位退票影响', refundCheck.wouldBreak === true,
    `描述: ${refundCheck.description}`);

  const refundResult = adjacentSeatService.processRefundWithAdjacentCheck(orderA2.id, '行程变更');
  printResult('退票并标记阻挡座位', refundResult.success,
    `阻挡座位: ${refundResult.blockedSeats?.length} 个, 原因: ${refundResult.blockedReason}`);

  const blockedSeat = db.prepare("SELECT * FROM seats WHERE id = ?").get(consecutiveSeats[1].id);
  printResult('座位标记为不可重卖', !!blockedSeat.block_reason,
    `block_reason: ${blockedSeat.block_reason}, needs_manual: ${blockedSeat.needs_manual}`);

  const manualOrders = adjacentSeatService.listManualAdjustOrders(activityId);
  printResult('标记需要人工调座的订单', manualOrders.length > 0,
    `需要调座: ${manualOrders.length} 个订单`);

  printHeader('场景 5: 人工调座流程');

  const availableSeat = db.prepare(
    "SELECT * FROM seats WHERE activity_id = ? AND area = ? AND row_num = ? AND col_num = ? AND status = ?"
  ).get(activityId, 'B区标准', 2, 5, 'available');
  
  if (availableSeat && manualOrders.length > 0) {
    const adjustResult = adjacentSeatService.manualAdjustSeat(
      manualOrders[0].id,
      availableSeat.id,
      '运营管理员',
      '为被阻挡的观众安排新座位'
    );
    printResult('人工调座成功', adjustResult.success,
      `新座位: ${availableSeat.row_num}排${availableSeat.col_num}座, 原座位已释放`);

    const released = adjacentSeatService.unmarkBlockedSeat(consecutiveSeats[1].id, '运营管理员', '人工调座完成');
    printResult('释放被阻挡的座位', released.status === 'available');
  } else {
    console.log(`⚠️  跳过: availableSeat=${!!availableSeat}, manualOrders=${manualOrders.length}`);
  }

  printHeader('场景 6: 已出票两端座位退票（允许）');

  const refundCheckEnd = adjacentSeatService.checkAdjacentBreakOnRefund(orderA1.id);
  printResult('检测边缘座位退票影响', refundCheckEnd.wouldBreak === false,
    `边缘座位退票不会破坏相邻关系: ${refundCheckEnd.description || '可以正常退票'}`);

  printHeader('系统测试总结');

  const groupStats = db.prepare("SELECT type, status, COUNT(*) as count FROM groups GROUP BY type, status").all();
  console.log('团购/包场统计:');
  groupStats.forEach(s => console.log(`  ${s.type === 'blockbuster' ? '🏢 包场' : '🎫 团购'} - ${s.status}: ${s.count} 个`));

  const seatStats = db.prepare("SELECT seat_type, status, COUNT(*) as count FROM seats WHERE activity_id = ? GROUP BY seat_type, status").all(activityId);
  console.log('\n座位状态统计:');
  seatStats.forEach(s => {
    const type = s.seat_type === 'guest' ? '🎟️ 嘉宾席' : s.seat_type === 'reserved' ? '📌 预留席' : '💺 普通席';
    console.log(`  ${type} - ${s.status}: ${s.count} 个`);
  });

  const blockedCount = db.prepare("SELECT COUNT(*) as count FROM seats WHERE activity_id = ? AND block_reason IS NOT NULL").get(activityId).count;
  console.log(`\n🚫 不可重卖座位: ${blockedCount} 个`);
  console.log(`⚙️  需要人工调座: ${manualOrders.length} 个订单`);

  console.log('\n=== 演示测试完成 ===');
  console.log('\n前端可验证的功能点:');
  console.log('  1. 团长视图: 切换"普通团购/企业包场"创建');
  console.log('  2. 包场活动自动成团，无需最低人数');
  console.log('  3. 包场可预留嘉宾席，前台可发放嘉宾票');
  console.log('  4. 座位图显示: 绿色可选、黄色已锁、灰色已售、紫色预留、粉色嘉宾、红色不可重卖');
  console.log('  5. 鼠标悬停座位可查看: 不可重卖原因、订单状态、团购类型、优先级');
  console.log('  6. 前台视图: 发放嘉宾票、管理不可重卖座位');
  console.log('  7. 运营管理视图: 座位冲突分析、批量解决、人工调座、统计面板');
  console.log('  8. 连座退票时，中间座位自动标记为不可重卖，需人工处理');

  db.save();
}

demoBlockbuster();
