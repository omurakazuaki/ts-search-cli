import * as fs from 'fs/promises';
import { glob } from 'glob';
import ignore from 'ignore';
import * as path from 'path';
import * as ts from 'typescript';

export class ProjectFileScanner {
  async scan(rootPath: string): Promise<string[]> {
    // Force project loading by opening ALL source files
    // This ensures that even files excluded in tsconfig.json are loaded by the LSP
    let scanDir = rootPath;
    try {
      const configPath = ts.findConfigFile(rootPath, ts.sys.fileExists, 'tsconfig.json');
      if (configPath) {
        const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
        if (config?.compilerOptions?.rootDir) {
          scanDir = path.resolve(rootPath, config.compilerOptions.rootDir);
        }
      }
    } catch (error) {
      console.warn('Failed to read tsconfig.json, scanning project root:', error);
    }

    // Read all .gitignore files
    const ig = ignore();
    try {
      const gitignoreFiles = await glob('**/.gitignore', {
        cwd: rootPath,
        ignore: 'node_modules/**',
      });

      // Sort by path length to process root first (though ignore package handles order)
      gitignoreFiles.sort((a, b) => a.length - b.length);

      for (const gitignoreFile of gitignoreFiles) {
        const gitignorePath = path.join(rootPath, gitignoreFile);
        const gitignoreDir = path.dirname(gitignoreFile);
        const content = await fs.readFile(gitignorePath, 'utf-8');

        if (gitignoreDir === '.') {
          ig.add(content);
        } else {
          const lines = content.split(/\r?\n/);
          const prefixedLines = lines.map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;

            const isNegated = trimmed.startsWith('!');
            const pattern = isNegated ? trimmed.slice(1) : trimmed;

            // Handle root-relative patterns (starting with /)
            const isRootRelative = pattern.startsWith('/');
            const cleanPattern = isRootRelative ? pattern.slice(1) : pattern;

            // Join with directory
            // Note: ignore package expects forward slashes
            const prefixed = path.posix.join(gitignoreDir.split(path.sep).join('/'), cleanPattern);

            return isNegated ? `!${prefixed}` : prefixed;
          });
          ig.add(prefixedLines);
        }
      }
    } catch (e) {
      console.warn('Failed to process .gitignore files:', e);
    }

    return this.findAllTsFiles(scanDir, ig, rootPath);
  }

  private async findAllTsFiles(
    dir: string,
    ig?: ReturnType<typeof ignore>,
    rootPath?: string,
  ): Promise<string[]> {
    let results: string[] = [];
    try {
      const list = await fs.readdir(dir);
      for (const file of list) {
        const filePath = path.join(dir, file);

        // Check ignore
        if (ig && rootPath) {
          const relativePath = path.relative(rootPath, filePath);
          if (relativePath && ig.ignores(relativePath)) {
            continue;
          }
        }

        const stat = await fs.stat(filePath);
        if (stat && stat.isDirectory()) {
          if (file !== 'node_modules' && file !== '.git') {
            results = results.concat(await this.findAllTsFiles(filePath, ig, rootPath));
          }
        } else {
          if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            results.push(filePath);
          }
        }
      }
    } catch (e) {
      console.warn(`Failed to read directory ${dir}: ${e}`);
    }
    return results;
  }
}
