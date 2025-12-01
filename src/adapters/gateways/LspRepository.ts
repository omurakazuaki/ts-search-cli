import * as path from 'path';
import * as ts from 'typescript';
import * as rpc from 'vscode-jsonrpc/node';
import * as lsp from 'vscode-languageserver-protocol';
import { LocationRef, SymbolInfo } from '../../domain/entities';
import { SymbolId } from '../../domain/SymbolId';
import { LspProcessManager } from '../../infrastructure/lsp/LspProcessManager';
import { ILspRepository } from '../../usecases/ports/ILspRepository';

import * as fs from 'fs/promises';

export class LspRepository implements ILspRepository {
  private connection: rpc.MessageConnection | null = null;
  private readonly openedFiles = new Set<string>();
  private diagnosticResolvers = new Map<string, () => void>();

  constructor(private readonly processManager: LspProcessManager) {}

  async initialize(): Promise<void> {
    this.processManager.start();

    this.connection = rpc.createMessageConnection(
      new rpc.StreamMessageReader(this.processManager.stdout),
      new rpc.StreamMessageWriter(this.processManager.stdin),
    );

    this.connection.listen();

    // Handle diagnostics to track file processing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.onNotification('textDocument/publishDiagnostics', (params: any) => {
      const uri = params.uri;
      const resolver = this.diagnosticResolvers.get(uri);
      if (resolver) {
        resolver();
        this.diagnosticResolvers.delete(uri);
      }
    });

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
      initializationOptions: {
        disableAutomaticTypingAcquisition: true,
      },
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
    await this.connection.sendNotification('workspace/didChangeConfiguration', {
      settings: {},
    });

    if (hasStarted) {
      console.log('Waiting for project indexing to complete...');
      let timeoutId: NodeJS.Timeout;
      const timeout = new Promise<void>((resolve) => {
        timeoutId = setTimeout(() => {
          console.log('Project indexing timed out.');
          resolve();
        }, 300000);
      });

      // Wrap loadingPromise to clear timeout on completion
      const loading = loadingPromise.then(() => {
        clearTimeout(timeoutId);
      });

      await Promise.race([loading, timeout]);
      console.log('Project indexing completed or timed out.');

      // Add a small buffer after indexing to ensure server is fully ready
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else {
      // If no progress started, wait a bit more just in case
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Force a workspace symbol search to trigger any lazy indexing
    try {
      await this.connection.sendRequest('workspace/symbol', { query: 'CliPresenter' });
    } catch {
      // Ignore errors
    }
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
    const fileContent = await fs.readFile(absPath, 'utf-8');

    const params: lsp.DocumentSymbolParams = {
      textDocument: { uri },
    };

    const result = await this.connection!.sendRequest<
      lsp.DocumentSymbol[] | lsp.SymbolInformation[]
    >('textDocument/documentSymbol', params);

    const symbols = this.processLspSymbols(result, filePath);
    const sourceFile = ts.createSourceFile(absPath, fileContent, ts.ScriptTarget.Latest, true);
    const imports = this.getImportSymbols(absPath, sourceFile);
    const instantiations = this.getClassInstantiations(absPath, sourceFile);

    return [...imports, ...symbols, ...instantiations];
  }

  private processLspSymbols(
    result: lsp.DocumentSymbol[] | lsp.SymbolInformation[] | null,
    filePath: string,
  ): SymbolInfo[] {
    if (!result) return [];

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
    await this.openDocument(filePath);
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
    await this.openDocument(filePath);
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
    if (this.openedFiles.has(absPath)) {
      return;
    }

    const uri = `file://${absPath}`;
    const text = await fs.readFile(absPath, 'utf-8');

    // Setup listener for diagnostics
    const diagnosticsPromise = new Promise<void>((resolve) => {
      this.diagnosticResolvers.set(uri, resolve);
      // Set a timeout just in case diagnostics never come
      setTimeout(() => {
        if (this.diagnosticResolvers.has(uri)) {
          this.diagnosticResolvers.delete(uri);
          resolve();
        }
      }, 5000);
    });

    await this.connection!.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'typescript',
        version: 1,
        text,
      },
    });
    this.openedFiles.add(absPath);

    // Wait for diagnostics to ensure server has processed the file
    await diagnosticsPromise;
  }

  private ensureConnected() {
    if (!this.connection) {
      throw new Error('LSP connection not initialized');
    }
  }

  private getImportSymbols(filePath: string, sourceFile: ts.SourceFile): SymbolInfo[] {
    const imports: SymbolInfo[] = [];

    ts.forEachChild(sourceFile, (node) => {
      if (ts.isImportDeclaration(node) && node.importClause) {
        const clause = node.importClause;
        if (clause.name) {
          imports.push(
            this.createSymbolFromNode(
              clause.name,
              clause.name.text,
              filePath,
              sourceFile,
              'Variable',
            ),
          );
        }
        if (clause.namedBindings) {
          if (ts.isNamedImports(clause.namedBindings)) {
            clause.namedBindings.elements.forEach((element) => {
              imports.push(
                this.createSymbolFromNode(
                  element.name,
                  element.name.text,
                  filePath,
                  sourceFile,
                  'Variable',
                ),
              );
            });
          } else if (ts.isNamespaceImport(clause.namedBindings)) {
            imports.push(
              this.createSymbolFromNode(
                clause.namedBindings.name,
                clause.namedBindings.name.text,
                filePath,
                sourceFile,
                'Module',
              ),
            );
          }
        }
      }
    });
    return imports;
  }

  private getClassInstantiations(filePath: string, sourceFile: ts.SourceFile): SymbolInfo[] {
    const instantiations: SymbolInfo[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isNewExpression(node)) {
        const expression = node.expression;
        let name = '';
        if (ts.isIdentifier(expression)) {
          name = expression.text;
        } else if (ts.isPropertyAccessExpression(expression)) {
          name = expression.getText(sourceFile);
        }

        if (name) {
          // Use the identifier node for position if available, otherwise use expression
          const targetNode = ts.isIdentifier(expression) ? expression : expression;
          instantiations.push(
            this.createSymbolFromNode(targetNode, name, filePath, sourceFile, 'Class'),
          );
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return instantiations;
  }

  private createSymbolFromNode(
    node: ts.Node,
    name: string,
    filePath: string,
    sourceFile: ts.SourceFile,
    kind: string,
  ): SymbolInfo {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const relativePath = path.relative(process.cwd(), filePath);
    const id = new SymbolId(relativePath, line + 1, character + 1).toString();

    return {
      id,
      name,
      kind,
      line: line + 1,
      range: {
        start: { line: line + 1, character: character + 1 },
        end: { line: line + 1, character: character + 1 + name.length },
      },
      selectionRange: {
        start: { line: line + 1, character: character + 1 },
        end: { line: line + 1, character: character + 1 + name.length },
      },
    };
  }

  private mapDocumentSymbol(symbol: lsp.DocumentSymbol, filePath: string): SymbolInfo {
    const kindString = Object.keys(lsp.SymbolKind).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (key) => (lsp.SymbolKind as any)[key] === symbol.kind,
    );
    // Create ID based on selectionRange (the identifier)
    const relativePath = path.relative(process.cwd(), filePath);
    const id = new SymbolId(
      relativePath,
      symbol.selectionRange.start.line + 1,
      symbol.selectionRange.start.character + 1,
    ).toString();

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
    return new SymbolId(relativePath, line, character).toString();
  }

  private uriToPath(uri: string): string {
    return uri.replace('file://', '');
  }
}
