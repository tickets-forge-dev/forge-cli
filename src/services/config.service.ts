import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';

const ForgeConfigSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.string(),
  userId: z.string(),
  teamId: z.string(),
  workspaceId: z.string().optional(),
  user: z.object({
    email: z.string().email(),
    displayName: z.string(),
  }),
});

export type ForgeConfig = z.infer<typeof ForgeConfigSchema>;

const CONFIG_DIR = path.join(os.homedir(), '.forge');
const CONFIG_FILE = 'config.json';

export function getConfigPath(): string {
  return path.join(CONFIG_DIR, CONFIG_FILE);
}

export async function load(): Promise<ForgeConfig | null> {
  const configPath = getConfigPath();
  let raw: string;

  try {
    raw = await fs.readFile(configPath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }

  // Warn if file permissions are not 0o600 (security check)
  // Skip on Windows: stat.mode doesn't reflect NTFS ACLs and chmod is a no-op
  if (process.platform !== 'win32') {
    try {
      const stat = await fs.stat(configPath);
      if ((stat.mode & 0o777) !== 0o600) {
        process.stderr.write(
          `⚠️  Warning: ~/.forge/config.json permissions are not 600. Run: chmod 600 ${configPath}\n`
        );
      }
    } catch {
      // Non-fatal: stat failure doesn't block loading
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'Config file is malformed. Run `forge login` to re-authenticate.'
    );
  }

  const result = ForgeConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      'Config file is corrupt or invalid. Run `forge login` to re-authenticate.'
    );
  }

  return result.data;
}

export async function save(config: ForgeConfig): Promise<void> {
  const configPath = getConfigPath();
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  // chmod is a no-op on Windows — NTFS uses ACLs, not POSIX mode bits
  if (process.platform !== 'win32') {
    await fs.chmod(configPath, 0o600);
  }
}

export async function clear(): Promise<void> {
  const configPath = getConfigPath();
  try {
    await fs.unlink(configPath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}
