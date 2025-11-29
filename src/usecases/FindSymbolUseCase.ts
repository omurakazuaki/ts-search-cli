import { LocationRef } from '../domain/entities';
import { SymbolNotFoundError } from '../domain/errors';
import { ILspRepository } from './ports/ILspRepository';

export interface FindSymbolResult {
  definition: LocationRef;
  references: LocationRef[];
}

export class FindSymbolUseCase {
  constructor(private readonly lspRepo: ILspRepository) {}

  async execute(query: string): Promise<FindSymbolResult> {
    const candidates = await this.lspRepo.getWorkspaceSymbols(query);

    if (candidates.length === 0) {
      throw new SymbolNotFoundError(query);
    }

    // v1: Pick the first candidate
    const target = candidates[0];

    // Find references for this symbol
    const references = await this.lspRepo.getReferences(
      target.filePath,
      target.line,
      target.character,
    );

    return {
      definition: target,
      references,
    };
  }
}
