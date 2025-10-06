// api/monitor/voicemail-health.js
// Health monitoring endpoint for voicemail system

import { Redis } from '@upstash/redis';

/**
 * Voicemail system health monitoring
 * Returns metrics and alerts for monitoring systems
 * @param {*} req   Request object
 * @param {*} res   Response object
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const health = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    checks: {},
    metrics: {},
    alerts: []
  };

  // Check 1: Environment Configuration
  try {
    const requiredVars = {
      'TWILIO_ACCOUNT_SID': process.env.TWILIO_ACCOUNT_SID,
      'TWILIO_AUTH_TOKEN': process.env.TWILIO_AUTH_TOKEN,
      'KV_REST_API_URL': process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      'KV_REST_API_TOKEN': process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
      'RESEND_API_KEY': process.env.RESEND_API_KEY,
      'STAFF_EMAIL': process.env.STAFF_EMAIL
    };

    const missing = Object.entries(requiredVars)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      health.checks.environment = {
        status: 'degraded',
        missing: missing
      };
      health.alerts.push({
        level: 'warning',
        message: `Missing environment variables: ${missing.join(', ')}`,
        impact: 'Some features may not work correctly'
      });
      health.status = 'degraded';
    } else {
      health.checks.environment = {
        status: 'healthy',
        message: 'All required environment variables are set'
      };
    }
  } catch (error) {
    health.checks.environment = {
      status: 'failed',
      error: error.message
    };
    health.status = 'unhealthy';
  }

  // Check 2: Redis Connectivity
  try {
    const redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    const startTime = Date.now();
    const testKey = `health_check:${Date.now()}`;
    await redis.set(testKey, 'test', { ex: 10 });
    const testValue = await redis.get(testKey);
    await redis.del(testKey);
    const latency = Date.now() - startTime;

    health.checks.redis = {
      status: 'healthy',
      latency: `${latency}ms`,
      message: 'Redis connection successful'
    };

    health.metrics.redisLatency = latency;

    if (latency > 1000) {
      health.alerts.push({
        level: 'warning',
        message: `High Redis latency: ${latency}ms`,
        impact: 'May cause slow voicemail processing'
      });
    }
  } catch (error) {
    health.checks.redis = {
      status: 'failed',
      error: error.message
    };
    health.status = 'unhealthy';
    health.alerts.push({
      level: 'critical',
      message: 'Redis connection failed',
      impact: 'Voicemails cannot be stored or retrieved'
    });
  }

  // Check 3: Recent Voicemail Activity
  try {
    const redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    const totalVoicemails = await redis.zcard('voicemails:index') || 0;

    // Get recent voicemails (last 24 hours)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentVoicemails = await redis.zcount('voicemails:index', oneDayAgo, Date.now()) || 0;

    health.checks.voicemailActivity = {
      status: 'healthy',
      totalVoicemails,
      last24Hours: recentVoicemails
    };

    health.metrics.totalVoicemails = totalVoicemails;
    health.metrics.voicemailsLast24h = recentVoicemails;

    // Check for unlistened voicemails
    const voicemailIds = await redis.zrange('voicemails:index', 0, -1);
    let unlistenedCount = 0;

    if (voicemailIds && voicemailIds.length > 0) {
      for (const id of voicemailIds.slice(-10)) { // Check last 10
        const data = await redis.get(`voicemail:${id}`);
        if (data) {
          const voicemail = typeof data === 'string' ? JSON.parse(data) : data;
          if (!voicemail.listened) {
            unlistenedCount++;
          }
        }
      }
    }

    health.metrics.unlistenedVoicemails = unlistenedCount;

    if (unlistenedCount > 5) {
      health.alerts.push({
        level: 'info',
        message: `${unlistenedCount} unlistened voicemails`,
        impact: 'Staff should check voicemail dashboard'
      });
    }

  } catch (error) {
    health.checks.voicemailActivity = {
      status: 'degraded',
      error: error.message
    };
  }

  // Check 4: Integration Architecture
  health.checks.architecture = {
    status: 'warning',
    message: 'Using deprecated webhook tool configuration',
    recommendation: 'Migrate to transfer_to_number system tool',
    documentation: 'See elevenlabs/voicemail-transfer-tool-config.json'
  };

  health.alerts.push({
    level: 'warning',
    message: 'Integration using incorrect architecture',
    impact: 'Voicemail feature may not work. ElevenLabs webhook tools cannot process TwiML.',
    action: 'Migrate to transfer_to_number system tool configuration'
  });

  // Overall health determination
  const criticalAlerts = health.alerts.filter(a => a.level === 'critical');
  if (criticalAlerts.length > 0) {
    health.status = 'unhealthy';
  } else if (health.alerts.length > 0) {
    health.status = 'degraded';
  }

  // Set appropriate HTTP status
  const httpStatus = health.status === 'unhealthy' ? 503 : 200;

  return res.status(httpStatus).json(health);
}
