import { API_BASE_URL } from '../config';

const BASE = `${API_BASE_URL}/settings`;

async function handleResponse(res) {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export const settingsApi = {
  async getSettings() {
    const res = await fetch(BASE);
    return handleResponse(res);
  },

  async updateSettings(updates) {
    const res = await fetch(BASE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse(res);
  },

  async testProvider(provider) {
    const res = await fetch(`${BASE}/test/${provider}`, { method: 'POST' });
    return handleResponse(res);
  },
};
