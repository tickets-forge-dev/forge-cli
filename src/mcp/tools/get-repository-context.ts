import * as path from 'path';
import * as fs from 'fs';
import type { ForgeConfig } from '../../services/config.service.js';
import { GitService } from '../../services/git.service.js';
import type { ToolResult } from '../types.js';

// MCP tool definition — returned by ListTools so Claude Code can discover it
export const getRepositoryContextToolDefinition = {
  name: 'get_repository_context',
  description:
    'Fetch the current git repository context including active branch, working directory status (modified/untracked/staged files), and a file tree snapshot. Use this to understand the repository state before implementing changes.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description:
          'Absolute path to the repository root. Defaults to the current working directory.',
      },
    },
    required: [],
  },
};

/** Returns true if the error message suggests a non-git directory. */
function isNonGitError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('not a git') ||
    lower.includes('enoent') ||
    lower.includes('fatal') ||
    lower.includes('not a git repository')
  );
}

/**
 * Validates that the requested path is safe to access.
 * Must be within or equal to the current working directory.
 * Resolves symlinks to prevent traversal via symlink chains.
 */
function validatePath(requested: string): string | null {
  const cwd = process.cwd();
  let resolved: string;
  try {
    // Resolve to absolute and normalize (handles .., symlinks, etc.)
    resolved = fs.realpathSync(path.resolve(cwd, requested));
  } catch {
    // Path doesn't exist — let git handle the error naturally
    resolved = path.resolve(cwd, requested);
  }
  const normalizedCwd = path.resolve(cwd);

  // Must be cwd itself or a child of cwd
  if (resolved !== normalizedCwd && !resolved.startsWith(normalizedCwd + path.sep)) {
    return null;
  }
  return resolved;
}

/**
 * Handles the get_repository_context MCP tool call.
 * Reads branch, status, and file tree from the git repository at the given path.
 * Returns a structured error (not a crash) when called outside a git repository.
 * Never throws — all errors are returned as isError content.
 */
export async function handleGetRepositoryContext(
  args: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  config: ForgeConfig
): Promise<ToolResult> {
  const pathArg = args['path'];
  let resolvedPath: string;

  if (typeof pathArg === 'string' && pathArg.trim() !== '') {
    const validated = validatePath(pathArg.trim());
    if (validated === null) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Path must be within the current working directory',
            }),
          },
        ],
        isError: true,
      };
    }
    resolvedPath = validated;
  } else {
    resolvedPath = process.cwd();
  }

  const git = new GitService(resolvedPath);

  try {
    const [branch, status, fileTree] = await Promise.all([
      git.getBranch(),
      git.getStatus(),
      git.getFileTree(),
    ]);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            branch,
            workingDirectory: resolvedPath,
            status,
            fileTree,
          }),
        },
      ],
    };
  } catch (err) {
    const message = (err as Error).message ?? String(err);

    if (isNonGitError(message)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'Not a git repository' }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    };
  }
}
