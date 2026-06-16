import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api/index.js';

const ROLES = [
  { key: 'leader', label: '团长', icon: '👤' },
  { key: 'audience', label: '普通观众', icon: '🎭' },
  { key: 'front_desk', label: '剧场前台', icon: '🎫' },
  { key: 'finance', label: '财务审核', icon: '💰' },
];

const STATUS_COLORS = {
  forming: '#f59e0b',
  grouped: '#3b82f6',
  ticket_issued: '#10b981',
  failed: '#ef4444',
  cancelled: '#9ca3af',
  refunded: '#8b5cf6',
  pending_payment: '#f59e0b',
  paid: '#3b82f6',
  payment_failed: '#ef4444',
  verified: '#059669',
  refunding: '#8b5cf6',
  issued: '#3b82f6',
  available: '#10b981',
  locked: '#f59e0b',
  sold: '#6b7280',
};

const STATUS_LABELS = {
  forming: '成团中', grouped: '已成团', ticket_issued: '已出票',
  failed: '未成团', cancelled: '已取消', refunded: '已退款',
  pending_payment: '待支付', paid: '已支付', payment_failed: '支付失败',
  verified: '已核销', refunding: '退款中', issued: '已出票',
  available: '可选', locked: '已锁', sold: '已售',
  upcoming: '即将开演', on_sale: '售票中', ended: '已结束',
};

function Badge({ status }) {
  const color = STATUS_COLORS[status] || '#6b7280';
  const label = STATUS_LABELS[status] || status;
  return <span style={{ background: color, color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 12, whiteSpace: 'nowrap' }}>{label}</span>;
}

function Card({ title, children, style }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: 20, ...style }}>
      {title && <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#1f2937' }}>{title}</h3>}
      {children}
    </div>
  );
}

function Button({ children, onClick, disabled, variant, small }) {
  const base = { padding: small ? '4px 12px' : '8px 18px', border: 'none', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: small ? 12 : 14, fontWeight: 500, opacity: disabled ? 0.5 : 1 };
  const styles = {
    primary: { ...base, background: '#3b82f6', color: '#fff' },
    danger: { ...base, background: '#ef4444', color: '#fff' },
    success: { ...base, background: '#10b981', color: '#fff' },
    warning: { ...base, background: '#f59e0b', color: '#fff' },
    default: { ...base, background: '#f3f4f6', color: '#374151' },
  };
  return <button onClick={onClick} disabled={disabled} style={styles[variant] || styles.default}>{children}</button>;
}

