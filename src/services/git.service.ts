import simpleGit from 'simple-git';

export interface GitStatus {
  modified: string[];
  untracked: string[];
  staged: string[];
}

/**
 * Thin wrapper around simple-git for reading repository context.
 * All methods propagate errors — callers are responsible for handling
 * non-git directory errors.
 */
export class GitService {
  constructor(private repoPath: string) {}

  async getBranch(): Promise<string> {
    const result = await simpleGit(this.repoPath).branchLocal();
    return result.current;
  }

  async getStatus(): Promise<GitStatus> {
    const result = await simpleGit(this.repoPath).status();
    return {
      modified: result.modified,
      untracked: result.not_added, // simple-git uses 'not_added' for untracked files
      staged: result.staged,
    };
  }

  async getFileTree(): Promise<string> {
    const raw = await simpleGit(this.repoPath).raw([
      'ls-tree',
      '--name-only',
      '-r',
      'HEAD',
    ]);
    const lines = raw.split('\n').filter(Boolean);
    return lines.slice(0, 200).join('\n');
  }
}
