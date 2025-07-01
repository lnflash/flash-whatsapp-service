// API Client for Admin Dashboard
class AdminAPI {
    constructor() {
        this.baseURL = '/api/admin';
        this.token = localStorage.getItem('adminToken');
        this.refreshToken = localStorage.getItem('adminRefreshToken');
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        };

        if (this.token && !endpoint.includes('/auth/')) {
            config.headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(url, config);
            
            if (response.status === 401) {
                if (this.refreshToken) {
                    // Try to refresh token
                    const refreshed = await this.refreshSession();
                    if (refreshed) {
                        // Retry original request
                        config.headers['Authorization'] = `Bearer ${this.token}`;
                        return fetch(url, config).then(res => this.handleResponse(res));
                    }
                }
                // If no refresh token or refresh failed, redirect to login
                this.logout();
                return null;
            }

            return this.handleResponse(response);
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    async handleResponse(response) {
        const contentType = response.headers.get('content-type');
        
        if (!response.ok) {
            let error;
            if (contentType && contentType.includes('application/json')) {
                error = await response.json();
            } else {
                error = { message: await response.text() };
            }
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        if (response.status === 204) {
            return null;
        }

        if (contentType && contentType.includes('application/json')) {
            return response.json();
        }

        return response.text();
    }

    // Auth endpoints
    async login(phoneNumber) {
        const response = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ phoneNumber }),
        });
        return response;
    }

    async verifyOtp(sessionId, otp) {
        const response = await this.request('/auth/verify', {
            method: 'POST',
            body: JSON.stringify({ sessionId, otp }),
        });

        if (response.accessToken) {
            this.token = response.accessToken;
            this.refreshToken = response.refreshToken;
            localStorage.setItem('adminToken', response.accessToken);
            localStorage.setItem('adminRefreshToken', response.refreshToken);
            localStorage.setItem('adminPhone', response.phoneNumber);
        }

        return response;
    }

    async refreshSession() {
        try {
            const response = await this.request('/auth/refresh', {
                method: 'POST',
                body: JSON.stringify({ refreshToken: this.refreshToken }),
            });

            if (response.accessToken) {
                this.token = response.accessToken;
                this.refreshToken = response.refreshToken;
                localStorage.setItem('adminToken', response.accessToken);
                localStorage.setItem('adminRefreshToken', response.refreshToken);
                return true;
            }
        } catch (error) {
            console.error('Failed to refresh session:', error);
            this.logout();
        }
        return false;
    }

    logout() {
        this.token = null;
        this.refreshToken = null;
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminRefreshToken');
        localStorage.removeItem('adminPhone');
        window.location.reload();
    }

    // Dashboard endpoints
    async getStats() {
        return this.request('/dashboard/stats');
    }

    async getSessions(page = 1, limit = 20) {
        return this.request(`/dashboard/sessions?page=${page}&limit=${limit}`);
    }

    async clearSession(whatsappId) {
        return this.request(`/dashboard/sessions/${whatsappId}`, {
            method: 'DELETE',
        });
    }

    async clearAllSessions() {
        return this.request('/dashboard/sessions', {
            method: 'DELETE',
        });
    }

    async sendAnnouncement(message, options = {}) {
        return this.request('/dashboard/announcement', {
            method: 'POST',
            body: JSON.stringify({ message, ...options }),
        });
    }

    async toggleSupportMode(whatsappId, enable) {
        return this.request(`/dashboard/support-mode/${whatsappId}`, {
            method: 'POST',
            body: JSON.stringify({ enable }),
        });
    }

    async getWhatsAppStatus() {
        return this.request('/dashboard/whatsapp/status');
    }

    async getWhatsAppQr() {
        return this.request('/dashboard/whatsapp/qr');
    }

    async disconnectWhatsApp() {
        return this.request('/dashboard/whatsapp/disconnect', {
            method: 'POST',
        });
    }

    async sendTestMessage(to, message) {
        return this.request('/dashboard/test-message', {
            method: 'POST',
            body: JSON.stringify({ to, message }),
        });
    }

    async executeCommand(command) {
        return this.request('/dashboard/command', {
            method: 'POST',
            body: JSON.stringify({ command }),
        });
    }

    async getCommandHistory(limit = 50) {
        return this.request(`/dashboard/command/history?limit=${limit}`);
    }

    async getSystemLogs(options = {}) {
        const params = new URLSearchParams();
        if (options.level) params.append('level', options.level);
        if (options.limit) params.append('limit', options.limit);
        
        return this.request(`/dashboard/logs?${params.toString()}`);
    }
}

// Create global API instance
window.adminAPI = new AdminAPI();