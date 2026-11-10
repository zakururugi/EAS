/**
 * Pure notification-delivery helpers.
 * Delivery identity is recipient/subscription scoped, never watch-zone scoped.
 */

export function aggregateWatchZoneMatches(rows) {
  const recipients = new Map();

  for (const row of rows || []) {
    if (!row?.user_id || !row?.subscription_id || !row?.fcm_token || !row?.zone_id) continue;
    const key = `${row.user_id}:${row.subscription_id}`;
    let recipient = recipients.get(key);
    if (!recipient) {
      recipient = {
        userId: row.user_id,
        subscriptionId: row.subscription_id,
        token: row.fcm_token,
        zoneIds: new Set(),
        zoneNames: new Set(),
      };
      recipients.set(key, recipient);
    }
    recipient.zoneIds.add(row.zone_id);
    if (row.zone_name) recipient.zoneNames.add(row.zone_name);
  }

  return [...recipients.values()].map((recipient) => ({
    userId: recipient.userId,
    subscriptionId: recipient.subscriptionId,
    token: recipient.token,
    zoneIds: [...recipient.zoneIds],
    zoneNames: [...recipient.zoneNames],
  }));
}

export function buildDeliveryIdempotencyKey({
  provider = 'PHIVOLCS',
  providerEventId,
  userId,
  subscriptionId,
  notificationType = 'initial',
  qualifyingRevision = 1,
}) {
  for (const [name, value] of Object.entries({ providerEventId, userId, subscriptionId })) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new TypeError(`${name} is required to build a delivery idempotency key.`);
    }
  }
  if (!Number.isInteger(qualifyingRevision) || qualifyingRevision < 1) {
    throw new TypeError('qualifyingRevision must be a positive integer.');
  }
  return [
    provider.toLowerCase(),
    providerEventId,
    notificationType,
    String(qualifyingRevision),
    userId,
    subscriptionId,
  ].join(':');
}

const PERMANENT_FCM_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export function classifyDeliveryFailure(errorCode) {
  return PERMANENT_FCM_ERROR_CODES.has(errorCode)
    ? 'permanent_failure'
    : 'retryable_failure';
}
