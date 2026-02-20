import * as dotenv from 'dotenv';
import * as path from 'path';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.development') });
}

// API_URL must include the /api prefix (NestJS global prefix).
// Default for local dev: http://localhost:3001/api
// Production: set FORGE_API_URL=https://your-backend-host/api
export const API_URL = process.env.FORGE_API_URL ?? 'http://localhost:3001/api';
export const APP_URL = process.env.FORGE_APP_URL ?? 'https://forge.app';
