import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs/promises';
import { execFile } from 'child_process';
import * as ConfigService from '../services/config.service';
import { isLoggedIn } from '../services/auth.service';
import { API_URL } from '../config';

interface Check {
  label: string;
  run: () => Promise<{ ok: boolean; detail: string }>;
}

const PASS = chalk.green('PASS');
const FAIL = chalk.red('FAIL');

const checks: Check[] = [
  {
    label: 'Config file exists',
    run: async () => {
      try {
        await fs.access(ConfigService.getConfigPath());
        return { ok: true, detail: ConfigService.getConfigPath() };
      } catch {
        return {
          ok: false,
          detail: `Not found. Run ${chalk.bold('forge login')} to create it.`,
        };
      }
    },
  },
  {
    label: 'Authenticated',
    run: async () => {
      const config = await ConfigService.load();
      if (isLoggedIn(config)) {
        return { ok: true, detail: config!.user.email };
      }
      return {
        ok: false,
        detail: `No valid credentials. Run ${chalk.bold('forge login')}.`,
      };
    },
  },
  {
    label: 'API reachable',
    run: async () => {
      try {
        const res = await fetch(`${API_URL}/health`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok) return { ok: true, detail: API_URL };
        return {
          ok: false,
          detail: `Server returned ${res.status}. Check https://status.forge-ai.dev.`,
        };
      } catch {
        return {
          ok: false,
          detail: `Cannot reach ${API_URL}. Check your internet connection.`,
        };
      }
    },
  },
  {
    label: 'Token not expired',
    run: async () => {
      const config = await ConfigService.load();
      if (!config) {
        return { ok: false, detail: 'No config file.' };
      }
      const expired = new Date(config.expiresAt) < new Date();
      if (!expired) return { ok: true, detail: `Expires ${config.expiresAt}` };
      return {
        ok: false,
        detail: `Expired at ${config.expiresAt}. Token will auto-refresh on next API call, or run ${chalk.bold('forge login')}.`,
      };
    },
  },
  {
    label: 'Claude CLI installed',
    run: () =>
      new Promise((resolve) => {
        execFile('claude', ['--version'], (err, stdout) => {
          if (err) {
            resolve({
              ok: false,
              detail: `Not found. Install from https://docs.anthropic.com/en/docs/claude-code.`,
            });
          } else {
            resolve({ ok: true, detail: stdout.trim() });
          }
        });
      }),
  },
  {
    label: 'MCP server registered',
    run: async () => {
      try {
        await fs.access('.mcp.json');
        const raw = await fs.readFile('.mcp.json', 'utf-8');
        const json = JSON.parse(raw);
        if (json?.mcpServers?.forge) {
          return { ok: true, detail: '.mcp.json contains forge entry' };
        }
        return {
          ok: false,
          detail: `.mcp.json exists but missing forge entry. Run ${chalk.bold('forge mcp install')}.`,
        };
      } catch {
        return {
          ok: false,
          detail: `No .mcp.json found. Run ${chalk.bold('forge mcp install')} in your project root.`,
        };
      }
    },
  },
];

export const doctorCommand = new Command('doctor')
  .description('Run diagnostic checks on your Forge CLI setup')
  .action(async () => {
    console.log();
    console.log(chalk.bold('forge doctor'));
    console.log(chalk.dim('─'.repeat(50)));
    console.log();

    let allPassed = true;

    for (const check of checks) {
      const result = await check.run();
      const badge = result.ok ? PASS : FAIL;
      console.log(`  ${badge}  ${check.label}`);
      console.log(`         ${chalk.dim(result.detail)}`);
      if (!result.ok) allPassed = false;
    }

    console.log();
    if (allPassed) {
      console.log(chalk.green('All checks passed. You are good to go.'));
    } else {
      console.log(
        chalk.yellow('Some checks failed. Follow the instructions above to fix them.')
      );
    }
    console.log();

    process.exit(allPassed ? 0 : 1);
  });
