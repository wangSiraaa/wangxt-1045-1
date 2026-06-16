const GROUP_TRANSITIONS = {
  forming: {
    cancel: { to: 'cancelled', operator: 'leader' },
    check_formed: { to: 'grouped', operator: 'system' },
    deadline_passed: { to: 'failed', operator: 'system' }
  },
  grouped: {
    issue_tickets: { to: 'ticket_issued', operator: 'system' },
    cancel: { to: 'cancelled', operator: 'leader' }
  },
  ticket_issued: {},
  failed: {
    auto_refund: { to: 'refunded', operator: 'system' }
  },
  cancelled: {
    auto_refund: { to: 'refunded', operator: 'system' }
  },
  refunded: {}
};

const ORDER_TRANSITIONS = {
  pending_payment: {
    pay: { to: 'paid', operator: 'audience' },
    timeout: { to: 'payment_failed', operator: 'system' },
    cancel_by_group: { to: 'cancelled', operator: 'leader' }
  },
  paid: {
    issue_ticket: { to: 'ticket_issued', operator: 'system' },
    refund: { to: 'refunding', operator: 'system' },
    cancel_by_group: { to: 'refunding', operator: 'leader' }
  },
  payment_failed: {
    retry: { to: 'pending_payment', operator: 'audience' },
    cancel: { to: 'cancelled', operator: 'audience' }
  },
  ticket_issued: {
    verify: { to: 'verified', operator: 'front_desk' },
    refund_before_show: { to: 'refunding', operator: 'audience' }
  },
  verified: {},
  refunding: {
    refund_complete: { to: 'refunded', operator: 'finance' }
  },
  refunded: {},
  cancelled: {}
};

function validateTransition(transitionMap, currentState, action) {
  const stateTransitions = transitionMap[currentState];
  if (!stateTransitions) {
    return { valid: false, error: `No transitions from state: ${currentState}` };
  }
  const transition = stateTransitions[action];
  if (!transition) {
    return { valid: false, error: `Action '${action}' not allowed from state: ${currentState}` };
  }
  return { valid: true, nextState: transition.to, operator: transition.operator };
}

export function validateGroupTransition(currentState, action) {
  return validateTransition(GROUP_TRANSITIONS, currentState, action);
}

export function validateOrderTransition(currentState, action) {
  return validateTransition(ORDER_TRANSITIONS, currentState, action);
}

export function canRefund(orderStatus, refundRule, showTime) {
  if (orderStatus === 'verified') return false;
  if (orderStatus === 'refunded' || orderStatus === 'cancelled') return false;
  if (refundRule === 'none') return false;
  if (refundRule === 'before_show' && new Date() >= new Date(showTime)) return false;
  if (refundRule === 'before_deadline') return true;
  return true;
}

export { GROUP_TRANSITIONS, ORDER_TRANSITIONS };