function StateDashboard({ stats }) {
  if (!stats) return null;
  return (
    <Card title="📊 状态总览">
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {['groups', 'orders', 'tickets'].map(entity => (
          <div key={entity} style={{ flex: 1, minWidth: 200 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, color: '#6b7280' }}>
              {entity === 'groups' ? '团购' : entity === 'orders' ? '订单' : '票券'}
            </h4>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(stats[entity] || []).map(s => (
                <span key={s.status} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Badge status={s.status} /> <span style={{ fontSize: 13, fontWeight: 600 }}>{s.count}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StateTimeline({ logs }) {
  if (!logs.length) return <p style={{ color: '#9ca3af', fontSize: 13 }}>暂无状态变更记录</p>;
  return (
    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
      {logs.map(log => (
        <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
          <span style={{ color: '#9ca3af', minWidth: 140 }}>{log.created_at?.replace('T', ' ').slice(0, 19)}</span>
          <span style={{ fontWeight: 600 }}>{STATUS_LABELS[log.entity_type] || log.entity_type}</span>
          {log.from_state && <Badge status={log.from_state} />}
          <span style={{ color: '#6b7280' }}>→</span>
          <Badge status={log.to_state} />
          <span style={{ color: '#6b7280' }}>{log.operator}</span>
          {log.reason && <span style={{ color: '#9ca3af', fontSize: 12 }}>({log.reason})</span>}
        </div>
      ))}
    </div>
  );
}

function SeatMap({ seats, selectedSeatId, onSeatClick, area }) {
  const filtered = seats.filter(s => s.area === area);
  const maxCol = Math.max(...filtered.map(s => s.col_num), 0);
  const maxRow = Math.max(...filtered.map(s => s.row_num), 0);
  const seatMap = {};
  filtered.forEach(s => { seatMap[`${s.row_num}-${s.col_num}`] = s; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ background: '#1f2937', color: '#fff', padding: '4px 24px', borderRadius: '4px 4px 0 0', fontSize: 12, marginBottom: 8 }}>舞台</div>
      {Array.from({ length: maxRow }, (_, r) => (
        <div key={r} style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: maxCol }, (_, c) => {
            const seat = seatMap[`${r + 1}-${c + 1}`];
            if (!seat) return <div key={c} style={{ width: 28, height: 28 }} />;
            const isSelected = selectedSeatId === seat.id;
            const bg = seat.status === 'sold' ? '#9ca3af' : seat.status === 'locked' ? '#f59e0b' : isSelected ? '#3b82f6' : '#10b981';
            return (
              <div
                key={c}
                onClick={() => seat.status === 'available' && onSeatClick(seat)}
                style={{
                  width: 28, height: 28, borderRadius: '4px 4px 0 0', background: bg, cursor: seat.status === 'available' ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9,
                  transition: 'transform 0.1s', transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                }}
                title={`${seat.row_num}排${seat.col_num}座 ¥${seat.price}`}
              >
                {seat.col_num}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function LeaderView({ activities, groups, orders, seats, onRefresh }) {
  const [form, setForm] = useState({ activity_id: '', leader_name: '', leader_phone: '', area: '', min_members: 3, payment_deadline: '', refund_rule: 'before_show' });
  const [selectedGroup, setSelectedGroup] = useState(null);

  const handleCreateGroup = async () => {
    try {
      await api.groups.create(form);
      onRefresh();
    } catch (e) { alert(e.message); }
  };

  const handleCancelGroup = async (id) => {
    try { await api.groups.cancel(id, 'leader'); onRefresh(); } catch (e) { alert(e.message); }
  };

  const handleCheckGroup = async (id) => {
    try { await api.groups.check(id); onRefresh(); } catch (e) { alert(e.message); }
  };

  const handleIssueTickets = async (id) => {
    try {
      const tickets = await api.groups.issueTickets(id);
      alert(`成功出票 ${tickets.length} 张！`);
      onRefresh();
    } catch (e) { alert(e.message); }
  };

  const groupOrders = selectedGroup ? orders.filter(o => o.group_id === selectedGroup) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="🎤 创建团购">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <select value={form.activity_id} onChange={e => setForm({ ...form, activity_id: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}>
            <option value="">选择演出</option>
            {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input placeholder="团长姓名" value={form.leader_name} onChange={e => setForm({ ...form, leader_name: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
          <input placeholder="联系电话" value={form.leader_phone} onChange={e => setForm({ ...form, leader_phone: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
          <select value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}>
            <option value="">选择区域</option>
            <option value="A区贵宾">A区贵宾 ¥880</option>
            <option value="B区标准">B区标准 ¥480</option>
            <option value="C区经济">C区经济 ¥280</option>
          </select>
          <input type="number" placeholder="最低成团人数" value={form.min_members} onChange={e => setForm({ ...form, min_members: +e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
          <input type="datetime-local" value={form.payment_deadline} onChange={e => setForm({ ...form, payment_deadline: new Date(e.target.value).toISOString() })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
          <select value={form.refund_rule} onChange={e => setForm({ ...form, refund_rule: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}>
            <option value="before_show">演出前可退</option>
            <option value="before_deadline">截止前可退</option>
            <option value="none">不可退</option>
          </select>
        </div>
        <div style={{ marginTop: 12 }}>
          <Button variant="primary" onClick={handleCreateGroup} disabled={!form.activity_id || !form.leader_name || !form.area}>创建团购</Button>
        </div>
      </Card>

      <Card title="📋 我的团购">
        {groups.length === 0 ? <p style={{ color: '#9ca3af' }}>暂无团购</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups.map(g => (
              <div key={g.id} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{g.leader_name} - {g.area} <Badge status={g.status} /></div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    最低{g.min_members}人 | 截止{g.payment_deadline?.slice(0, 16)} | {g.refund_rule === 'before_show' ? '演出前可退' : g.refund_rule === 'before_deadline' ? '截止前可退' : '不可退'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Button small onClick={() => setSelectedGroup(g.id)}>查看订单</Button>
                  {g.status === 'forming' && <Button small variant="warning" onClick={() => handleCheckGroup(g.id)}>检查成团</Button>}
                  {g.status === 'grouped' && <Button small variant="success" onClick={() => handleIssueTickets(g.id)}>批量出票</Button>}
                  {(g.status === 'forming' || g.status === 'grouped') && <Button small variant="danger" onClick={() => handleCancelGroup(g.id)}>取消团购</Button>}
                  {(g.status === 'failed' || g.status === 'cancelled') && <Button small variant="primary" onClick={async () => { try { await api.groups.autoRefund(g.id); onRefresh(); } catch(e) { alert(e.message); } }}>自动退款</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {selectedGroup && (
        <Card title={`📝 订单列表 (${groupOrders.length})`}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f9fafb' }}>
              <th style={{ padding: 8, textAlign: 'left' }}>用户</th><th style={{ padding: 8 }}>金额</th><th style={{ padding: 8 }}>状态</th><th style={{ padding: 8 }}>时间</th>
            </tr></thead>
            <tbody>
              {groupOrders.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8 }}>{o.user_name}</td>
                  <td style={{ padding: 8, textAlign: 'center' }}>¥{o.amount}</td>
                  <td style={{ padding: 8, textAlign: 'center' }}><Badge status={o.status} /></td>
                  <td style={{ padding: 8, textAlign: 'center', color: '#6b7280' }}>{o.created_at?.slice(0, 16)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function AudienceView({ groups, orders, seats, onRefresh }) {
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');

  const handleJoinGroup = async () => {
    if (!selectedGroup || !userName) return;
    try {
      await api.orders.create({
        group_id: selectedGroup,
        user_name: userName,
        user_phone: userPhone,
        seat_id: selectedSeat?.id || null,
      });
      setSelectedSeat(null);
      onRefresh();
    } catch (e) { alert(e.message); }
  };

  const handlePay = async (orderId) => {
    try { await api.orders.pay(orderId, 'online'); onRefresh(); } catch (e) { alert(e.message); }
  };

  const handleTimeout = async (orderId) => {
    try { await api.orders.timeout(orderId); onRefresh(); } catch (e) { alert(e.message); }
  };

  const handleRetry = async (orderId) => {
    try { await api.orders.retry(orderId); onRefresh(); } catch (e) { alert(e.message); }
  };

  const handleRefund = async (orderId) => {
    try { await api.orders.refund(orderId, '观众申请退款'); onRefresh(); } catch (e) { alert(e.message); }
  };

  const myOrders = orders.filter(o => o.user_name === userName || !userName).slice(0, 20);
  const activeGroup = groups.find(g => g.id === selectedGroup);
  const groupSeats = activeGroup ? seats.filter(s => s.area === activeGroup.area) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="🎭 加入团购">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <input placeholder="您的姓名" value={userName} onChange={e => setUserName(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
          <input placeholder="手机号" value={userPhone} onChange={e => setUserPhone(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
          <select value={selectedGroup || ''} onChange={e => { setSelectedGroup(e.target.value); setSelectedSeat(null); }} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}>
            <option value="">选择团购</option>
            {groups.filter(g => g.status === 'forming' || g.status === 'grouped').map(g => (
              <option key={g.id} value={g.id}>{g.leader_name} - {g.area} ({STATUS_LABELS[g.status]})</option>
            ))}
          </select>
        </div>

        {selectedGroup && groupSeats.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ fontSize: 14, marginBottom: 8 }}>选座 (绿色=可选, 黄色=已锁, 灰色=已售)</h4>
            <SeatMap seats={seats} selectedSeatId={selectedSeat?.id} onSeatClick={setSelectedSeat} area={activeGroup?.area} />
            {selectedSeat && <p style={{ fontSize: 13, marginTop: 8 }}>已选: {selectedSeat.row_num}排{selectedSeat.col_num}座 ¥{selectedSeat.price}</p>}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <Button variant="primary" onClick={handleJoinGroup} disabled={!selectedGroup || !userName}>加入团购{selectedSeat ? '（含选座）' : ''}</Button>
        </div>
      </Card>

      <Card title="📦 我的订单">
        {myOrders.length === 0 ? <p style={{ color: '#9ca3af' }}>暂无订单</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myOrders.map(o => (
              <div key={o.id} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{o.user_name}</span> ¥{o.amount} <Badge status={o.status} />
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{o.created_at?.slice(0, 16)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {o.status === 'pending_payment' && <Button small variant="success" onClick={() => handlePay(o.id)}>支付</Button>}
                  {o.status === 'pending_payment' && <Button small variant="danger" onClick={() => handleTimeout(o.id)}>超时</Button>}
                  {o.status === 'payment_failed' && <Button small variant="warning" onClick={() => handleRetry(o.id)}>重试</Button>}
                  {(o.status === 'paid' || o.status === 'ticket_issued') && <Button small variant="default" onClick={() => handleRefund(o.id)}>退票</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function FrontDeskView({ tickets, verifications, onRefresh }) {
  const [ticketCode, setTicketCode] = useState('');

  const handleVerify = async (ticketId) => {
    try {
      await api.tickets.verify(ticketId, '前台', 'scan', '');
      onRefresh();
    } catch (e) { alert(e.message); }
  };

  const handleSupplementary = async (ticketId) => {
    try {
      await api.tickets.supplementary(ticketId, '前台', '异常补录');
      onRefresh();
    } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="🎫 核销验票">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input placeholder="输入票券编号搜索" value={ticketCode} onChange={e => setTicketCode(e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tickets.filter(t => !ticketCode || t.code?.toLowerCase().includes(ticketCode.toLowerCase())).slice(0, 20).map(t => (
            <div key={t.id} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{t.code}</span> <Badge status={t.status} />
                <div style={{ fontSize: 12, color: '#6b7280' }}>出票: {t.issued_at?.slice(0, 16)} {t.verified_at && `| 核销: ${t.verified_at?.slice(0, 16)}`}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {t.status === 'issued' && <Button small variant="success" onClick={() => handleVerify(t.id)}>扫码核销</Button>}
                {t.status === 'issued' && <Button small variant="warning" onClick={() => handleSupplementary(t.id)}>异常补录</Button>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="📋 核销记录">
        {verifications.length === 0 ? <p style={{ color: '#9ca3af' }}>暂无记录</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f9fafb' }}>
              <th style={{ padding: 8, textAlign: 'left' }}>票券ID</th><th style={{ padding: 8 }}>操作人</th><th style={{ padding: 8 }}>方式</th><th style={{ padding: 8 }}>结果</th><th style={{ padding: 8 }}>时间</th>
            </tr></thead>
            <tbody>
              {verifications.map(v => (
                <tr key={v.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 12 }}>{v.ticket_id?.slice(0, 8)}...</td>
                  <td style={{ padding: 8, textAlign: 'center' }}>{v.operator}</td>
                  <td style={{ padding: 8, textAlign: 'center' }}>{v.method === 'scan' ? '扫码' : '手动'}</td>
                  <td style={{ padding: 8, textAlign: 'center' }}><Badge status={v.status === 'success' ? 'verified' : 'failed'} /></td>
                  <td style={{ padding: 8, textAlign: 'center', color: '#6b7280' }}>{v.verified_at?.slice(0, 16)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function FinanceView({ reconciliations, orders, onRefresh }) {
  const [reconForm, setReconForm] = useState({ activity_id: '', period_start: '', period_end: '' });

  const handleCreateRecon = async () => {
    try {
      await api.reconciliations.create(reconForm);
      onRefresh();
    } catch (e) { alert(e.message); }
  };

  const handleReconcile = async (id, actualAmount) => {
    try {
      await api.reconciliations.reconcile(id, actualAmount, '');
      onRefresh();
    } catch (e) { alert(e.message); }
  };

  const refundingOrders = orders.filter(o => o.status === 'refunding');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="💰 待处理退款">
        {refundingOrders.length === 0 ? <p style={{ color: '#9ca3af' }}>暂无待处理退款</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {refundingOrders.map(o => (
              <div key={o.id} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><span style={{ fontWeight: 600 }}>{o.user_name}</span> ¥{o.amount} <Badge status={o.status} /></div>
                <Button small variant="success" onClick={async () => { try { await api.orders.completeRefund(o.id); onRefresh(); } catch(e) { alert(e.message); } }}>确认退款</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="📊 对账管理">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          <input type="text" placeholder="活动ID" value={reconForm.activity_id} onChange={e => setReconForm({ ...reconForm, activity_id: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
          <input type="datetime-local" value={reconForm.period_start} onChange={e => setReconForm({ ...reconForm, period_start: new Date(e.target.value).toISOString() })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
          <input type="datetime-local" value={reconForm.period_end} onChange={e => setReconForm({ ...reconForm, period_end: new Date(e.target.value).toISOString() })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
        </div>
        <Button variant="primary" onClick={handleCreateRecon} disabled={!reconForm.activity_id}>生成对账单</Button>

        {reconciliations.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 16 }}>
            <thead><tr style={{ background: '#f9fafb' }}>
              <th style={{ padding: 8 }}>应收</th><th style={{ padding: 8 }}>实收</th><th style={{ padding: 8 }}>差异</th><th style={{ padding: 8 }}>状态</th><th style={{ padding: 8 }}>操作</th>
            </tr></thead>
            <tbody>
              {reconciliations.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8, textAlign: 'center' }}>¥{r.expected_amount}</td>
                  <td style={{ padding: 8, textAlign: 'center' }}>¥{r.actual_amount}</td>
                  <td style={{ padding: 8, textAlign: 'center', color: r.difference !== 0 ? '#ef4444' : '#10b981' }}>¥{r.difference}</td>
                  <td style={{ padding: 8, textAlign: 'center' }}><Badge status={r.status} /></td>
                  <td style={{ padding: 8, textAlign: 'center' }}>
                    {r.status === 'pending' && <Button small variant="success" onClick={() => handleReconcile(r.id, r.expected_amount)}>确认</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

export default function App() {
  const [role, setRole] = useState('leader');
  const [activities, setActivities] = useState([]);
  const [groups, setGroups] = useState([]);
  const [orders, setOrders] = useState([]);
  const [seats, setSeats] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [verifications, setVerifications] = useState([]);
  const [reconciliations, setReconciliations] = useState([]);
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const [a, g, o, t, v, r, st, l] = await Promise.all([
        api.activities.list(),
        api.groups.list(),
        api.orders.list(),
        api.tickets.list(),
        api.verifications.list(),
        api.reconciliations.list(),
        api.stateLog.stats(),
        api.stateLog.list({ limit: '50' }),
      ]);
      setActivities(a);
      setGroups(g);
      setOrders(o);
      if (a.length > 0) {
        const allSeats = await api.seats.list(a[0].id);
        setSeats(allSeats);
      }
      setTickets(t);
      setVerifications(v);
      setReconciliations(r);
      setStats(st);
      setLogs(l);
    } catch (e) {
      console.error('Refresh error:', e);
    }
  }, []);

  useEffect(() => { refresh(); }, []);
  useEffect(() => { const t = setInterval(refresh, 5000); return () => clearInterval(t); }, [refresh]);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <header style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)', color: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🎭 文化演出票务团购系统</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.8 }}>统一状态机 · 团长/观众/前台/财务 四角色协同</p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {ROLES.map(r => (
            <button key={r.key} onClick={() => setRole(r.key)} style={{
              padding: '6px 16px', border: 'none', borderRadius: 8, cursor: 'pointer',
              background: role === r.key ? '#fff' : 'rgba(255,255,255,0.15)',
              color: role === r.key ? '#1e3a5f' : '#fff',
              fontWeight: role === r.key ? 600 : 400, fontSize: 13,
            }}>
              {r.icon} {r.label}
            </button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>
        <StateDashboard stats={stats} />

        <div style={{ marginTop: 16 }}>
          {role === 'leader' && <LeaderView activities={activities} groups={groups} orders={orders} seats={seats} onRefresh={refresh} />}
          {role === 'audience' && <AudienceView groups={groups} orders={orders} seats={seats} onRefresh={refresh} />}
          {role === 'front_desk' && <FrontDeskView tickets={tickets} verifications={verifications} onRefresh={refresh} />}
          {role === 'finance' && <FinanceView reconciliations={reconciliations} orders={orders} onRefresh={refresh} />}
        </div>

        <div style={{ marginTop: 16 }}>
          <Card title="📜 状态变更时间线">
            <StateTimeline logs={logs} />
          </Card>
        </div>
      </main>
    </div>
  );
}
