// api/voicemail/list.js
// Retrieves list of voicemails for staff access
import { Redis } from '@upstash/redis';

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} unsafe - The unsafe string to escape
 * @returns {string} The HTML-escaped string
 */
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Retrieves and displays voicemail list for staff
 * @param {*} req
 * @param {*} res
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate staff access
  const authHeader = req.headers.authorization;
  const expectedToken = `Bearer ${process.env.STAFF_DASHBOARD_SECRET}`;

  if (!process.env.STAFF_DASHBOARD_SECRET) {
    console.error('STAFF_DASHBOARD_SECRET not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!authHeader || authHeader !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized - Invalid credentials' });
  }

  try {
    // Initialize Redis
    const redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    // Get query parameters
    const { limit = 50, offset = 0, unlistened_only } = req.query;

    // Get voicemail IDs from sorted set (most recent first)
    const voicemailIds = await redis.zrange('voicemails:index', offset, offset + parseInt(limit) - 1, {
      rev: true // Reverse order (newest first)
    });

    if (!voicemailIds || voicemailIds.length === 0) {
      return res.status(200).json({
        success: true,
        voicemails: [],
        total: 0,
        message: 'No voicemails found'
      });
    }

    // Fetch all voicemail records
    const voicemails = [];
    for (const id of voicemailIds) {
      try {
        const voicemailData = await redis.get(`voicemail:${id}`);
        if (voicemailData) {
          const voicemail = typeof voicemailData === 'string'
            ? JSON.parse(voicemailData)
            : voicemailData;

          // Filter if unlistened_only is requested
          if (unlistened_only === 'true' && voicemail.listened) {
            continue;
          }

          voicemails.push(voicemail);
        }
      } catch (error) {
        console.error(`Error fetching voicemail ${id}:`, error);
      }
    }

    // Get total count
    const total = await redis.zcard('voicemails:index');

    // Generate HTML view if accessed from browser
    if (req.headers.accept?.includes('text/html')) {
      const html = generateHTMLView(voicemails, total);
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(html);
    }

    // Return JSON response
    return res.status(200).json({
      success: true,
      voicemails,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      count: voicemails.length
    });

  } catch (error) {
    console.error('Voicemail list error:', error);
    return res.status(500).json({ error: 'Failed to retrieve voicemails' });
  }
}

/**
 * Generates an HTML view of the voicemails
 * @param {Object[]} voicemails - The voicemails to display
 * @param {number} total - The total number of voicemails
 * @returns {string} The HTML view
 */
function generateHTMLView(voicemails, total) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>O Cinema Voicemail Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 { margin-bottom: 10px; font-size: 32px; }
    .header p { opacity: 0.9; }
    .stats {
      display: flex;
      justify-content: space-around;
      padding: 20px;
      background: #f8f9fa;
      border-bottom: 1px solid #e0e0e0;
    }
    .stat-item {
      text-align: center;
    }
    .stat-number {
      font-size: 28px;
      font-weight: bold;
      color: #667eea;
    }
    .stat-label {
      font-size: 14px;
      color: #666;
      margin-top: 5px;
    }
    .voicemail-list {
      padding: 20px;
    }
    .voicemail-card {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 15px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .voicemail-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .voicemail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    .caller-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .caller-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
    }
    .caller-details h3 {
      font-size: 16px;
      margin-bottom: 3px;
    }
    .caller-details p {
      font-size: 12px;
      color: #666;
    }
    .duration-badge {
      background: #e3f2fd;
      color: #1976d2;
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .transcription {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 6px;
      margin: 15px 0;
      font-style: italic;
      color: #333;
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 15px;
    }
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.8; }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .btn-secondary {
      background: #e0e0e0;
      color: #333;
    }
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #666;
    }
    .empty-state svg {
      width: 120px;
      height: 120px;
      margin-bottom: 20px;
      opacity: 0.3;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎬 O Cinema Voicemail Dashboard</h1>
      <p>Manage customer voicemails from the AI voice agent</p>
    </div>

    <div class="stats">
      <div class="stat-item">
        <div class="stat-number">${total}</div>
        <div class="stat-label">Total Voicemails</div>
      </div>
      <div class="stat-item">
        <div class="stat-number">${voicemails.filter(v => !v.listened).length}</div>
        <div class="stat-label">Unlistened</div>
      </div>
      <div class="stat-item">
        <div class="stat-number">${voicemails.filter(v => v.transcription).length}</div>
        <div class="stat-label">Transcribed</div>
      </div>
    </div>

    <div class="voicemail-list">
      ${voicemails.length === 0 ? `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <h2>No Voicemails Yet</h2>
          <p>When customers leave voicemails, they will appear here.</p>
        </div>
      ` : voicemails.map(vm => `
        <div class="voicemail-card">
          <div class="voicemail-header">
            <div class="caller-info">
              <div class="caller-avatar">📞</div>
              <div class="caller-details">
                <h3>${escapeHtml(vm.from) || 'Unknown Caller'}</h3>
                <p>${escapeHtml(new Date(vm.createdAt).toLocaleString())}</p>
              </div>
            </div>
            <span class="duration-badge">${escapeHtml(String(vm.duration))}s</span>
          </div>

          ${vm.transcription ? `
            <div class="transcription">
              "${escapeHtml(vm.transcription)}"
            </div>
          ` : '<p style="color: #999; font-style: italic;">Transcription pending...</p>'}

          <div class="actions">
            <a href="${escapeHtml(vm.recordingUrl)}" class="btn btn-primary" target="_blank">🎧 Listen to Recording</a>
            ${vm.recordingUrl ? `<a href="${escapeHtml(vm.recordingUrl)}.mp3" class="btn btn-secondary" download>⬇️ Download MP3</a>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  </div>
</body>
</html>`;
}
