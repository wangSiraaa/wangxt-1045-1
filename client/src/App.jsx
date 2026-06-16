import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api/index.js';

const ROLES = [
  { key: 'leader', label: '团长', icon: '👤' },
  { key: 'audience', label: '普通观众', icon: '🎭' },
  { key: 'front_desk', label: '剧场前台', icon: '🎫' },
  { key: 'finance', label: '财务审核', icon: '💰' },
  { key: 'admin', label: '运营管理', icon: '⚙️' },
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
  blocked: '#dc2626',
  reserved: '#8b5cf6',
  guest: '#ec4899',
  normal: '#3b82f6',
  blockbuster: '#f97316',
  needs_manual: '#ef4444',
};

const STATUS_LABELS = {
  forming: '成团中', grouped: '已成团', ticket_issued: '已出票',
  failed: '未成团', cancelled: '已取消', refunded: '已退款',
  pending_payment: '待支付', paid: '已支付', payment_failed: '支付失败',
  verified: '已核销', refunding: '退款中', issued: '已出票',
  available: '可选', locked: '已锁', sold: '已售',
  upcoming: '即将开演', on_sale: '售票中', ended: '已结束',
  blocked: '不可重卖', reserved: '预留席', guest: '嘉宾席',
  normal: '普通团购', blockbuster: '企业包场', needs_manual: '需人工调座',
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

function getSeatColor(seat, isSelected) {
  if (isSelected) return '#3b82f6';
  if (seat.block_reason) return STATUS_COLORS.blocked;
  if (seat.seat_type === 'reserved') return STATUS_COLORS.reserved;
  if (seat.seat_type === 'guest') return STATUS_COLORS.guest;
  if (seat.needs_manual) return STATUS_COLORS.needs_manual;
  if (seat.status === 'sold') return '#6b7280';
  if (seat.status === 'locked') return STATUS_COLORS.locked;
  return STATUS_COLORS.available;
}

function getSeatTitle(seat) {
  const parts = [`${seat.row_num}排${seat.col_num}座`, `¥${seat.price}`];
  if (seat.group_type) parts.push(STATUS_LABELS[seat.group_type] || seat.group_type);
  if (seat.seat_type && seat.seat_type !== 'normal') parts.push(STATUS_LABELS[seat.seat_type] || seat.seat_type);
  if (seat.block_reason) parts.push(`不可重卖: ${seat.block_reason}`);
  if (seat.needs_manual) parts.push('需人工调座');
  if (seat.order_status) parts.push(`订单: ${STATUS_LABELS[seat.order_status] || seat.order_status}`);
  if (seat.order_user) parts.push(`用户: ${seat.order_user}`);
  if (seat.guest_issued_by) parts.push(`发放人: ${seat.guest_issued_by}`);
  return parts.join(' | ');
}

function SeatMap({ seats, selectedSeatId, onSeatClick, area, showLegend = true }) {
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
            const bg = getSeatColor(seat, isSelected);
            const isClickable = seat.status === 'available' && !seat.block_reason;
            const hasBorder = seat.block_reason || seat.needs_manual;
            return (
              <div
                key={c}
                onClick={() => isClickable && onSeatClick && onSeatClick(seat)}
                style={{
                  width: 28, height: 28, borderRadius: '4px 4px 0 0', background: bg,
                  cursor: isClickable ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9,
                  transition: 'transform 0.1s', transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                  border: hasBorder ? '2px solid #000' : 'none',
                  boxShadow: seat.block_reason ? '0 0 8px rgba(220,38,38,0.6)' : seat.needs_manual ? '0 0 8px rgba(239,68,68,0.6)' : 'none',
                }}
                title={getSeatTitle(seat)}
              >
                {seat.col_num}
              </div>
            );
          })}
        </div>
      ))}
      {showLegend && (
        <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center', fontSize: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 14, background: STATUS_COLORS.available, borderRadius: 2 }}></span>可选</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 14, background: STATUS_COLORS.locked, borderRadius: 2 }}></span>已锁</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 14, background: STATUS_COLORS.sold, borderRadius: 2 }}></span>已售</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 14, background: STATUS_COLORS.reserved, borderRadius: 2 }}></span>预留</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 14, background: STATUS_COLORS.guest, borderRadius: 2 }}></span>嘉宾</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 14, background: STATUS_COLORS.blocked, borderRadius: 2, border: '2px solid #000' }}></span>不可重卖</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 14, background: STATUS_COLORS.blockbuster, borderRadius: 2 }}></span>包场</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 14, background: STATUS_COLORS.normal, borderRadius: 2 }}></span>团购</span>
        </div>
      )}
    </div>
  );
}

