export class SymbolId {
  constructor(
    public readonly filePath: string,
    public readonly line: number,
    public readonly character: number,
  ) {}

  static parse(idString: string): SymbolId {
    const parts = idString.split(':');
    // Handle cases where filePath might contain colons (e.g. Windows paths)
    // Assuming the format always ends with :line:character
    if (parts.length < 3) {
      // Fallback or throw? The original code threw InvalidIdError or returned 0s.
      // Let's be strict but safe for now, matching the stricter implementations.
      throw new Error(`Invalid ID format: ${idString}`);
    }

    const charStr = parts.pop()!;
    const lineStr = parts.pop()!;

    const char = parseInt(charStr, 10);
    const line = parseInt(lineStr, 10);

    if (isNaN(char) || isNaN(line)) {
      throw new Error(`Invalid line or character in ID: ${idString}`);
    }

    const filePath = parts.join(':');
    return new SymbolId(filePath, line, char);
  }

  toString(): string {
    return `${this.filePath}:${this.line}:${this.character}`;
  }

  compareTo(other: SymbolId): number {
    if (this.filePath !== other.filePath) {
      return this.filePath.localeCompare(other.filePath);
    }
    if (this.line !== other.line) {
      return this.line - other.line;
    }
    return this.character - other.character;
  }

  equals(other: SymbolId): boolean {
    return (
      this.filePath === other.filePath &&
      this.line === other.line &&
      this.character === other.character
    );
  }
}
