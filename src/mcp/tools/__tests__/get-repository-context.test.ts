import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetBranch = vi.fn();
const mockGetStatus = vi.fn();
const mockGetFileTree = vi.fn();

vi.mock('../../../services/git.service', () => ({
  // Must use regular function (not arrow) so `new GitService()` works as a constructor
  GitService: vi.fn(function (this: Record<string, unknown>) {
    this.getBranch = mockGetBranch;
    this.getStatus = mockGetStatus;
    this.getFileTree = mockGetFileTree;
  }),
}));

import { GitService } from '../../../services/git.service';
import {
  handleGetRepositoryContext,
  getRepositoryContextToolDefinition,
} from '../get-repository-context';
import type { ForgeConfig } from '../../../services/config.service';

const mockConfig: ForgeConfig = {
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  userId: 'user-1',
  teamId: 'team-1',
  user: { email: 'dev@example.com', displayName: 'Dev' },
};

const mockGitResult = {
  branch: 'main',
  status: {
    modified: ['src/auth.ts'],
    untracked: ['src/new.ts'],
    staged: [],
  },
  fileTree: 'src/a.ts\nsrc/b.ts',
};

describe('getRepositoryContextToolDefinition', () => {
  it('has the correct tool name', () => {
    expect(getRepositoryContextToolDefinition.name).toBe('get_repository_context');
  });

  it('does not require any fields in input schema', () => {
    expect(getRepositoryContextToolDefinition.inputSchema.required).toHaveLength(0);
  });

  it('has an optional path property in the schema', () => {
    expect(getRepositoryContextToolDefinition.inputSchema.properties).toHaveProperty('path');
  });

  it('has a description', () => {
    expect(getRepositoryContextToolDefinition.description.length).toBeGreaterThan(0);
  });
});

describe('handleGetRepositoryContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBranch.mockResolvedValue(mockGitResult.branch);
    mockGetStatus.mockResolvedValue(mockGitResult.status);
    mockGetFileTree.mockResolvedValue(mockGitResult.fileTree);
  });

  describe('success path', () => {
    it('returns correct JSON shape with branch, workingDirectory, status, fileTree', async () => {
      const result = await handleGetRepositoryContext(
        { path: '/my/repo' },
        mockConfig
      );

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.branch).toBe('main');
      expect(parsed.workingDirectory).toBe('/my/repo');
      expect(parsed.status).toEqual(mockGitResult.status);
      expect(parsed.fileTree).toBe(mockGitResult.fileTree);
    });

    it('instantiates GitService with the provided path', async () => {
      await handleGetRepositoryContext({ path: '/custom/path' }, mockConfig);

      expect(vi.mocked(GitService)).toHaveBeenCalledWith('/custom/path');
    });

    it('defaults workingDirectory to process.cwd() when path not provided', async () => {
      const result = await handleGetRepositoryContext({}, mockConfig);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.workingDirectory).toBe(process.cwd());
      expect(vi.mocked(GitService)).toHaveBeenCalledWith(process.cwd());
    });

    it('defaults to process.cwd() when path is empty string', async () => {
      const result = await handleGetRepositoryContext({ path: '' }, mockConfig);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.workingDirectory).toBe(process.cwd());
    });

    it('defaults to process.cwd() when path is whitespace only', async () => {
      const result = await handleGetRepositoryContext({ path: '   ' }, mockConfig);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.workingDirectory).toBe(process.cwd());
    });
  });

  describe('error paths', () => {
    it('returns structured { error: "Not a git repository" } for non-git directory', async () => {
      mockGetBranch.mockRejectedValue(
        new Error('fatal: not a git repository (or any of the parent directories): .git')
      );

      const result = await handleGetRepositoryContext({ path: '/tmp/not-a-repo' }, mockConfig);

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('Not a git repository');
    });

    it('returns structured error for ENOENT (path does not exist)', async () => {
      mockGetBranch.mockRejectedValue(
        new Error('ENOENT: no such file or directory')
      );

      const result = await handleGetRepositoryContext({ path: '/nonexistent' }, mockConfig);

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('Not a git repository');
    });

    it('returns raw error message for unexpected errors', async () => {
      mockGetBranch.mockRejectedValue(new Error('Unexpected git failure'));

      const result = await handleGetRepositoryContext({ path: '/my/repo' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Unexpected git failure');
    });
  });
});
