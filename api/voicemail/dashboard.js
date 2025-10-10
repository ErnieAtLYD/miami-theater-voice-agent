// api/voicemail/dashboard.js
// Web-based dashboard with password authentication
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const html = `<!DOCTYPE html>
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
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      padding: 40px;
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    .login-container h1 {
      margin-bottom: 10px;
      font-size: 28px;
      color: #333;
    }
    .login-container p {
      color: #666;
      margin-bottom: 30px;
    }
    .form-group {
      margin-bottom: 20px;
      text-align: left;
    }
    .form-group label {
      display: block;
      margin-bottom: 8px;
      color: #333;
      font-weight: 500;
    }
    .form-group input {
      width: 100%;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.3s;
    }
    .form-group input:focus {
      outline: none;
      border-color: #667eea;
    }
    .btn-login {
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .btn-login:hover {
      opacity: 0.9;
    }
    .btn-login:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .error-message {
      background: #ffebee;
      color: #c62828;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: none;
    }
    .error-message.show {
      display: block;
    }
    .dashboard-container {
      display: none;
      width: 100%;
      max-width: 1200px;
    }
    .dashboard-container.show {
      display: block;
    }
    .logout-btn {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 10px 20px;
      background: white;
      color: #667eea;
      border: 2px solid white;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .logout-btn:hover {
      background: transparent;
      color: white;
    }
    .loading {
      text-align: center;
      padding: 40px;
      color: #666;
    }
    .spinner {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #667eea;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <!-- Login Form -->
  <div class="login-container" id="loginContainer">
    <h1>🎬 O Cinema</h1>
    <p>Voicemail Dashboard</p>

    <div class="error-message" id="errorMessage">
      Invalid password. Please try again.
    </div>

    <form id="loginForm">
      <div class="form-group">
        <label for="password">Access Password</label>
        <input
          type="password"
          id="password"
          name="password"
          placeholder="Enter your password"
          autocomplete="current-password"
          required
        >
      </div>
      <button type="submit" class="btn-login" id="loginBtn">
        Access Dashboard
      </button>
    </form>
  </div>

  <!-- Dashboard Container -->
  <div class="dashboard-container" id="dashboardContainer">
    <button class="logout-btn" id="logoutBtn">🚪 Logout</button>
    <div id="dashboardContent"></div>
  </div>

  <script>
    const API_URL = '/api/voicemail/list';
    const REFRESH_INTERVAL = 30000; // 30 seconds
    let refreshTimer = null;

    // Check if already logged in
    const savedToken = sessionStorage.getItem('voicemail_token');
    if (savedToken) {
      loadDashboard(savedToken);
    }

    // Login form handler
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const password = document.getElementById('password').value;
      const loginBtn = document.getElementById('loginBtn');
      const errorMessage = document.getElementById('errorMessage');

      // Hide error
      errorMessage.classList.remove('show');

      // Disable button
      loginBtn.disabled = true;
      loginBtn.textContent = 'Checking...';

      try {
        const response = await fetch(API_URL, {
          headers: {
            'Authorization': 'Bearer ' + password,
            'Accept': 'application/json'
          }
        });

        if (response.ok) {
          // Save token
          sessionStorage.setItem('voicemail_token', password);
          loadDashboard(password);
        } else {
          // Show error
          errorMessage.classList.add('show');
          loginBtn.disabled = false;
          loginBtn.textContent = 'Access Dashboard';
        }
      } catch (error) {
        console.error('Login error:', error);
        errorMessage.textContent = 'Connection error. Please try again.';
        errorMessage.classList.add('show');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Access Dashboard';
      }
    });

    // Logout handler
    document.getElementById('logoutBtn').addEventListener('click', () => {
      sessionStorage.removeItem('voicemail_token');
      if (refreshTimer) clearInterval(refreshTimer);
      document.getElementById('loginContainer').style.display = 'flex';
      document.getElementById('dashboardContainer').classList.remove('show');
      document.getElementById('password').value = '';
    });

    // Load dashboard
    async function loadDashboard(token) {
      const loginContainer = document.getElementById('loginContainer');
      const dashboardContainer = document.getElementById('dashboardContainer');
      const dashboardContent = document.getElementById('dashboardContent');

      // Show loading
      loginContainer.style.display = 'none';
      dashboardContainer.classList.add('show');
      dashboardContent.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading voicemails...</p></div>';

      try {
        const response = await fetch(API_URL, {
          headers: {
            'Authorization': 'Bearer ' + token,
            'Accept': 'text/html'
          }
        });

        if (response.ok) {
          const html = await response.text();
          // Extract just the container content (remove outer HTML structure)
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const container = doc.querySelector('.container');
          dashboardContent.innerHTML = container ? container.outerHTML : html;

          // Set up auto-refresh
          if (refreshTimer) clearInterval(refreshTimer);
          refreshTimer = setInterval(() => loadDashboard(token), REFRESH_INTERVAL);
        } else {
          // Token invalid, show login again
          sessionStorage.removeItem('voicemail_token');
          loginContainer.style.display = 'flex';
          dashboardContainer.classList.remove('show');
          document.getElementById('errorMessage').classList.add('show');
        }
      } catch (error) {
        console.error('Dashboard load error:', error);
        dashboardContent.innerHTML = '<div class="loading"><p style="color: #c62828;">Error loading dashboard. Please try again.</p></div>';
      }
    }

    // Auto-focus password field
    document.getElementById('password').focus();
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}
