import { API_URL } from '../config';
import type { ForgeConfig } from './config.service';
import { refresh } from './auth.service';
import { save } from './config.service';

const RETRY_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// Typed API error — callers can check `err instanceof ApiError` + statusCode
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function friendlyHttpError(status: number): string {
  switch (status) {
    case 403:
      return 'You do not have permission. Check your team membership or run `forge login`.';
    case 404:
      return 'Resource not found. Check the ID and try again.';
    case 429:
      return 'Rate limited. Wait a moment and try again.';
    default:
      return `Unexpected server response (${status}). Try again or check https://status.forge-ai.dev.`;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(`${API_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function makeRequest(
  url: string,
  accessToken: string,
  options?: { method?: string; body?: string; teamId?: string }
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  if (options?.teamId) {
    headers['x-team-id'] = options.teamId;
  }
  return fetch(url, {
    method: options?.method ?? 'GET',
    body: options?.body,
    headers,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Shared request pipeline: network → 401 refresh → 5xx retry → friendly error
// ---------------------------------------------------------------------------

interface RequestOptions {
  url: string;
  config: ForgeConfig;
  method?: string;
  body?: string;
}

async function request<T>(opts: RequestOptions): Promise<T> {
  const { url, config, method, body } = opts;
  const reqOptions = { method, body, teamId: config.teamId };
  let res: Response;

  // 1. Network error handling
  try {
    res = await makeRequest(url, config.accessToken, reqOptions);
  } catch {
    throw new Error(
      'Cannot reach Forge server. Check your connection or try again later.'
    );
  }

  // 2. Token refresh on 401
  if (res.status === 401) {
    let refreshed;
    try {
      refreshed = await refresh(config.refreshToken);
    } catch {
      throw new Error(
        'Session expired. Run `forge login` to re-authenticate.'
      );
    }

    const updatedConfig = {
      ...config,
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
    };
    await save(updatedConfig);

    // Retry once with new token
    try {
      res = await makeRequest(url, refreshed.accessToken, reqOptions);
    } catch {
      throw new Error(
        'Cannot reach Forge server. Check your connection or try again later.'
      );
    }

    if (res.status === 401) {
      throw new Error(
        'Session expired. Run `forge login` to re-authenticate.'
      );
    }
  }

  // 3. 5xx: retry once after delay
  if (res.status >= 500) {
    await sleep(RETRY_DELAY_MS);

    try {
      res = await makeRequest(url, config.accessToken, reqOptions);
    } catch {
      throw new Error(
        'Cannot reach Forge server. Check your connection or try again later.'
      );
    }

    if (res.status >= 500) {
      throw new Error(
        `Forge server error (${res.status}). Try again in a moment, or check https://status.forge.app.`
      );
    }
  }

  // 4. Other non-OK: throw typed ApiError with friendly message
  if (!res.ok) {
    throw new ApiError(res.status, friendlyHttpError(res.status));
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API — thin wrappers around request()
// ---------------------------------------------------------------------------

export async function get<T>(
  path: string,
  config: ForgeConfig,
  params?: Record<string, string>
): Promise<T> {
  return request<T>({ url: buildUrl(path, params), config });
}

export async function post<T>(
  path: string,
  body: Record<string, unknown>,
  config: ForgeConfig,
): Promise<T> {
  return request<T>({
    url: buildUrl(path),
    config,
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function patch<T>(
  path: string,
  body: Record<string, unknown>,
  config: ForgeConfig,
): Promise<T> {
  return request<T>({
    url: buildUrl(path),
    config,
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
