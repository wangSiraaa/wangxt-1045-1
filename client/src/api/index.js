const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  activities: {
    list: () => request('/activities'),
    get: (id) => request(`/activities/${id}`),
    create: (data) => request('/activities', { method: 'POST', body: data }),
    update: (id, data) => request(`/activities/${id}`, { method: 'PUT', body: data }),
    delete: (id) => request(`/activities/${id}`, { method: 'DELETE' }),
  },
  seats: {
    list: (activityId) => request(`/seats/activity/${activityId}`),
    listByArea: (activityId, area) => request(`/seats/activity/${activityId}/area/${area}`),
    generate: (data) => request('/seats/generate', { method: 'POST', body: data }),
  },
  groups: {
    list: () => request('/groups'),
    listByActivity: (activityId) => request(`/groups/activity/${activityId}`),
    get: (id) => request(`/groups/${id}`),
    create: (data) => request('/groups', { method: 'POST', body: data }),
    cancel: (id, operator) => request(`/groups/${id}/cancel`, { method: 'POST', body: { operator } }),
    check: (id) => request(`/groups/${id}/check`, { method: 'POST' }),
    issueTickets: (id) => request(`/groups/${id}/issue-tickets`, { method: 'POST' }),
    autoRefund: (id) => request(`/groups/${id}/auto-refund`, { method: 'POST' }),
    processFailed: () => request('/groups/process-failed', { method: 'POST' }),
  },
  orders: {
    list: () => request('/orders'),
    listByGroup: (groupId) => request(`/orders/group/${groupId}`),
    get: (id) => request(`/orders/${id}`),
    create: (data) => request('/orders', { method: 'POST', body: data }),
    pay: (id, method) => request(`/orders/${id}/pay`, { method: 'POST', body: { method } }),
    timeout: (id) => request(`/orders/${id}/timeout`, { method: 'POST' }),
    retry: (id) => request(`/orders/${id}/retry`, { method: 'POST' }),
    refund: (id, reason) => request(`/orders/${id}/refund`, { method: 'POST', body: { reason } }),
    completeRefund: (id) => request(`/orders/${id}/complete-refund`, { method: 'POST' }),
  },
  payments: {
    list: () => request('/payments'),
    listByOrder: (orderId) => request(`/payments/order/${orderId}`),
  },
  tickets: {
    list: () => request('/tickets'),
    listByActivity: (activityId) => request(`/tickets/activity/${activityId}`),
    get: (id) => request(`/tickets/${id}`),
    verify: (id, operator, method, note) => request(`/tickets/${id}/verify`, { method: 'POST', body: { operator, method, note } }),
    supplementary: (id, operator, note) => request(`/tickets/${id}/supplementary`, { method: 'POST', body: { operator, note } }),
  },
  verifications: {
    list: () => request('/verifications'),
    listByActivity: (activityId) => request(`/verifications/activity/${activityId}`),
  },
  reconciliations: {
    list: () => request('/reconciliations'),
    listByActivity: (activityId) => request(`/reconciliations/activity/${activityId}`),
    create: (data) => request('/reconciliations', { method: 'POST', body: data }),
    reconcile: (id, actualAmount, note) => request(`/reconciliations/${id}/reconcile`, { method: 'POST', body: { actual_amount: actualAmount, note } }),
  },
  stateLog: {
    list: (params) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/state-log${qs ? '?' + qs : ''}`);
    },
    stats: () => request('/state-log/stats'),
  },
  blockbuster: {
    list: () => request('/blockbuster'),
    create: (data) => request('/blockbuster', { method: 'POST', body: data }),
    reserveGuests: (groupId, data) => request(`/blockbuster/${groupId}/reserve-guests`, { method: 'POST', body: data }),
    issueGuestTicket: (data) => request('/blockbuster/issue-guest-ticket', { method: 'POST', body: data }),
    bulkOccupy: (groupId, data) => request(`/blockbuster/${groupId}/bulk-occupy`, { method: 'POST', body: data }),
    getStats: (activityId) => request(`/blockbuster/stats/activity/${activityId}`),
  },
  seatConflicts: {
    listByActivity: (activityId) => request(`/seat-conflicts/activity/${activityId}`),
    listByRow: (activityId, rowNum) => request(`/seat-conflicts/activity/${activityId}/row/${rowNum}`),
    resolve: (seatId, data) => request(`/seat-conflicts/${seatId}/resolve`, { method: 'POST', body: data }),
    batchResolve: (data) => request('/seat-conflicts/batch-resolve', { method: 'POST', body: data }),
  },
  manualAdjust: {
    listOrders: (params) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/manual-adjust/orders${qs ? '?' + qs : ''}`);
    },
    listBlockedSeats: (activityId) => request(`/manual-adjust/blocked-seats/activity/${activityId}`),
    adjust: (data) => request('/manual-adjust/adjust', { method: 'POST', body: data }),
    releaseBlockedSeat: (seatId, data) => request(`/manual-adjust/${seatId}/release`, { method: 'POST', body: data }),
    listBlockedReasons: () => request('/manual-adjust/blocked-reasons'),
  },
};
