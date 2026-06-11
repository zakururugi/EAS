/**
 * POST /api/push/subscribe
 *
 * Stores a user's FCM push subscription in the database.
 * Creates a user entry if one doesn't exist for the given device_id.
 *
 * Body (JSON):
 *   { device_id: string, fcm_token: string, device_info?: string }
 */

import { query } from '../_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const { device_id, fcm_token, device_info } = req.body || {};

    // Validate required fields
    if (!device_id || typeof device_id !== 'string') {
      res.status(400).json({ error: 'device_id is required and must be a string' });
      return;
    }

    if (!fcm_token || typeof fcm_token !== 'string') {
      res.status(400).json({ error: 'fcm_token is required and must be a string' });
      return;
    }

    if (fcm_token.length < 20) {
      res.status(400).json({ error: 'fcm_token appears to be invalid (too short)' });
      return;
    }

    // Create user if not exists
    const userResult = await query(
      `SELECT create_user_if_not_exists($1) as user_id`,
      [device_id]
    );
    const userId = userResult.rows[0]?.user_id;

    if (!userId) {
      throw new Error('Failed to create or find user');
    }

    // Upsert push subscription (insert or update on conflict by token)
    const subResult = await query(
      `INSERT INTO push_subscriptions (user_id, fcm_token, device_info)
       VALUES ($1, $2, $3)
       ON CONFLICT (fcm_token)
       DO UPDATE SET user_id = $1, device_info = COALESCE($3, push_subscriptions.device_info)
       RETURNING id`,
      [userId, fcm_token, device_info || null]
    );

    const subscriptionId = subResult.rows[0]?.id;

    console.log(`[push/subscribe] Subscribed token for device ${device_id} (sub_id: ${subscriptionId})`);

    res.status(200).json({
      success: true,
      message: 'Push subscription saved successfully',
      subscription_id: subscriptionId,
      user_id: userId,
    });
  } catch (err) {
    console.error('[push/subscribe] Error:', err.message);
    res.status(500).json({
      error: 'Failed to save push subscription',
      details: err.message,
    });
  }
}