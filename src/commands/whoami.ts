import { Command } from 'commander';
import chalk from 'chalk';
import * as ConfigService from '../services/config.service';
import { isLoggedIn } from '../services/auth.service';

export const whoamiCommand = new Command('whoami')
  .description('Show the currently authenticated user')
  .action(async () => {
    try {
      const config = await ConfigService.load();

      if (!isLoggedIn(config)) {
        console.log(chalk.dim('Not logged in. Run `forge login` to authenticate.'));
        process.exit(1);
      }

      const { user, teamId, expiresAt } = config!;
      const expired = new Date(expiresAt) < new Date();

      console.log(`${chalk.bold(user.displayName)} (${user.email})`);
      console.log(`${chalk.dim('Team:')}    ${teamId}`);
      console.log(
        `${chalk.dim('Token:')}   ${expired ? chalk.red('expired') : chalk.green('valid')}`
      );
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });
