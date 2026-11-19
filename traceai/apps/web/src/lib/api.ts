const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type User = {
  id: string;
  name: string;
  email: string;
};

export type SignupResponse = {
  message: string;
  user: User & { createdAt: string };
};

export type LoginResponse = {
  message: string;
  accessToken: string;
  user: User;
};

export type RefreshResponse = {
  accessToken: string;
};

export type Workflow = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  draftGraph: unknown;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowResponse = {
  workflow: Workflow;
};

export type SaveDraftResponse = {
  id: string;
  updatedAt: string;
};

// The access token lives only in memory. A page refresh clears it, and the
// httpOnly refresh cookie brings it back, so JavaScript never stores a secret.
let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // Many requests may need a new token at once. They all share one refresh call.
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!response.ok) return null;
        const data = (await response.json()) as RefreshResponse;
        return data.accessToken;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  const token = await refreshInFlight;
  accessToken = token;
  return token;
}

function send(path: string, options: RequestInit, token: string | null) {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const isAuthPath = path.startsWith('/auth/');

  let token = accessToken;
  if (!token && !isAuthPath) {
    token = await refreshAccessToken();
  }

  let response = await send(path, options, token);

  // Token expired (it lives 15 minutes): get a new one and try once more.
  if (response.status === 401 && !isAuthPath) {
    token = await refreshAccessToken();
    if (token) {
      response = await send(path, options, token);
    }
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error ?? 'Something went wrong.',
    );
  }

  return data as T;
}