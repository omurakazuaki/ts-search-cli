import { LocationRef } from '../domain/entities';
import { ILspRepository } from './ports/ILspRepository';

export class SearchSymbolUseCase {
  constructor(private readonly lspRepo: ILspRepository) {}

  async execute(query: string): Promise<LocationRef[]> {
    let candidates = await this.lspRepo.getWorkspaceSymbols(query);

    if (candidates.length === 0) {
      // Retry once after a short delay, in case the server is warming up
      await new Promise((resolve) => setTimeout(resolve, 1000));
      candidates = await this.lspRepo.getWorkspaceSymbols(query);
    }

    return candidates;
  }
}
