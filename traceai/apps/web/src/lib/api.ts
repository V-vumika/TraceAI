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

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error ?? 'Something went wrong.',
    );
  }

  return data as T;
}