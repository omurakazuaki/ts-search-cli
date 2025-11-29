import * as fs from 'fs/promises';
import { glob } from 'glob';
import * as path from 'path';
import * as ts from 'typescript';
import { ProjectFileScanner } from './ProjectFileScanner';

jest.mock('fs/promises');
jest.mock('glob');
jest.mock('typescript', () => ({
  findConfigFile: jest.fn(),
  readConfigFile: jest.fn(),
  sys: {
    fileExists: jest.fn(),
    readFile: jest.fn(),
  },
}));

describe('ProjectFileScanner', () => {
  let scanner: ProjectFileScanner;
  const rootPath = '/root';

  beforeEach(() => {
    scanner = new ProjectFileScanner();
    jest.clearAllMocks();
  });

  describe('scan', () => {
    it('should scan files respecting tsconfig.json rootDir', async () => {
      // Mock tsconfig
      (ts.findConfigFile as jest.Mock).mockReturnValue('/root/tsconfig.json');
      (ts.readConfigFile as jest.Mock).mockReturnValue({
        config: { compilerOptions: { rootDir: 'src' } },
      });

      // Mock gitignore
      (glob as unknown as jest.Mock).mockResolvedValue([]);

      // Mock fs.readdir and stat
      (fs.readdir as jest.Mock).mockResolvedValue(['file.ts']);
      (fs.stat as jest.Mock).mockResolvedValue({ isDirectory: () => false });

      const result = await scanner.scan(rootPath);

      expect(ts.findConfigFile).toHaveBeenCalledWith(
        rootPath,
        expect.any(Function),
        'tsconfig.json',
      );
      expect(fs.readdir).toHaveBeenCalledWith(path.resolve(rootPath, 'src'));
      expect(result).toEqual([path.resolve(rootPath, 'src/file.ts')]);
    });

    it('should fallback to root if tsconfig has no rootDir', async () => {
      (ts.findConfigFile as jest.Mock).mockReturnValue('/root/tsconfig.json');
      (ts.readConfigFile as jest.Mock).mockReturnValue({
        config: { compilerOptions: {} },
      });
      (glob as unknown as jest.Mock).mockResolvedValue([]);
      (fs.readdir as jest.Mock).mockResolvedValue(['file.ts']);
      (fs.stat as jest.Mock).mockResolvedValue({ isDirectory: () => false });

      const result = await scanner.scan(rootPath);

      expect(fs.readdir).toHaveBeenCalledWith(rootPath);
      expect(result).toEqual([path.resolve(rootPath, 'file.ts')]);
    });

    it('should handle gitignore files', async () => {
      (ts.findConfigFile as jest.Mock).mockReturnValue(undefined);
      (glob as unknown as jest.Mock).mockResolvedValue(['.gitignore']);
      (fs.readFile as jest.Mock).mockResolvedValue('ignored.ts');

      (fs.readdir as jest.Mock).mockResolvedValue(['file.ts', 'ignored.ts']);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (fs.stat as jest.Mock).mockImplementation(async (_p) => ({
        isDirectory: () => false,
      }));

      const result = await scanner.scan(rootPath);

      expect(result).toEqual([path.resolve(rootPath, 'file.ts')]);
    });

    it('should handle nested gitignore files', async () => {
      (ts.findConfigFile as jest.Mock).mockReturnValue(undefined);
      (glob as unknown as jest.Mock).mockResolvedValue(['src/.gitignore']);
      (fs.readFile as jest.Mock).mockResolvedValue('ignored.ts');

      // Mock directory structure:
      // /root
      //   src/
      //     file.ts
      //     ignored.ts
      (fs.readdir as jest.Mock).mockImplementation(async (dir) => {
        if (dir === rootPath) return ['src'];
        if (dir === path.join(rootPath, 'src')) return ['file.ts', 'ignored.ts'];
        return [];
      });

      (fs.stat as jest.Mock).mockImplementation(async (p) => ({
        isDirectory: () => p === path.join(rootPath, 'src'),
      }));

      const result = await scanner.scan(rootPath);

      expect(result).toEqual([path.resolve(rootPath, 'src/file.ts')]);
    });

    it('should recursively scan directories', async () => {
      (ts.findConfigFile as jest.Mock).mockReturnValue(undefined);
      (glob as unknown as jest.Mock).mockResolvedValue([]);

      (fs.readdir as jest.Mock).mockImplementation(async (dir) => {
        if (dir === rootPath) return ['src', 'root.ts'];
        if (dir === path.join(rootPath, 'src')) return ['child.ts'];
        return [];
      });

      (fs.stat as jest.Mock).mockImplementation(async (p) => ({
        isDirectory: () => !p.endsWith('.ts'),
      }));

      const result = await scanner.scan(rootPath);

      expect(result).toContain(path.resolve(rootPath, 'root.ts'));
      expect(result).toContain(path.resolve(rootPath, 'src/child.ts'));
    });

    it('should ignore node_modules and .git', async () => {
      (ts.findConfigFile as jest.Mock).mockReturnValue(undefined);
      (glob as unknown as jest.Mock).mockResolvedValue([]);

      (fs.readdir as jest.Mock).mockResolvedValue(['node_modules', '.git', 'file.ts']);
      (fs.stat as jest.Mock).mockImplementation(async (p) => ({
        isDirectory: () => !p.endsWith('.ts'),
      }));

      const result = await scanner.scan(rootPath);

      expect(result).toEqual([path.resolve(rootPath, 'file.ts')]);
      // Should not have recursed into node_modules or .git
      expect(fs.readdir).toHaveBeenCalledTimes(1);
    });
  });
});
