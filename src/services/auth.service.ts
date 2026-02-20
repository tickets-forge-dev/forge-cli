import { API_URL } from '../config';
import type { ForgeConfig } from './config.service';
import type { DeviceFlowRequest, DeviceFlowToken } from '../types/auth';

const MAX_POLL_MS = 300_000; // 5 minutes

export async function startDeviceFlow(): Promise<DeviceFlowRequest> {
  const res = await fetch(`${API_URL}/auth/device/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to initiate authentication: ${res.status} ${res.statusText}`
    );
  }

  return res.json() as Promise<DeviceFlowRequest>;
}

export async function pollToken(
  deviceCode: string,
  interval: number,
  maxMs: number = MAX_POLL_MS
): Promise<DeviceFlowToken> {
  const start = Date.now();
  const intervalMs = interval * 1000;

  while (Date.now() - start < maxMs) {
    await sleep(intervalMs);

    const res = await fetch(`${API_URL}/auth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    });

    if (res.ok) {
      return res.json() as Promise<DeviceFlowToken>;
    }

    if (res.status === 400) {
      const body = (await res.json()) as { error: string };

      if (body.error === 'authorization_pending') {
        continue;
      }

      if (body.error === 'expired_token') {
        throw new Error(
          'Authorization timed out. Run `forge login` to try again.'
        );
      }

      if (body.error === 'access_denied') {
        throw new Error(
          'Authorization was denied. Run `forge login` to try again.'
        );
      }
    }

    throw new Error(
      `Unexpected server response: ${res.status} ${res.statusText}`
    );
  }

  throw new Error(
    'Authorization timed out (5 min exceeded). Run `forge login` to try again.'
  );
}

export function isLoggedIn(config: Partial<ForgeConfig> | null): boolean {
  return !!config?.accessToken;
}

export interface RefreshResult {
  accessToken: string;
  expiresAt: string;
}

export async function refresh(refreshToken: string): Promise<RefreshResult> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    throw new Error(
      'Session expired. Run `forge login` to re-authenticate.'
    );
  }

  return res.json() as Promise<RefreshResult>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
