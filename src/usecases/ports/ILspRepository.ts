import { LocationRef, SymbolInfo } from '../../domain/entities';

export interface ILspRepository {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  getDocumentSymbols(filePath: string): Promise<SymbolInfo[]>;
  getWorkspaceSymbols(query: string): Promise<LocationRef[]>;

  getReferences(filePath: string, line: number, character: number): Promise<LocationRef[]>;
  getDefinition(filePath: string, line: number, character: number): Promise<LocationRef[]>;

  getFoldingRanges(filePath: string): Promise<{ startLine: number; endLine: number }[]>;
}
