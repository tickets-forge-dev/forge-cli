import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

export type McpRegisterResult = 'registered' | 'skipped';

/**
 * Attempts to register Forge as an MCP server with the claude CLI.
 * Returns 'registered' on success, 'skipped' if the claude CLI is not found
 * or the command fails for any reason.
 *
 * Never throws — callers can wrap in try/catch for extra safety.
 */
export async function tryRegisterMcpServer(
  scope: 'user' | 'project'
): Promise<McpRegisterResult> {
  const cmd = `claude mcp add --transport stdio --scope ${scope} forge -- forge mcp`;
  try {
    execSync(cmd, { stdio: 'pipe' });
    return 'registered';
  } catch {
    // ENOENT (claude not found) or non-zero exit code → skip silently
    return 'skipped';
  }
}

interface McpJsonConfig {
  mcpServers: Record<string, {
    type: string;
    command: string;
    args: string[];
  }>;
  [key: string]: unknown;
}

/**
 * Writes (or merges) a .mcp.json file in the given directory with the forge
 * MCP server entry. Existing entries are preserved.
 */
export async function writeMcpJson(cwd: string = process.cwd()): Promise<void> {
  const mcpJsonPath = path.join(cwd, '.mcp.json');

  let existing: McpJsonConfig = { mcpServers: {} };
  try {
    const raw = await fs.readFile(mcpJsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as McpJsonConfig;
    existing = parsed;
    if (!existing.mcpServers) {
      existing.mcpServers = {};
    }
  } catch {
    // File doesn't exist or is unreadable — start fresh
  }

  const merged: McpJsonConfig = {
    ...existing,
    mcpServers: {
      ...existing.mcpServers,
      forge: {
        type: 'stdio',
        command: 'forge',
        args: ['mcp'],
      },
    },
  };

  await fs.writeFile(mcpJsonPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}
