// ──────────────────────────────────────────────────────────────
// API Client — Centralized fetch wrapper for frontend
// ──────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

interface FetchOptions extends RequestInit {
  token?: string;
}

export async function apiClient<T = unknown>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<{ success: boolean; data?: T; error?: string; meta?: any }> {
  const { token, ...fetchOptions } = options;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...fetchOptions,
      headers,
    });

    const data = await response.json();
    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

// Convenience methods
export const api = {
  get: <T>(endpoint: string, token?: string) =>
    apiClient<T>(endpoint, { method: "GET", token }),

  post: <T>(endpoint: string, body: unknown, token?: string) =>
    apiClient<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  put: <T>(endpoint: string, body: unknown, token?: string) =>
    apiClient<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  patch: <T>(endpoint: string, body: unknown, token?: string) =>
    apiClient<T>(endpoint, {
      method: "PATCH",
      body: JSON.stringify(body),
      token,
    }),

  delete: <T>(endpoint: string, token?: string) =>
    apiClient<T>(endpoint, { method: "DELETE", token }),
};
