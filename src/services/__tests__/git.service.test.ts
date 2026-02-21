import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBranchLocal = vi.fn();
const mockStatus = vi.fn();
const mockRaw = vi.fn();

vi.mock('simple-git', () => ({
  default: vi.fn(() => ({
    branchLocal: mockBranchLocal,
    status: mockStatus,
    raw: mockRaw,
  })),
}));

import { GitService } from '../git.service';

describe('GitService', () => {
  let git: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    git = new GitService('/repo');
  });

  describe('getBranch()', () => {
    it('returns the current branch name', async () => {
      mockBranchLocal.mockResolvedValue({ current: 'main' });

      const branch = await git.getBranch();

      expect(branch).toBe('main');
    });

    it('propagates errors from simple-git', async () => {
      mockBranchLocal.mockRejectedValue(
        new Error('fatal: not a git repository')
      );

      await expect(git.getBranch()).rejects.toThrow('fatal: not a git repository');
    });
  });

  describe('getStatus()', () => {
    it('returns mapped status with modified, untracked, and staged', async () => {
      mockStatus.mockResolvedValue({
        modified: ['src/auth.ts'],
        not_added: ['src/new.ts'],
        staged: ['src/committed.ts'],
      });

      const status = await git.getStatus();

      expect(status).toEqual({
        modified: ['src/auth.ts'],
        untracked: ['src/new.ts'],
        staged: ['src/committed.ts'],
      });
    });

    it('returns empty arrays when working tree is clean', async () => {
      mockStatus.mockResolvedValue({
        modified: [],
        not_added: [],
        staged: [],
      });

      const status = await git.getStatus();

      expect(status).toEqual({ modified: [], untracked: [], staged: [] });
    });
  });

  describe('getFileTree()', () => {
    it('returns newline-joined file paths', async () => {
      mockRaw.mockResolvedValue('src/a.ts\nsrc/b.ts\nsrc/c.ts\n');

      const tree = await git.getFileTree();

      expect(tree).toBe('src/a.ts\nsrc/b.ts\nsrc/c.ts');
    });

    it('truncates output to 200 lines', async () => {
      const lines = Array.from({ length: 250 }, (_, i) => `src/file${i}.ts`);
      mockRaw.mockResolvedValue(lines.join('\n') + '\n');

      const tree = await git.getFileTree();

      const resultLines = tree.split('\n');
      expect(resultLines).toHaveLength(200);
      expect(resultLines[0]).toBe('src/file0.ts');
      expect(resultLines[199]).toBe('src/file199.ts');
    });

    it('calls simple-git raw with correct ls-tree arguments', async () => {
      mockRaw.mockResolvedValue('src/a.ts\n');

      await git.getFileTree();

      expect(mockRaw).toHaveBeenCalledWith([
        'ls-tree',
        '--name-only',
        '-r',
        'HEAD',
      ]);
    });
  });
});
