import { API_BASE_URL } from '../config';

const BASE = `${API_BASE_URL}/custom-nodes`;

async function handleResponse(res) {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export const customNodeApi = {
  async list(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);

    const qs = query.toString();
    const res = await fetch(`${BASE}${qs ? `?${qs}` : ''}`);
    return handleResponse(res);
  },

  async getById(id) {
    const res = await fetch(`${BASE}/${id}`);
    return handleResponse(res);
  },

  async create(data) {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async update(id, data) {
    const res = await fetch(`${BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async delete(id) {
    const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
    return handleResponse(res);
  },
};
