import { Command } from 'commander';
import chalk from 'chalk';
import * as ConfigService from '../services/config.service';
import { isLoggedIn } from '../services/auth.service';

export const logoutCommand = new Command('logout')
  .description('Sign out of your Forge account')
  .action(async () => {
    try {
      const config = await ConfigService.load();

      if (!isLoggedIn(config)) {
        console.log(chalk.yellow('You are not logged in.'));
        process.exit(0);
      }

      await ConfigService.clear();
      console.log(chalk.green('Logged out successfully.'));
      process.exit(0);
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });
