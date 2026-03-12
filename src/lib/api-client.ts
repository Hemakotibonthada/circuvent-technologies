/**
 * API Client Library
 * 
 * Type-safe API client for consuming Circuvent Technologies API endpoints.
 * Used by frontend applications to interact with the backend services.
 */

// ============================================================
// BASE CLIENT
// ============================================================

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: APIError;
  meta?: Record<string, unknown>;
}

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

class APIClient {
  private baseUrl: string;
  private token: string | null = null;
  private headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl;
  }

  /**
   * Set authentication token
   */
  setToken(token: string) {
    this.token = token;
    this.headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * Clear authentication token
   */
  clearToken() {
    this.token = null;
    const { Authorization, ...rest } = this.headers as Record<string, string>;
    this.headers = rest;
  }

  /**
   * Make a GET request
   */
  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<APIResponse<T>> {
    const url = new URL(`${this.baseUrl}${path}`, window.location.origin);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: this.headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: data.message || data.error || "Request failed",
            details: data,
          },
        };
      }

      return { success: true, data, meta: data?.meta };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Network error",
        },
      };
    }
  }

  /**
   * Make a POST request
   */
  async post<T>(path: string, body?: unknown): Promise<APIResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: data.message || data.error || "Request failed",
            details: data.errors || data,
          },
        };
      }

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Network error",
        },
      };
    }
  }

  /**
   * Make a PUT request
   */
  async put<T>(path: string, body?: unknown): Promise<APIResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "PUT",
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: data.message || "Request failed",
          },
        };
      }

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Network error",
        },
      };
    }
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(path: string): Promise<APIResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "DELETE",
        headers: this.headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: data.message || "Request failed",
          },
        };
      }

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Network error",
        },
      };
    }
  }
}

// ============================================================
// API CLIENT INSTANCES
// ============================================================

/** Main API client for the website */
export const api = new APIClient("/api");

// ============================================================
// TYPE-SAFE ENDPOINT WRAPPERS
// ============================================================

/**
 * Projects API
 */
export const projectsAPI = {
  /** Get all projects with optional filtering */
  getAll: async (params?: {
    category?: string;
    search?: string;
    status?: string;
    sort?: string;
    featured?: boolean;
    limit?: number;
  }) => {
    return api.get("/projects", {
      ...params,
      featured: params?.featured ? "true" : undefined,
    });
  },

  /** Get a single project by ID */
  getById: async (id: string) => {
    return api.get(`/projects?search=${id}&limit=1`);
  },
};

/**
 * Blog API
 */
export const blogAPI = {
  /** Get blog posts with optional filtering */
  getAll: async (params?: {
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
    featured?: boolean;
  }) => {
    return api.get("/blog", {
      ...params,
      featured: params?.featured ? "true" : undefined,
    });
  },

  /** Get a blog post by slug */
  getBySlug: async (slug: string) => {
    return api.get(`/blog?search=${slug}&limit=1`);
  },
};

/**
 * Contact API
 */
export const contactAPI = {
  /** Submit a contact form */
  submit: async (data: {
    name: string;
    email: string;
    company?: string;
    service?: string;
    budget?: string;
    message: string;
  }) => {
    return api.post("/contact", data);
  },
};

/**
 * GitHub API
 */
export const githubAPI = {
  /** Get GitHub repositories */
  getRepos: async (params?: {
    sort?: string;
    limit?: number;
    language?: string;
    topic?: string;
  }) => {
    return api.get("/github", params);
  },
};

/**
 * Health API
 */
export const healthAPI = {
  /** Check API health */
  check: async () => {
    return api.get("/health");
  },
};

// ============================================================
// REQUEST UTILITIES
// ============================================================

/**
 * Retry a failed request with exponential backoff
 */
export async function retryRequest<T>(
  fn: () => Promise<APIResponse<T>>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<APIResponse<T>> {
  let lastError: APIResponse<T> | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await fn();

    if (result.success) {
      return result;
    }

    lastError = result;

    // Don't retry client errors (4xx)
    if (result.error?.code.startsWith("HTTP_4")) {
      return result;
    }

    if (attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return lastError!;
}

/**
 * Cache an API response in memory
 */
const responseCache = new Map<string, { data: unknown; expiry: number }>();

export async function cachedRequest<T>(
  key: string,
  fn: () => Promise<APIResponse<T>>,
  ttlMs: number = 5 * 60 * 1000 // 5 minutes default
): Promise<APIResponse<T>> {
  const cached = responseCache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return { success: true, data: cached.data as T };
  }

  const result = await fn();

  if (result.success && result.data) {
    responseCache.set(key, {
      data: result.data,
      expiry: Date.now() + ttlMs,
    });
  }

  return result;
}

/**
 * Clear the response cache
 */
export function clearCache(key?: string) {
  if (key) {
    responseCache.delete(key);
  } else {
    responseCache.clear();
  }
}

/**
 * Batch multiple API requests
 */
export async function batchRequests<T extends readonly (() => Promise<unknown>)[]>(
  requests: T
): Promise<{ results: unknown[]; errors: APIError[] }> {
  const results = await Promise.allSettled(requests.map((fn) => fn()));

  const successful: unknown[] = [];
  const errors: APIError[] = [];

  results.forEach((result) => {
    if (result.status === "fulfilled") {
      successful.push(result.value);
    } else {
      errors.push({
        code: "BATCH_ERROR",
        message: result.reason?.message || "Request failed",
      });
    }
  });

  return { results: successful, errors };
}
