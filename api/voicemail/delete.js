// api/voicemail/delete.js
// Deletes a voicemail from the system
import { createRedisClient } from '../utils/redis-client.js';
import { validateStaffAuth } from '../utils/auth-staff.js';

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

  try {
    // Initialize Redis (needed for both rate limiting and data operations)
    const redis = createRedisClient();

    // Authenticate staff access with rate limiting
    const authValidation = await validateStaffAuth(req, redis);
    if (!authValidation.isValid) {
      return res.status(authValidation.statusCode).json({ error: authValidation.error });
    }

    // Get voicemail ID from query parameter
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Missing voicemail ID' });
    }

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
