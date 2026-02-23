import * as dotenv from 'dotenv';
import * as path from 'path';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.development') });
}

// API_URL must include the /api prefix (NestJS global prefix).
// Override via FORGE_API_URL env var for local dev or self-hosted deployments.
export const API_URL = process.env.FORGE_API_URL ?? 'https://www.forge-ai.dev/api';
export const APP_URL = process.env.FORGE_APP_URL ?? 'https://www.forge-ai.dev';
