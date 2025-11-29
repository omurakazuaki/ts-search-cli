import { LocationRef, SymbolInfo } from '../domain/entities';
import { SymbolNotFoundError } from '../domain/errors';
import { ILspRepository } from './ports/ILspRepository';

export interface FindSymbolResult {
  definition: LocationRef;
  references: LocationRef[];
}

export class FindSymbolUseCase {
  constructor(private readonly lspRepo: ILspRepository) {}

  async execute(query: string): Promise<FindSymbolResult> {
    let candidates = await this.lspRepo.getWorkspaceSymbols(query);

    if (candidates.length === 0) {
      // Retry once after a short delay, in case the server is warming up
      await new Promise((resolve) => setTimeout(resolve, 1000));
      candidates = await this.lspRepo.getWorkspaceSymbols(query);
    }

    if (candidates.length === 0) {
      throw new SymbolNotFoundError(query);
    }

    // v1: Pick the first candidate
    const target = candidates[0];

    // Step 2: Refine position using Document Symbols
    const preciseLocation = await this.refinePosition(target);

    // Find references for this symbol
    const references = await this.lspRepo.getReferences(
      preciseLocation.filePath,
      preciseLocation.line,
      preciseLocation.character,
    );

    return {
      definition: target,
      references,
    };
  }

  private async refinePosition(
    location: LocationRef,
  ): Promise<{ filePath: string; line: number; character: number }> {
    try {
      const symbols = await this.lspRepo.getDocumentSymbols(location.filePath);
      const match = this.findSymbolInTree(symbols, location.preview, location.line);

      if (match && match.selectionRange) {
        return {
          filePath: location.filePath,
          line: match.selectionRange.start.line,
          character: match.selectionRange.start.character,
        };
      }
    } catch (error) {
      // Ignore errors during refinement and fallback to original location
    }
    return location;
  }

  private findSymbolInTree(
    symbols: SymbolInfo[],
    name: string,
    targetLine: number,
  ): SymbolInfo | undefined {
    for (const symbol of symbols) {
      // Check if name matches and the target line is within the symbol's range
      const isNameMatch = symbol.name === name;

      if (isNameMatch) {
        if (symbol.range) {
          if (targetLine >= symbol.range.start.line && targetLine <= symbol.range.end.line) {
            return symbol;
          }
        } else {
          return symbol;
        }
      }

      if (symbol.children) {
        const found = this.findSymbolInTree(symbol.children, name, targetLine);
        if (found) return found;
      }
    }
    return undefined;
  }
}
