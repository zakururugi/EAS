/**
 * DELETE /api/push/unsubscribe
 *
 * Removes a user's FCM push subscription from the database.
 *
 * Body (JSON):
 *   { fcm_token: string }
 *
 * Alternatively, pass fcm_token as query param:
 *   DELETE /api/push/unsubscribe?fcm_token=...
 */

import { query } from '../_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Accept both DELETE and POST (for clients that can't send DELETE with body)
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use DELETE or POST.' });
    return;
  }

  try {
    // Get fcm_token from body or query params
    const fcm_token = req.body?.fcm_token || req.query?.fcm_token;

    if (!fcm_token || typeof fcm_token !== 'string') {
      res.status(400).json({ error: 'fcm_token is required' });
      return;
    }

    const result = await query(
      `DELETE FROM push_subscriptions WHERE fcm_token = $1 RETURNING id, user_id`,
      [fcm_token]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        message: 'No subscription found for the given token',
      });
      return;
    }

    const deleted = result.rows[0];

    console.log(`[push/unsubscribe] Unsubscribed token (sub_id: ${deleted.id})`);

    res.status(200).json({
      success: true,
      message: 'Push subscription removed successfully',
      subscription_id: deleted.id,
    });
  } catch (err) {
    console.error('[push/unsubscribe] Error:', err.message);
    res.status(500).json({
      error: 'Failed to remove push subscription',
      details: err.message,
    });
  }
}