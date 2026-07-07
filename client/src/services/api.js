const API_URL = import.meta.env.VITE_API_URL || '';

class ApiService {
  constructor() {
    this.baseUrl = API_URL;
  }

  getToken() {
    return localStorage.getItem('token');
  }

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'İstek başarısız');
    }

    return data;
  }

  // Auth
  async login(name) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async getMe() {
    return this.request('/api/auth/me');
  }

  // Rooms
  async createRoom(name) {
    return this.request('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async joinRoom(code) {
    return this.request('/api/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }
}

export const api = new ApiService();
