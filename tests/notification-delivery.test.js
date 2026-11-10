import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateWatchZoneMatches,
  buildDeliveryIdempotencyKey,
  classifyDeliveryFailure,
} from '../api/_lib/notifications/delivery.js';

test('aggregates multiple matching watch zones into one recipient delivery', () => {
  const recipients = aggregateWatchZoneMatches([
    { user_id: 'user-1', subscription_id: 'sub-1', fcm_token: 'token-1', zone_id: 'zone-a', zone_name: 'Home' },
    { user_id: 'user-1', subscription_id: 'sub-1', fcm_token: 'token-1', zone_id: 'zone-b', zone_name: 'Work' },
    { user_id: 'user-1', subscription_id: 'sub-1', fcm_token: 'token-1', zone_id: 'zone-a', zone_name: 'Home' },
    { user_id: 'user-2', subscription_id: 'sub-2', fcm_token: 'token-2', zone_id: 'zone-c', zone_name: 'Family' },
  ]);

  assert.equal(recipients.length, 2);
  assert.deepEqual(recipients[0].zoneIds, ['zone-a', 'zone-b']);
  assert.deepEqual(recipients[0].zoneNames, ['Home', 'Work']);
});

test('delivery idempotency key is stable per event, notification type, revision and subscription', () => {
  const input = {
    provider: 'PHIVOLCS',
    providerEventId: 'ph-123',
    userId: 'user-1',
    subscriptionId: 'sub-1',
  };
  const key = buildDeliveryIdempotencyKey(input);
  assert.equal(key, buildDeliveryIdempotencyKey(input));
  assert.notEqual(key, buildDeliveryIdempotencyKey({ ...input, subscriptionId: 'sub-2' }));
  assert.notEqual(key, buildDeliveryIdempotencyKey({ ...input, qualifyingRevision: 2 }));
  assert.notEqual(key, buildDeliveryIdempotencyKey({ ...input, notificationType: 'significant_revision' }));
});

test('invalid recipient identity cannot produce an idempotency key', () => {
  assert.throws(() => buildDeliveryIdempotencyKey({ providerEventId: 'x', userId: '', subscriptionId: 's' }));
});

test('permanent invalid-token errors are not retried, transient failures are', () => {
  assert.equal(classifyDeliveryFailure('messaging/registration-token-not-registered'), 'permanent_failure');
  assert.equal(classifyDeliveryFailure('messaging/internal-error'), 'retryable_failure');
  assert.equal(classifyDeliveryFailure(null), 'retryable_failure');
});
