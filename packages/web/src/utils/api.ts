import { getApiBase } from './tauri-bridge';

let apiBasePromise: Promise<string> | null = null;

export async function getBase(): Promise<string> {
  if (!apiBasePromise) {
    apiBasePromise = getApiBase();
  }
  return apiBasePromise;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const base = await getBase();
  const { headers: customHeaders, ...restOptions } = options ?? {};
  const response = await fetch(`${base}${path}`, {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...customHeaders,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error ?? `HTTP ${response.status}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : (null as T);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
