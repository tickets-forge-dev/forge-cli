import * as dotenv from 'dotenv';
import * as path from 'path';
import chalk from 'chalk';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.development') });
}

// Warn if TLS certificate validation has been disabled — tokens would be
// exposed to man-in-the-middle attacks.
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  process.stderr.write(
    chalk.yellow(
      '⚠  WARNING: NODE_TLS_REJECT_UNAUTHORIZED=0 disables TLS certificate validation.\n' +
      '   Your auth tokens may be exposed to interception. Unset this variable in production.\n'
    )
  );
}

// API_URL must include the /api prefix (NestJS global prefix).
// Override via FORGE_API_URL env var for local dev or self-hosted deployments.
const rawApiUrl = process.env.FORGE_API_URL;
const rawAppUrl = process.env.FORGE_APP_URL;

// In production, only allow HTTPS URLs to prevent token interception.
function validateUrl(url: string, envName: string): string {
  if (process.env.NODE_ENV !== 'production') return url;
  if (!url.startsWith('https://')) {
    process.stderr.write(
      chalk.yellow(
        `⚠  WARNING: ${envName}=${url} is not HTTPS. ` +
        `Auth tokens may be sent over an insecure connection.\n`
      )
    );
  }
  return url;
}

export const API_URL = validateUrl(
  rawApiUrl ?? 'https://www.forge-ai.dev/api',
  'FORGE_API_URL'
);
export const APP_URL = validateUrl(
  rawAppUrl ?? 'https://www.forge-ai.dev',
  'FORGE_APP_URL'
);
