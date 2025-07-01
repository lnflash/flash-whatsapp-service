// Admin Dashboard Main JavaScript
let currentPage = 'overview';
let loginSessionId = null;
let refreshInterval = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in
    if (adminAPI.token) {
        showDashboard();
    } else {
        showLoginModal();
    }

    // Setup event listeners
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('otpForm').addEventListener('submit', handleOtpVerification);
    
    // Setup sidebar navigation
    document.querySelectorAll('#sidebar .nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            navigateTo(page);
        });
    });
});

// Login handling
async function handleLogin(e) {
    e.preventDefault();
    const phoneNumber = document.getElementById('phoneNumber').value;
    const btn = e.target.querySelector('button[type="submit"]');
    
    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';
        
        const response = await adminAPI.login(phoneNumber);
        loginSessionId = response.sessionId;
        
        // Show OTP form
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('otpForm').style.display = 'block';
        document.getElementById('otpCode').focus();
        
        showToast('Verification code sent to your WhatsApp', 'success');
    } catch (error) {
        showToast(error.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Send Verification Code';
    }
}

async function handleOtpVerification(e) {
    e.preventDefault();
    const otp = document.getElementById('otpCode').value;
    const btn = e.target.querySelector('button[type="submit"]');
    
    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Verifying...';
        
        await adminAPI.verifyOtp(loginSessionId, otp);
        
        // Hide login modal and show dashboard
        const modal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
        modal.hide();
        showDashboard();
        
        showToast('Login successful!', 'success');
    } catch (error) {
        showToast(error.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Verify & Login';
    }
}

function showLoginForm() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('otpForm').style.display = 'none';
    document.getElementById('phoneNumber').focus();
}

function showLoginModal() {
    const modal = new bootstrap.Modal(document.getElementById('loginModal'));
    modal.show();
}

function showDashboard() {
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('adminPhoneNumber').textContent = localStorage.getItem('adminPhone') || '';
    
    // Don't navigate or start refresh if not authenticated
    if (adminAPI.token) {
        navigateTo('overview');
        // Start auto-refresh
        startAutoRefresh();
    }
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        adminAPI.logout();
    }
}

// Navigation
function navigateTo(page) {
    currentPage = page;
    
    // Update active nav
    document.querySelectorAll('#sidebar .nav-link').forEach(link => {
        link.classList.toggle('active', link.getAttribute('data-page') === page);
    });
    
    // Load page content
    loadPageContent(page);
}

async function loadPageContent(page) {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="spinner-container"><div class="spinner-border text-primary" role="status"></div></div>';
    
    try {
        switch (page) {
            case 'overview':
                await loadOverview();
                break;
            case 'sessions':
                await loadSessions();
                break;
            case 'whatsapp':
                await loadWhatsAppStatus();
                break;
            case 'commands':
                await loadCommands();
                break;
            case 'announcements':
                await loadAnnouncements();
                break;
            case 'logs':
                await loadLogs();
                break;
        }
    } catch (error) {
        content.innerHTML = `<div class="alert alert-danger">Error loading page: ${error.message}</div>`;
    }
}