function BlockedSeatWarning({ seats, onRelease }) {
  const blockedSeats = seats.filter(s => s.block_reason);
  if (blockedSeats.length === 0) return null;

  return (
    <Card title={`⚠️ 不可重卖座位 (${blockedSeats.length})`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 250, overflowY: 'auto' }}>
        {blockedSeats.map(seat => (
          <div key={seat.id} style={{ padding: 10, background: '#fef2f2', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 600 }}>{seat.row_num}排{seat.col_num}座</span>
              <span style={{ marginLeft: 8, fontSize: 12, color: '#dc2626' }}>原因: {seat.block_reason}</span>
              {seat.original_order_id && (
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>原订单: {seat.original_order_id?.slice(0, 8)}...</div>
              )}
              {seat.adjacent_group_id && (
                <div style={{ fontSize: 12, color: '#8b5cf6', marginTop: 2 }}>连座组: {seat.adjacent_group_id?.slice(0, 8)}...</div>
              )}
            </div>
            {onRelease && (
              <Button small variant="warning" onClick={() => onRelease(seat.id)}>人工释放</Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ManualAdjustPanel({ orders, seats, onAdjust, onRefresh }) {
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [newSeatId, setNewSeatId] = useState(null);
  const [remark, setRemark] = useState('');

  const needsAdjustOrders = orders.filter(o => o.is_adjacent_break || o.needs_manual);
  const availableSeats = seats.filter(s => s.status === 'available' && !s.block_reason);

  const handleAdjust = async () => {
    if (!selectedOrder || !newSeatId) return;
    try {
      await api.manualAdjust.adjust({
        order_id: selectedOrder,
        new_seat_id: newSeatId,
        operator: '管理员',
        remark,
      });
      setSelectedOrder(null);
      setNewSeatId(null);
      setRemark('');
      onRefresh();
      alert('调座成功！');
    } catch (e) { alert(e.message); }
  };

  return (
    <Card title="🔧 人工调座">
      {needsAdjustOrders.length === 0 ? (
        <p style={{ color: '#9ca3af' }}>暂无需要人工调座的订单</p>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <h4 style={{ fontSize: 14, marginBottom: 8 }}>需要调座的订单:</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
              {needsAdjustOrders.map(o => (
                <div
                  key={o.id}
                  onClick={() => setSelectedOrder(o.id)}
                  style={{
                    padding: 10, borderRadius: 6, cursor: 'pointer',
                    background: selectedOrder === o.id ? '#eff6ff' : '#f9fafb',
                    border: selectedOrder === o.id ? '1px solid #3b82f6' : '1px solid #e5e7eb',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>{o.user_name}</span>
                    <Badge status={o.is_adjacent_break ? 'blocked' : 'needs_manual'} />
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    订单: {o.id?.slice(0, 10)}... | 金额: ¥{o.amount}
                  </div>
                  {o.is_adjacent_break && (
                    <div style={{ fontSize: 12, color: '#dc2626', marginTop: 2 }}>原因: 退票破坏连座关系，需重新安排座位</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {selectedOrder && (
            <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 8 }}>
              <h4 style={{ fontSize: 14, marginBottom: 8 }}>选择新座位:</h4>
              <select value={newSeatId || ''} onChange={e => setNewSeatId(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db', marginBottom: 8 }}>
                <option value="">请选择新座位</option>
                {availableSeats.map(s => (
                  <option key={s.id} value={s.id}>{s.row_num}排{s.col_num}座 - {s.area} - ¥{s.price}</option>
                ))}
              </select>
              <input
                placeholder="备注（可选）"
                value={remark}
                onChange={e => setRemark(e.target.value)}
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db', marginBottom: 8 }}
              />
              <Button variant="primary" onClick={handleAdjust} disabled={!newSeatId}>确认调座</Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function LeaderView({ activities, groups, orders, seats, onRefresh }) {
  const [groupType, setGroupType] = useState('normal');
  const [form, setForm] = useState({ activity_id: '', leader_name: '', leader_phone: '', area: '', min_members: 3, payment_deadline: '', refund_rule: 'before_show', type: 'normal', priority: 1, reserved_seats: 0, blockbuster_company: '' });
  const [selectedGroup, setSelectedGroup] = useState(null);

  const handleCreateGroup = async () => {
    try {
      const data = { ...form, type: groupType };
      if (groupType === 'blockbuster') {
        await api.blockbuster.create(data);
      } else {
        await api.groups.create(data);
      }
      onRefresh();
    } catch (e) { alert(e.message); }
  };

  const handleReserveGuests = async (groupId) => {
    const count = prompt('请输入预留嘉宾席数量:', '5');
    if (!count) return;
    try {
      await api.blockbuster.reserveGuests(groupId, { reserved_count: parseInt(count), operator: '团长' });
      onRefresh();
      alert('嘉宾席预留成功！');
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
      <Card title={groupType === 'blockbuster' ? '🏢 创建企业包场' : '🎤 创建团购'}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Button variant={groupType === 'normal' ? 'primary' : 'default'} onClick={() => setGroupType('normal')}>普通团购</Button>
          <Button variant={groupType === 'blockbuster' ? 'primary' : 'default'} onClick={() => setGroupType('blockbuster')}>企业包场</Button>
        </div>
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
          {groupType !== 'blockbuster' && (
            <input type="number" placeholder="最低成团人数" value={form.min_members} onChange={e => setForm({ ...form, min_members: +e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
          )}
          {groupType === 'blockbuster' && (
            <input placeholder="企业名称" value={form.blockbuster_company} onChange={e => setForm({ ...form, blockbuster_company: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
          )}
          {groupType === 'blockbuster' && (
            <input type="number" placeholder="预留嘉宾席数量" value={form.reserved_seats} onChange={e => setForm({ ...form, reserved_seats: +e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
          )}
          {groupType === 'blockbuster' && (
            <select value={form.priority} onChange={e => setForm({ ...form, priority: +e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}>
              <option value={1}>优先级 1（低）</option>
              <option value={2}>优先级 2（中）</option>
              <option value={3}>优先级 3（高）</option>
              <option value={5}>优先级 5（最高）</option>
            </select>
          )}
          <input type="datetime-local" value={form.payment_deadline} onChange={e => setForm({ ...form, payment_deadline: new Date(e.target.value).toISOString() })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
          <select value={form.refund_rule} onChange={e => setForm({ ...form, refund_rule: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}>
            <option value="before_show">演出前可退</option>
            <option value="before_deadline">截止前可退</option>
            <option value="none">不可退</option>
          </select>
        </div>
        <div style={{ marginTop: 12 }}>
          <Button variant="primary" onClick={handleCreateGroup} disabled={!form.activity_id || !form.leader_name || !form.area}>
            {groupType === 'blockbuster' ? '创建包场（自动成团）' : '创建团购'}
          </Button>
        </div>
      </Card>

      <Card title="📋 我的团购/包场">
        {groups.length === 0 ? <p style={{ color: '#9ca3af' }}>暂无团购</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups.map(g => (
              <div key={g.id} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: g.type === 'blockbuster' ? '#fff7ed' : '#fff' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {g.leader_name} - {g.area}
                    <Badge status={g.status} />
                    {g.type === 'blockbuster' && <Badge status="blockbuster" />}
                    {g.blockbuster_company && <span style={{ marginLeft: 8, fontSize: 12, color: '#c2410c' }}>【{g.blockbuster_company}】</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    {g.type === 'blockbuster' ? '企业包场（自动成团）' : `最低${g.min_members}人`}
                    {' | '}截止{g.payment_deadline?.slice(0, 16)}
                    {' | '}{g.refund_rule === 'before_show' ? '演出前可退' : g.refund_rule === 'before_deadline' ? '截止前可退' : '不可退'}
                    {g.reserved_seats > 0 && ` | 预留嘉宾席: ${g.reserved_seats}座`}
                    {typeof g.priority === 'number' && ` | 优先级: ${g.priority}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button small onClick={() => setSelectedGroup(g.id)}>查看订单</Button>
                  {g.type === 'blockbuster' && (g.status === 'forming' || g.status === 'grouped') && (
                    <Button small variant="primary" onClick={() => handleReserveGuests(g.id)}>预留嘉宾席</Button>
                  )}
                  {g.status === 'forming' && g.type !== 'blockbuster' && <Button small variant="warning" onClick={() => handleCheckGroup(g.id)}>检查成团</Button>}
                  {g.status === 'grouped' && <Button small variant="success" onClick={() => handleIssueTickets(g.id)}>批量出票</Button>}
                  {(g.status === 'forming' || g.status === 'grouped') && <Button small variant="danger" onClick={() => handleCancelGroup(g.id)}>取消</Button>}
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

function FrontDeskView({ tickets, verifications, seats, groups, onRefresh }) {
  const [ticketCode, setTicketCode] = useState('');
  const [guestForm, setGuestForm] = useState({ group_id: '', seat_id: '', guest_name: '', guest_phone: '', issued_by: '前台' });

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

  const handleIssueGuestTicket = async () => {
    if (!guestForm.group_id || !guestForm.seat_id || !guestForm.guest_name) {
      alert('请填写完整信息');
      return;
    }
    try {
      await api.blockbuster.issueGuestTicket(guestForm);
      setGuestForm({ group_id: '', seat_id: '', guest_name: '', guest_phone: '', issued_by: '前台' });
      onRefresh();
      alert('嘉宾票发放成功！');
    } catch (e) { alert(e.message); }
  };

  const handleReleaseBlockedSeat = async (seatId) => {
    const remark = prompt('请输入释放备注:', '人工确认可重卖');
    if (!remark) return;
    try {
      await api.manualAdjust.releaseBlockedSeat(seatId, { operator: '前台', remark });
      onRefresh();
      alert('座位已释放');
    } catch (e) { alert(e.message); }
  };

  const blockbusterGroups = groups.filter(g => g.type === 'blockbuster' && (g.status === 'grouped' || g.status === 'forming'));
  const reservedSeats = seats.filter(s => s.seat_type === 'reserved' && s.status === 'available');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="🎟️ 发放嘉宾票">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <select value={guestForm.group_id} onChange={e => setGuestForm({ ...guestForm, group_id: e.target.value, seat_id: '' })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}>
            <option value="">选择包场活动</option>
            {blockbusterGroups.map(g => (
              <option key={g.id} value={g.id}>{g.blockbuster_company || g.leader_name} - {g.area}</option>
            ))}
          </select>
          <select value={guestForm.seat_id} onChange={e => setGuestForm({ ...guestForm, seat_id: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}>
            <option value="">选择预留座位</option>
            {reservedSeats.filter(s => !guestForm.group_id || s.group_id === guestForm.group_id).map(s => (
              <option key={s.id} value={s.id}>{s.row_num}排{s.col_num}座 - {s.area} - ¥{s.price}</option>
            ))}
          </select>
          <input placeholder="嘉宾姓名" value={guestForm.guest_name} onChange={e => setGuestForm({ ...guestForm, guest_name: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
          <input placeholder="嘉宾电话" value={guestForm.guest_phone} onChange={e => setGuestForm({ ...guestForm, guest_phone: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
        </div>
        <div style={{ marginTop: 12 }}>
          <Button variant="primary" onClick={handleIssueGuestTicket} disabled={!guestForm.group_id || !guestForm.seat_id || !guestForm.guest_name}>发放嘉宾票</Button>
        </div>
      </Card>

      <BlockedSeatWarning seats={seats} onRelease={handleReleaseBlockedSeat} />

      <Card title="🎫 核销验票">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input placeholder="输入票券编号搜索" value={ticketCode} onChange={e => setTicketCode(e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tickets.filter(t => !ticketCode || t.code?.toLowerCase().includes(ticketCode.toLowerCase())).slice(0, 20).map(t => (
            <div key={t.id} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{t.code}</span> <Badge status={t.status} />
                {t.seat_type === 'guest' && <Badge status="guest" />}
                <div style={{ fontSize: 12, color: '#6b7280' }}>出票: {t.issued_at?.slice(0, 16)} {t.verified_at && `| 核销: ${t.verified_at?.slice(0, 16)}`}</div>
                {t.guest_name && <div style={{ fontSize: 12, color: '#ec4899' }}>嘉宾: {t.guest_name}</div>}
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

function AdminView({ activities, seats, orders, groups, onRefresh }) {
  const [selectedActivity, setSelectedActivity] = useState(activities[0]?.id || '');
  const [selectedArea, setSelectedArea] = useState('A区贵宾');
  const [conflicts, setConflicts] = useState([]);
  const [blockedReasons, setBlockedReasons] = useState([]);

  useEffect(() => {
    if (selectedActivity) {
      api.seatConflicts.listByActivity(selectedActivity).then(setConflicts).catch(console.error);
      api.manualAdjust.listBlockedReasons().then(setBlockedReasons).catch(console.error);
    }
  }, [selectedActivity]);

  const handleBatchResolve = async () => {
    if (!conflicts.length) return;
    if (!confirm(`确定批量解决 ${conflicts.length} 个座位冲突？这将按优先级自动驱逐低优先级订单。`)) return;
    try {
      const result = await api.seatConflicts.batchResolve({ activity_id: selectedActivity, operator: '管理员' });
      alert(`批量解决完成：成功 ${result.success_count} 个，失败 ${result.fail_count} 个`);
      onRefresh();
    } catch (e) { alert(e.message); }
  };

  const handleEvictOrder = async (seatId, reason) => {
    if (!confirm(`确定驱逐该座位上的订单？原因：${reason}`)) return;
    try {
      await api.seatConflicts.resolve(seatId, { action: 'evict', reason, operator: '管理员' });
      onRefresh();
      alert('驱逐成功，已自动发起退款');
    } catch (e) { alert(e.message); }
  };

  const handleReleaseBlockedSeat = async (seatId) => {
    const remark = prompt('请输入释放备注:', '人工确认可重卖');
    if (!remark) return;
    try {
      await api.manualAdjust.releaseBlockedSeat(seatId, { operator: '管理员', remark });
      onRefresh();
      alert('座位已释放');
    } catch (e) { alert(e.message); }
  };

  const activity = activities.find(a => a.id === selectedActivity);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="🎯 活动选择">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={selectedActivity} onChange={e => setSelectedActivity(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db', minWidth: 200 }}>
            {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={selectedArea} onChange={e => setSelectedArea(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}>
            <option value="A区贵宾">A区贵宾</option>
            <option value="B区标准">B区标准</option>
            <option value="C区经济">C区经济</option>
          </select>
        </div>
      </Card>

      {activity && (
        <Card title="🗺️ 座位状态总览">
          <SeatMap seats={seats} area={selectedArea} showLegend={true} />
        </Card>
      )}

      <Card title={`⚔️ 座位冲突 (${conflicts.length})`}>
        {conflicts.length === 0 ? (
          <p style={{ color: '#9ca3af' }}>暂无座位冲突</p>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <Button variant="danger" onClick={handleBatchResolve}>批量解决（按优先级驱逐）</Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
              {conflicts.map(c => (
                <div key={c.seat_id} style={{ padding: 12, background: '#fef2f2', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    {c.row_num}排{c.col_num}座 - {c.area}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div style={{ padding: 8, background: '#fff', borderRadius: 4 }}>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>现有订单</div>
                      <div><Badge status={c.existing_group_type} /> <Badge status={c.existing_order_status} /></div>
                      <div style={{ fontSize: 12 }}>用户: {c.existing_user || '未知'}</div>
                      <div style={{ fontSize: 12 }}>优先级: {c.existing_priority}</div>
                    </div>
                    <div style={{ padding: 8, background: '#fff', borderRadius: 4 }}>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>请求方</div>
                      <div><Badge status={c.requesting_group_type} /> 优先级: {c.requesting_priority}</div>
                      <div style={{ fontSize: 12, color: '#ef4444' }}>{c.conflict_reason}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button small variant="danger" onClick={() => handleEvictOrder(c.seat_id, c.conflict_reason)}>驱逐现有订单</Button>
                    <Button small variant="default" onClick={() => handleEvictOrder(c.seat_id, '拒绝请求')}>拒绝请求</Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <ManualAdjustPanel orders={orders} seats={seats} onRefresh={onRefresh} />

      <BlockedSeatWarning seats={seats} onRelease={handleReleaseBlockedSeat} />

      <Card title="📋 不可重卖原因统计">
        {blockedReasons.length === 0 ? (
          <p style={{ color: '#9ca3af' }}>暂无统计数据</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {blockedReasons.map(r => (
              <div key={r.reason} style={{ display: 'flex', justifyContent: 'space-between', padding: 8, background: '#f9fafb', borderRadius: 4 }}>
                <span>{r.reason}</span>
                <span style={{ fontWeight: 600, color: r.count > 0 ? '#dc2626' : '#6b7280' }}>{r.count} 个座位</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="🏢 包场与团购统计">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div style={{ padding: 16, background: '#eff6ff', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>{groups.filter(g => g.type === 'normal').length}</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>普通团购</div>
          </div>
          <div style={{ padding: 16, background: '#fff7ed', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#f97316' }}>{groups.filter(g => g.type === 'blockbuster').length}</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>企业包场</div>
          </div>
          <div style={{ padding: 16, background: '#fef2f2', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>{seats.filter(s => s.block_reason).length}</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>不可重卖座位</div>
          </div>
        </div>
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
          {role === 'front_desk' && <FrontDeskView tickets={tickets} verifications={verifications} seats={seats} groups={groups} onRefresh={refresh} />}
          {role === 'finance' && <FinanceView reconciliations={reconciliations} orders={orders} onRefresh={refresh} />}
          {role === 'admin' && <AdminView activities={activities} seats={seats} orders={orders} groups={groups} onRefresh={refresh} />}
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
