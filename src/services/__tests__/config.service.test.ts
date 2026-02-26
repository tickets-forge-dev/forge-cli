import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';

// Mock fs/promises before importing the module under test
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  chmod: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
  stat: vi.fn(),
}));

// Mock os to return a predictable homedir
vi.mock('os', () => ({
  homedir: () => '/home/testuser',
}));

import * as fs from 'fs/promises';
import { load, save, clear, getConfigPath, type ForgeConfig } from '../config.service';

const expectedConfigDir = path.join('/home/testuser', '.forge');
const expectedConfigPath = path.join('/home/testuser', '.forge', 'config.json');

const validConfig: ForgeConfig = {
  accessToken: 'access-token-abc',
  refreshToken: 'refresh-token-xyz',
  expiresAt: '2026-02-20T12:00:00.000Z',
  userId: 'user-123',
  teamId: 'team-456',
  user: {
    email: 'dev@example.com',
    displayName: 'Dev User',
  },
};

describe('config.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getConfigPath', () => {
    it('returns ~/.forge/config.json path', () => {
      expect(getConfigPath()).toBe(expectedConfigPath);
    });
  });

  describe('load', () => {
    it('returns null when config file does not exist', async () => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      vi.mocked(fs.readFile).mockRejectedValue(err);

      const result = await load();
      expect(result).toBeNull();
    });

    it('returns parsed config when file is valid', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(validConfig) as any);
      vi.mocked(fs.stat).mockResolvedValue({ mode: 0o100600 } as unknown as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);

      const result = await load();
      expect(result).toEqual(validConfig);
    });

    it('throws a clear error when file is malformed JSON', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(fs.readFile).mockResolvedValue('{ bad json :::' as any);

      await expect(load()).rejects.toThrow('malformed');
    });

    it('throws a clear error when config fails schema validation', async () => {
      const corrupt = { accessToken: 'tok', missing: 'fields' };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(corrupt) as any);

      await expect(load()).rejects.toThrow('corrupt or invalid');
    });

    it('re-throws non-ENOENT file errors', async () => {
      const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
      vi.mocked(fs.readFile).mockRejectedValue(err);

      await expect(load()).rejects.toThrow('EACCES');
    });
  });

  describe('save', () => {
    it('creates directory and writes JSON', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.chmod).mockResolvedValue(undefined);

      await save(validConfig);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expectedConfigDir,
        { recursive: true }
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expectedConfigPath,
        JSON.stringify(validConfig, null, 2),
        'utf-8'
      );
    });

    it('sets chmod 600 on non-Windows platforms', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.chmod).mockResolvedValue(undefined);

      await save(validConfig);

      expect(fs.chmod).toHaveBeenCalledWith(
        expectedConfigPath,
        0o600
      );

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('skips chmod on Windows', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.chmod).mockResolvedValue(undefined);

      await save(validConfig);

      expect(fs.chmod).not.toHaveBeenCalled();

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('clear', () => {
    it('unlinks the config file', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await clear();
      expect(fs.unlink).toHaveBeenCalledWith(expectedConfigPath);
    });

    it('does not throw if file does not exist (ENOENT)', async () => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      vi.mocked(fs.unlink).mockRejectedValue(err);

      await expect(clear()).resolves.toBeUndefined();
    });

    it('re-throws non-ENOENT errors', async () => {
      const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
      vi.mocked(fs.unlink).mockRejectedValue(err);

      await expect(clear()).rejects.toThrow('EACCES');
    });
  });
});
