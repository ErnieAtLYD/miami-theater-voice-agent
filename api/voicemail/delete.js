// api/voicemail/delete.js
// Deletes a voicemail from the system
import { Redis } from '@upstash/redis';
import crypto from 'crypto';

/**
 * Deletes a voicemail by ID
 * @param {*} req
 * @param {*} res
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate staff access
  const authHeader = req.headers.authorization || '';
  const dashboardSecret = process.env.STAFF_DASHBOARD_SECRET;

  if (!dashboardSecret) {
    console.error('STAFF_DASHBOARD_SECRET not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Extract token from "Bearer <token>" format
  const providedToken = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  // Use constant-time comparison to prevent timing attacks
  const expectedBuffer = Buffer.from(dashboardSecret);
  const providedBuffer = Buffer.from(providedToken);

  if (expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
    return res.status(401).json({ error: 'Unauthorized - Invalid credentials' });
  }

  try {
    // Get voicemail ID from query parameter
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Missing voicemail ID' });
    }

    // Initialize Redis
    const redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    // Check if voicemail exists
    const voicemailData = await redis.get(`voicemail:${id}`);

    if (!voicemailData) {
      return res.status(404).json({ error: 'Voicemail not found' });
    }

    // Delete from sorted set and individual record
    await Promise.all([
      redis.zrem('voicemails:index', id),
      redis.del(`voicemail:${id}`)
    ]);

    console.log(`Voicemail ${id} deleted successfully`);

    return res.status(200).json({
      success: true,
      message: 'Voicemail deleted successfully',
      id
    });

  } catch (error) {
    console.error('Voicemail deletion error:', error);
    return res.status(500).json({ error: 'Failed to delete voicemail' });
  }
}
