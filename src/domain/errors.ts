import { LocationRef } from './entities';

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class SymbolNotFoundError extends DomainError {
  constructor(public readonly query: string) {
    super(`Symbol not found: ${query}`);
  }
}

export class AmbiguousSymbolError extends DomainError {
  constructor(
    public readonly query: string,
    public readonly candidates: LocationRef[],
  ) {
    super(`Multiple symbols found for: ${query}`);
  }
}
