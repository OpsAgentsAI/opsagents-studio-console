import { auth, PROXY_URL } from './firebase';

export interface GenerateResponse {
  imageBase64: string;
  mimeType: string;
  cost: number;
  latencyMs: number;
  requestId: string;
}

export interface HistoryItem {
  id: string;
  prompt: string;
  thumbBase64?: string;
  mimeType: string;
  cost: number;
  createdAt: number;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  return fetch(`${PROXY_URL}${path}`, { ...init, headers });
}

export async function generateImage(prompt: string): Promise<GenerateResponse> {
  const res = await authedFetch('/generate', {
    method: 'POST',
    body: JSON.stringify({
      prompt,
      resolution: '1K',
      aspect_ratio: '1:1',
      num_images: 1,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Proxy ${res.status}: ${body}`);
  }
  return res.json();
}

export async function listHistory(): Promise<HistoryItem[]> {
  const res = await authedFetch('/history?limit=20', { method: 'GET' });
  if (!res.ok) throw new Error(`History ${res.status}`);
  const data = await res.json();
  return data.items;
}

export interface UserRow { email: string; role: 'admin' | 'user'; addedAt: number; }
export interface UsageRow { email: string; totalGenerations: number; totalCost: number; }

export async function listUsers(): Promise<UserRow[]> {
  const res = await authedFetch('/admin/users', { method: 'GET' });
  if (!res.ok) throw new Error(`Users ${res.status}`);
  const data = await res.json();
  return data.users;
}

export async function listUsage(): Promise<UsageRow[]> {
  const res = await authedFetch('/admin/usage', { method: 'GET' });
  if (!res.ok) throw new Error(`Usage ${res.status}`);
  const data = await res.json();
  return data.usage;
}

export async function addUser(email: string, role: 'admin' | 'user'): Promise<void> {
  const res = await authedFetch('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) throw new Error(`Add user ${res.status}: ${await res.text()}`);
}

export async function removeUser(email: string): Promise<void> {
  const res = await authedFetch(`/admin/users/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Remove user ${res.status}: ${await res.text()}`);
}
