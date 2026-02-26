import chalk from 'chalk';
import * as ConfigService from '../services/config.service';
import type { ForgeConfig } from '../services/config.service';
import { isLoggedIn } from '../services/auth.service';

/**
 * Loads config and verifies the user is authenticated.
 * Exits with code 1 and a friendly message if not logged in.
 */
export async function requireAuth(): Promise<ForgeConfig> {
  const config = await ConfigService.load();

  if (!isLoggedIn(config)) {
    console.error(chalk.red('Not logged in. Run `forge login` first.'));
    process.exit(1);
  }

  return config!;
}
