import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as ConfigService from '../services/config.service';
import * as AuthService from '../services/auth.service';

export const loginCommand = new Command('login')
  .description('Authenticate with your Forge account')
  .action(async () => {
    try {
      // Check if already logged in
      const existing = await ConfigService.load();
      if (AuthService.isLoggedIn(existing)) {
        console.log(
          chalk.yellow(
            `You are already logged in as ${existing!.user.email}. Run \`forge logout\` first.`
          )
        );
        process.exit(0);
      }

      // Initiate Device Flow
      const deviceFlow = await AuthService.startDeviceFlow();

      console.log();
      console.log(chalk.bold('Open this URL in your browser:'));
      console.log(chalk.cyan(`  ${deviceFlow.verificationUri}`));
      console.log();
      console.log(chalk.bold('Enter this code:'));
      console.log(chalk.green.bold(`  ${deviceFlow.userCode}`));
      console.log();

      const spinner = ora('Waiting for authorization…').start();

      // Handle Ctrl+C — exit cleanly without writing partial config
      process.on('SIGINT', () => {
        spinner.stop();
        console.log('\nCancelled.');
        process.exit(0);
      });

      // Poll for token
      let token;
      try {
        token = await AuthService.pollToken(
          deviceFlow.deviceCode,
          deviceFlow.interval
        );
      } catch (err) {
        spinner.fail('Authorization failed.');
        console.error(chalk.red((err as Error).message));
        process.exit(1);
      }

      // Save tokens — only reached after successful polling
      await ConfigService.save({
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        userId: token.userId,
        teamId: token.teamId,
        user: token.user,
      });

      spinner.succeed(
        `${chalk.green('Logged in as')} ${chalk.bold(token.user.email)} | Team: ${chalk.bold(token.teamId)}`
      );
      process.exit(0);
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });
