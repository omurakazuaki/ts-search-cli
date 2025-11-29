import ignore from 'ignore';
import * as path from 'path';
import * as ts from 'typescript';
import * as rpc from 'vscode-jsonrpc/node';
import * as lsp from 'vscode-languageserver-protocol';
import { LocationRef, SymbolInfo } from '../../domain/entities';
import { LspProcessManager } from '../../infrastructure/lsp/LspProcessManager';
import { ILspRepository } from '../../usecases/ports/ILspRepository';

import * as fs from 'fs/promises';

export class LspRepository implements ILspRepository {
  private connection: rpc.MessageConnection | null = null;

  constructor(private readonly processManager: LspProcessManager) {}

  async initialize(): Promise<void> {
    this.processManager.start();

    this.connection = rpc.createMessageConnection(
      new rpc.StreamMessageReader(this.processManager.stdout),
      new rpc.StreamMessageWriter(this.processManager.stdin),
    );

    this.connection.listen();

    // Handle progress creation request
    this.connection.onRequest('window/workDoneProgress/create', () => null);

    // Track project loading progress
    let loadingPromiseResolver: () => void;
    const loadingPromise = new Promise<void>((resolve) => {
      loadingPromiseResolver = resolve;
    });

    let initToken: string | number | null = null;
    let hasStarted = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.onNotification('$/progress', (params: any) => {
      if (params.value.kind === 'begin' && params.value.title.includes('Initializing JS/TS')) {
        initToken = params.token;
        hasStarted = true;
      }
      if (params.value.kind === 'end' && params.token === initToken) {
        loadingPromiseResolver();
      }
    });

    const rootPath = path.resolve(process.cwd());
    const initParams: lsp.InitializeParams = {
      processId: process.pid,
      rootUri: `file://${rootPath}`,
      capabilities: {
        textDocument: {
          definition: { dynamicRegistration: false },
          references: { dynamicRegistration: false },
          documentSymbol: {
            dynamicRegistration: false,
            hierarchicalDocumentSymbolSupport: true,
          },
          foldingRange: { dynamicRegistration: false },
        },
        workspace: {
          symbol: { dynamicRegistration: false },
        },
        window: {
          workDoneProgress: true,
        },
      },
      workspaceFolders: [
        {
          uri: `file://${rootPath}`,
          name: 'root',
        },
      ],
    };

    await this.connection.sendRequest('initialize', initParams);
    await this.connection.sendNotification('initialized', {});

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

    // Read .gitignore
    const ig = ignore();
    try {
      const gitignorePath = path.join(rootPath, '.gitignore');
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
      ig.add(gitignoreContent);
    } catch {
      // ignore if .gitignore doesn't exist
    }

    const allTsFiles = await this.findAllTsFiles(scanDir, ig, rootPath);

    if (allTsFiles.length > 0) {
      // Open all files to force LSP to acknowledge them
      for (const file of allTsFiles) {
        await this.openDocument(file);
      }

      // Warm-up: Request document symbols for the first file
      const absPath = path.resolve(allTsFiles[0]);
      const uri = `file://${absPath}`;
      try {
        await this.connection.sendRequest('textDocument/documentSymbol', {
          textDocument: { uri },
        });
      } catch {
        // Ignore warm-up errors
      }

      // Wait for loading to complete if it started
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (hasStarted) {
        console.log('Waiting for project indexing to complete...');
        const timeout = new Promise((resolve) => setTimeout(resolve, 30000));
        await Promise.race([loadingPromise, timeout]);
        console.log('Project indexing completed or timed out.');
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
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

  async shutdown(): Promise<void> {
    if (this.connection) {
      this.connection.dispose();
      this.connection = null;
    }
    this.processManager.stop();
  }

  async getDocumentSymbols(filePath: string): Promise<SymbolInfo[]> {
    this.ensureConnected();

    await this.openDocument(filePath);
    const absPath = path.resolve(filePath);
    const uri = `file://${absPath}`;

    const params: lsp.DocumentSymbolParams = {
      textDocument: { uri },
    };

    const result = await this.connection!.sendRequest<
      lsp.DocumentSymbol[] | lsp.SymbolInformation[]
    >('textDocument/documentSymbol', params);

    if (!result) return [];

    // Handle both DocumentSymbol[] and SymbolInformation[]
    if (result.length > 0 && 'range' in result[0] && 'selectionRange' in result[0]) {
      return (result as lsp.DocumentSymbol[]).map((s) => this.mapDocumentSymbol(s, filePath));
    }

    return [];
  }

  async getWorkspaceSymbols(query: string): Promise<LocationRef[]> {
    this.ensureConnected();

    const params: lsp.WorkspaceSymbolParams = { query };
    const result = await this.connection!.sendRequest<lsp.SymbolInformation[]>(
      'workspace/symbol',
      params,
    );

    if (!result) return [];

    return (result as lsp.SymbolInformation[]).map((s) => this.mapSymbolInformation(s));
  }

  async getReferences(filePath: string, line: number, character: number): Promise<LocationRef[]> {
    this.ensureConnected();
    const uri = `file://${path.resolve(filePath)}`;

    const params: lsp.ReferenceParams = {
      textDocument: { uri },
      position: { line: line - 1, character: character - 1 }, // LSP is 0-based
      context: { includeDeclaration: true },
    };

    const result = await this.connection!.sendRequest<lsp.Location[]>(
      'textDocument/references',
      params,
    );

    if (!result) return [];

    return result.map((l) => this.mapLocation(l));
  }

  async getDefinition(filePath: string, line: number, character: number): Promise<LocationRef[]> {
    this.ensureConnected();
    const uri = `file://${path.resolve(filePath)}`;

    const params: lsp.DefinitionParams = {
      textDocument: { uri },
      position: { line: line - 1, character: character - 1 },
    };

    const result = await this.connection!.sendRequest<
      lsp.Location | lsp.Location[] | lsp.LocationLink[]
    >('textDocument/definition', params);

    if (!result) return [];

    const locations = Array.isArray(result) ? result : [result];
    // Filter out LocationLink for now or handle it
    const simpleLocations = locations.filter((l): l is lsp.Location => 'uri' in l);

    return simpleLocations.map((l) => this.mapLocation(l));
  }

  async getFoldingRanges(filePath: string): Promise<{ startLine: number; endLine: number }[]> {
    this.ensureConnected();
    await this.openDocument(filePath);
    const uri = `file://${path.resolve(filePath)}`;

    const params: lsp.FoldingRangeParams = {
      textDocument: { uri },
    };

    const result = await this.connection!.sendRequest<lsp.FoldingRange[]>(
      'textDocument/foldingRange',
      params,
    );

    if (!result) return [];

    return result.map((r) => ({
      startLine: r.startLine + 1, // Convert to 1-based
      endLine: r.endLine + 1,
    }));
  }

  private async openDocument(filePath: string): Promise<void> {
    const absPath = path.resolve(filePath);
    const uri = `file://${absPath}`;
    const text = await fs.readFile(absPath, 'utf-8');

    await this.connection!.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'typescript',
        version: 1,
        text,
      },
    });
  }

  private ensureConnected() {
    if (!this.connection) {
      throw new Error('LSP connection not initialized');
    }
  }

  private mapDocumentSymbol(symbol: lsp.DocumentSymbol, filePath: string): SymbolInfo {
    const kindString = Object.keys(lsp.SymbolKind).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (key) => (lsp.SymbolKind as any)[key] === symbol.kind,
    );
    // Create ID based on selectionRange (the identifier)
    const relativePath = path.relative(process.cwd(), filePath);
    const id = `${relativePath}::${symbol.selectionRange.start.line + 1}::${symbol.selectionRange.start.character + 1}`;

    return {
      id,
      name: symbol.name,
      kind: kindString || 'Unknown',
      line: symbol.range.start.line + 1,
      range: {
        start: {
          line: symbol.range.start.line + 1,
          character: symbol.range.start.character + 1,
        },
        end: {
          line: symbol.range.end.line + 1,
          character: symbol.range.end.character + 1,
        },
      },
      selectionRange: {
        start: {
          line: symbol.selectionRange.start.line + 1,
          character: symbol.selectionRange.start.character + 1,
        },
        end: {
          line: symbol.selectionRange.end.line + 1,
          character: symbol.selectionRange.end.character + 1,
        },
      },
      children: symbol.children?.map((c) => this.mapDocumentSymbol(c, filePath)),
    };
  }

  private mapSymbolInformation(symbol: lsp.SymbolInformation): LocationRef {
    const kindString = Object.keys(lsp.SymbolKind).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (key) => (lsp.SymbolKind as any)[key] === symbol.kind,
    );
    return {
      id: this.createId(symbol.location),
      filePath: this.uriToPath(symbol.location.uri),
      line: symbol.location.range.start.line + 1,
      character: symbol.location.range.start.character + 1,
      kind: kindString || 'Unknown',
      preview: symbol.name, // Use name as preview for now
    };
  }

  private mapLocation(location: lsp.Location): LocationRef {
    return {
      id: this.createId(location),
      filePath: this.uriToPath(location.uri),
      line: location.range.start.line + 1,
      character: location.range.start.character + 1,
      kind: 'Reference', // We don't know the kind from just a Location
      preview: '', // We can't get preview without reading file
    };
  }

  private createId(location: lsp.Location): string {
    const filePath = this.uriToPath(location.uri);
    const relativePath = path.relative(process.cwd(), filePath);
    const line = location.range.start.line + 1;
    const character = location.range.start.character + 1;
    return `${relativePath}::${line}::${character}`;
  }

  private uriToPath(uri: string): string {
    return uri.replace('file://', '');
  }
}