// Page content loaders
async function loadOverview() {
    const stats = await adminAPI.getStats();
    const content = document.getElementById('content');
    
    content.innerHTML = `
        <h2 class="mb-4">Dashboard Overview</h2>
        
        <div class="row mb-4">
            <div class="col-md-3">
                <div class="card stat-card">
                    <div class="card-body">
                        <p class="stat-value">${stats.users.totalSessions}</p>
                        <p class="stat-label">Total Sessions</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card stat-card">
                    <div class="card-body">
                        <p class="stat-value">${stats.users.activeSessions}</p>
                        <p class="stat-label">Active Users (24h)</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card stat-card">
                    <div class="card-body">
                        <p class="stat-value">${stats.users.linkedAccounts}</p>
                        <p class="stat-label">Linked Accounts</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card stat-card">
                    <div class="card-body">
                        <p class="stat-value">${formatUptime(stats.system.uptime)}</p>
                        <p class="stat-label">Uptime</p>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="row mb-4">
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">System Status</h5>
                    </div>
                    <div class="card-body">
                        <div class="mb-2">
                            <span class="status-indicator ${stats.system.whatsappStatus.connected ? 'status-online' : 'status-offline'}"></span>
                            WhatsApp: ${stats.system.whatsappStatus.connected ? 'Connected' : 'Disconnected'}
                            ${stats.system.whatsappStatus.phoneNumber ? `(${stats.system.whatsappStatus.phoneNumber})` : ''}
                        </div>
                        <div class="mb-2">
                            <span class="status-indicator ${stats.system.redisStatus ? 'status-online' : 'status-offline'}"></span>
                            Redis: ${stats.system.redisStatus ? 'Connected' : 'Disconnected'}
                        </div>
                        <div class="mb-2">
                            <span class="status-indicator ${stats.system.rabbitMqStatus ? 'status-online' : 'status-offline'}"></span>
                            RabbitMQ: ${stats.system.rabbitMqStatus ? 'Connected' : 'Disconnected'}
                        </div>
                        <div class="mt-3">
                            <small class="text-muted">
                                Memory Usage: ${formatBytes(stats.system.memoryUsage.heapUsed)} / ${formatBytes(stats.system.memoryUsage.heapTotal)}
                            </small>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">Message Statistics</h5>
                    </div>
                    <div class="card-body">
                        <canvas id="messageChart"></canvas>
                    </div>
                </div>
            </div>
        </div>
        
        ${stats.errors.recent.length > 0 ? `
        <div class="card">
            <div class="card-header">
                <h5 class="mb-0">Recent Errors</h5>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Level</th>
                                <th>Message</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${stats.errors.recent.map(error => `
                                <tr>
                                    <td>${new Date(error.timestamp).toLocaleString()}</td>
                                    <td><span class="badge bg-danger">${error.level}</span></td>
                                    <td>${error.message}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        ` : ''}
    `;
    
    // Draw message chart
    drawMessageChart(stats.messages);
}

async function loadSessions() {
    const data = await adminAPI.getSessions();
    const content = document.getElementById('content');
    
    content.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h2>User Sessions</h2>
            <button class="btn btn-danger btn-sm" onclick="clearAllSessions()">
                <i class="bi bi-trash"></i> Clear All Sessions
            </button>
        </div>
        
        <div class="card session-table">
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>WhatsApp ID</th>
                                <th>Phone Number</th>
                                <th>Flash Username</th>
                                <th>Linked At</th>
                                <th>Last Activity</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.sessions.map(session => `
                                <tr>
                                    <td>${session.whatsappId}</td>
                                    <td>${session.phoneNumber || '-'}</td>
                                    <td>${session.flashUsername || '<span class="text-muted">Not linked</span>'}</td>
                                    <td>${session.linkedAt ? new Date(session.linkedAt).toLocaleDateString() : '-'}</td>
                                    <td>${session.lastActivity ? new Date(session.lastActivity).toLocaleString() : '-'}</td>
                                    <td>
                                        <button class="btn btn-sm btn-outline-primary" onclick="toggleSupport('${session.whatsappId}')">
                                            <i class="bi bi-headset"></i>
                                        </button>
                                        <button class="btn btn-sm btn-outline-danger" onclick="clearSession('${session.whatsappId}')">
                                            <i class="bi bi-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <nav>
                    <ul class="pagination justify-content-center">
                        ${generatePagination(data.page, data.totalPages)}
                    </ul>
                </nav>
            </div>
        </div>
    `;
}

async function loadWhatsAppStatus() {
    const status = await adminAPI.getWhatsAppStatus();
    const qrData = await adminAPI.getWhatsAppQr();
    const content = document.getElementById('content');
    
    content.innerHTML = `
        <h2 class="mb-4">WhatsApp Status</h2>
        
        <div class="row">
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">Connection Status</h5>
                    </div>
                    <div class="card-body">
                        <div class="mb-3">
                            <span class="status-indicator ${status.connected ? 'status-online' : 'status-offline'}"></span>
                            <strong>Status:</strong> ${status.connected ? 'Connected' : 'Disconnected'}
                        </div>
                        ${status.phoneNumber ? `
                            <div class="mb-3">
                                <strong>Phone Number:</strong> ${status.phoneNumber}
                            </div>
                        ` : ''}
                        ${status.batteryLevel !== undefined ? `
                            <div class="mb-3">
                                <strong>Battery Level:</strong> ${status.batteryLevel}%
                            </div>
                        ` : ''}
                        
                        <div class="mt-4">
                            ${status.connected ? `
                                <button class="btn btn-danger" onclick="disconnectWhatsApp()">
                                    <i class="bi bi-plug"></i> Disconnect
                                </button>
                            ` : `
                                <p class="text-muted">Scan the QR code to connect</p>
                            `}
                        </div>
                    </div>
                </div>
                
                <div class="card mt-3">
                    <div class="card-header">
                        <h5 class="mb-0">Test Message</h5>
                    </div>
                    <div class="card-body">
                        <form onsubmit="sendTestMessage(event)">
                            <div class="mb-3">
                                <label class="form-label">To (Phone Number)</label>
                                <input type="tel" class="form-control" id="testTo" placeholder="+1234567890" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Message</label>
                                <textarea class="form-control" id="testMessage" rows="3" required></textarea>
                            </div>
                            <button type="submit" class="btn btn-primary" ${!status.connected ? 'disabled' : ''}>
                                <i class="bi bi-send"></i> Send Test
                            </button>
                        </form>
                    </div>
                </div>
            </div>
            
            <div class="col-md-6">
                ${qrData.qr && !status.connected ? `
                    <div class="qr-container">
                        <h5>Scan QR Code</h5>
                        <pre>${qrData.qr}</pre>
                        <p class="text-muted mt-3">Open WhatsApp on your phone and scan this code</p>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

async function loadCommands() {
    const history = await adminAPI.getCommandHistory();
    const content = document.getElementById('content');
    
    content.innerHTML = `
        <h2 class="mb-4">Admin Commands</h2>
        
        <div class="card">
            <div class="card-body">
                <div class="command-terminal" id="commandOutput">
                    ${history.map(cmd => `
                        <div class="command-output">
                            <span class="command-prompt">admin@${cmd.executedBy}></span> ${cmd.command}
                            <small class="text-muted float-end">${new Date(cmd.timestamp).toLocaleString()}</small>
                        </div>
                    `).join('')}
                </div>
                
                <form onsubmit="executeCommand(event)" class="mt-3">
                    <div class="input-group">
                        <span class="input-group-text command-prompt">admin></span>
                        <input type="text" class="form-control command-input" id="commandInput" 
                               placeholder="Enter admin command..." autocomplete="off">
                        <button class="btn btn-primary" type="submit">Execute</button>
                    </div>
                </form>
                
                <div class="mt-3">
                    <details>
                        <summary class="text-muted">Available Commands</summary>
                        <pre class="mt-2">
stats - Show bot statistics
status - Check bot status
users - List all active users
clear-session - Clear WhatsApp session
support on/off {number} - Toggle support mode
send {number} {message} - Send message to user
announce {message} - Send to all users
help - Show all commands
                        </pre>
                    </details>
                </div>
            </div>
        </div>
    `;
    
    // Auto-scroll to bottom
    const output = document.getElementById('commandOutput');
    output.scrollTop = output.scrollHeight;
}

async function loadAnnouncements() {
    const content = document.getElementById('content');
    
    content.innerHTML = `
        <h2 class="mb-4">Send Announcement</h2>
        
        <div class="card">
            <div class="card-body">
                <form onsubmit="sendAnnouncement(event)">
                    <div class="mb-3">
                        <label class="form-label">Announcement Message</label>
                        <textarea class="form-control" id="announcementMessage" rows="5" 
                                  placeholder="Enter your announcement message..." required></textarea>
                        <div class="form-text">This message will be sent to all users</div>
                    </div>
                    
                    <div class="mb-3">
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="includeUnlinked">
                            <label class="form-check-label" for="includeUnlinked">
                                Include unlinked users (users without Flash accounts)
                            </label>
                        </div>
                        
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="testMode">
                            <label class="form-check-label" for="testMode">
                                Test mode (don't actually send messages)
                            </label>
                        </div>
                    </div>
                    
                    <button type="submit" class="btn btn-primary">
                        <i class="bi bi-megaphone"></i> Send Announcement
                    </button>
                </form>
            </div>
        </div>
    `;
}

async function loadLogs() {
    const logs = await adminAPI.getSystemLogs({ limit: 100 });
    const content = document.getElementById('content');
    
    content.innerHTML = `
        <h2 class="mb-4">System Logs</h2>
        
        <div class="card">
            <div class="card-body">
                <div class="mb-3">
                    <select class="form-select" id="logLevel" onchange="filterLogs()">
                        <option value="">All Levels</option>
                        <option value="error">Error</option>
                        <option value="warn">Warning</option>
                        <option value="info">Info</option>
                        <option value="debug">Debug</option>
                    </select>
                </div>
                
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Level</th>
                                <th>Message</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${logs.map(log => `
                                <tr>
                                    <td>${new Date(log.timestamp).toLocaleString()}</td>
                                    <td>
                                        <span class="badge bg-${getLogLevelColor(log.level)}">${log.level}</span>
                                    </td>
                                    <td>${log.message}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// Action handlers
async function clearSession(whatsappId) {
    if (confirm('Clear session for ' + whatsappId + '?')) {
        try {
            await adminAPI.clearSession(whatsappId);
            showToast('Session cleared successfully', 'success');
            loadSessions();
        } catch (error) {
            showToast(error.message, 'danger');
        }
    }
}

async function clearAllSessions() {
    if (confirm('Are you sure you want to clear ALL sessions? This cannot be undone.')) {
        try {
            const result = await adminAPI.clearAllSessions();
            showToast(`Cleared ${result.cleared} sessions`, 'success');
            loadSessions();
        } catch (error) {
            showToast(error.message, 'danger');
        }
    }
}

async function toggleSupport(whatsappId) {
    try {
        const enable = confirm('Enable support mode for ' + whatsappId + '?');
        await adminAPI.toggleSupportMode(whatsappId, enable);
        showToast(`Support mode ${enable ? 'enabled' : 'disabled'}`, 'success');
    } catch (error) {
        showToast(error.message, 'danger');
    }
}

async function disconnectWhatsApp() {
    if (confirm('Disconnect WhatsApp session?')) {
        try {
            await adminAPI.disconnectWhatsApp();
            showToast('WhatsApp disconnected', 'success');
            loadWhatsAppStatus();
        } catch (error) {
            showToast(error.message, 'danger');
        }
    }
}

async function sendTestMessage(e) {
    e.preventDefault();
    const to = document.getElementById('testTo').value;
    const message = document.getElementById('testMessage').value;
    
    try {
        await adminAPI.sendTestMessage(to, message);
        showToast('Test message sent!', 'success');
        e.target.reset();
    } catch (error) {
        showToast(error.message, 'danger');
    }
}

async function executeCommand(e) {
    e.preventDefault();
    const input = document.getElementById('commandInput');
    const command = input.value.trim();
    
    if (!command) return;
    
    try {
        const result = await adminAPI.executeCommand(command);
        
        // Add to output
        const output = document.getElementById('commandOutput');
        output.innerHTML += `
            <div class="command-output">
                <span class="command-prompt">admin></span> ${command}
                <div class="mt-1">${result.result}</div>
            </div>
        `;
        output.scrollTop = output.scrollHeight;
        
        input.value = '';
    } catch (error) {
        showToast(error.message, 'danger');
    }
}

async function sendAnnouncement(e) {
    e.preventDefault();
    const message = document.getElementById('announcementMessage').value;
    const includeUnlinked = document.getElementById('includeUnlinked').checked;
    const testMode = document.getElementById('testMode').checked;
    
    const confirmMsg = testMode 
        ? 'Send test announcement (no messages will be sent)?'
        : `Send announcement to all users?`;
    
    if (!confirm(confirmMsg)) return;
    
    try {
        const result = await adminAPI.sendAnnouncement(message, {
            includeUnlinked,
            testMode,
        });
        
        showToast(
            `Announcement ${testMode ? 'tested' : 'sent'}! ` +
            `${result.sent} successful, ${result.failed} failed`,
            'success'
        );
        
        e.target.reset();
    } catch (error) {
        showToast(error.message, 'danger');
    }
}

async function filterLogs() {
    const level = document.getElementById('logLevel').value;
    loadLogs(); // Reload with filter
}

// Helper functions
function showToast(message, type = 'info') {
    const toast = document.getElementById('notification-toast');
    const toastBody = toast.querySelector('.toast-body');
    
    toast.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'bg-info');
    toast.classList.add(`bg-${type}`, 'text-white');
    toastBody.textContent = message;
    
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getLogLevelColor(level) {
    switch (level) {
        case 'error': return 'danger';
        case 'warn': return 'warning';
        case 'info': return 'info';
        case 'debug': return 'secondary';
        default: return 'primary';
    }
}

function generatePagination(current, total) {
    let html = '';
    
    // Previous
    html += `
        <li class="page-item ${current === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="loadSessionsPage(${current - 1})">Previous</a>
        </li>
    `;
    
    // Pages
    for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) {
            html += `
                <li class="page-item ${i === current ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="loadSessionsPage(${i})">${i}</a>
                </li>
            `;
        } else if (i === current - 3 || i === current + 3) {
            html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
    }
    
    // Next
    html += `
        <li class="page-item ${current === total ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="loadSessionsPage(${current + 1})">Next</a>
        </li>
    `;
    
    return html;
}

async function loadSessionsPage(page) {
    const data = await adminAPI.getSessions(page);
    // Update table content
    loadSessions();
}

function drawMessageChart(data) {
    const ctx = document.getElementById('messageChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Today', 'This Week', 'This Month'],
            datasets: [{
                label: 'Messages',
                data: [data.today, data.week, data.month],
                backgroundColor: ['#ffd700', '#ffa502', '#ff6348'],
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Auto-refresh
function startAutoRefresh() {
    // Refresh stats every 30 seconds
    refreshInterval = setInterval(() => {
        if (currentPage === 'overview') {
            loadOverview();
        }
    }, 30000);
}

// Cleanup on logout
window.addEventListener('beforeunload', () => {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
});