import { API_URL } from '../config';
import type { ForgeConfig } from './config.service';
import { refresh } from './auth.service';
import { save } from './config.service';

const RETRY_DELAY_MS = 2_000;

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
  options?: { method?: string; body?: string }
): Promise<Response> {
  return fetch(url, {
    method: options?.method ?? 'GET',
    body: options?.body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function get<T>(
  path: string,
  config: ForgeConfig,
  params?: Record<string, string>
): Promise<T> {
  const url = buildUrl(path, params);
  let res: Response;

  // Network error handling
  try {
    res = await makeRequest(url, config.accessToken);
  } catch {
    throw new Error(
      'Cannot reach Forge server. Check your connection or try again later.'
    );
  }

  // Token refresh on 401
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
      res = await makeRequest(url, refreshed.accessToken);
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

  // 5xx: retry once after 2s
  if (res.status >= 500) {
    await sleep(RETRY_DELAY_MS);

    try {
      res = await makeRequest(url, config.accessToken);
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

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export async function post<T>(
  path: string,
  body: Record<string, unknown>,
  config: ForgeConfig,
): Promise<T> {
  const url = buildUrl(path);
  const serializedBody = JSON.stringify(body);
  const reqOptions = { method: 'POST', body: serializedBody };
  let res: Response;

  // Network error handling
  try {
    res = await makeRequest(url, config.accessToken, reqOptions);
  } catch {
    throw new Error(
      'Cannot reach Forge server. Check your connection or try again later.'
    );
  }

  // Token refresh on 401
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

  // 5xx: retry once after 2s
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

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export async function patch<T>(
  path: string,
  body: Record<string, unknown>,
  config: ForgeConfig,
): Promise<T> {
  const url = buildUrl(path);
  const serializedBody = JSON.stringify(body);
  const reqOptions = { method: 'PATCH', body: serializedBody };
  let res: Response;

  // Network error handling
  try {
    res = await makeRequest(url, config.accessToken, reqOptions);
  } catch {
    throw new Error(
      'Cannot reach Forge server. Check your connection or try again later.'
    );
  }

  // Token refresh on 401
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

  // 5xx: retry once after 2s
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

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}
