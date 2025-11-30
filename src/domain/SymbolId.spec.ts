import { SymbolId } from './SymbolId';

describe('SymbolId', () => {
  describe('parse', () => {
    it('should parse a valid ID string', () => {
      const id = SymbolId.parse('src/main.ts:10:5');
      expect(id.filePath).toBe('src/main.ts');
      expect(id.line).toBe(10);
      expect(id.character).toBe(5);
    });

    it('should parse an ID with a file path containing colons (e.g. Windows path)', () => {
      const id = SymbolId.parse('C:/Users/name/project/src/main.ts:20:15');
      expect(id.filePath).toBe('C:/Users/name/project/src/main.ts');
      expect(id.line).toBe(20);
      expect(id.character).toBe(15);
    });

    it('should throw an error for an ID with missing parts', () => {
      expect(() => SymbolId.parse('src/main.ts:10')).toThrow('Invalid ID format');
      expect(() => SymbolId.parse('src/main.ts')).toThrow('Invalid ID format');
    });

    it('should throw an error for non-numeric line or character', () => {
      expect(() => SymbolId.parse('src/main.ts:ten:5')).toThrow('Invalid line or character');
      expect(() => SymbolId.parse('src/main.ts:10:five')).toThrow('Invalid line or character');
    });
  });

  describe('toString', () => {
    it('should format the ID correctly', () => {
      const id = new SymbolId('src/utils/helper.ts', 5, 1);
      expect(id.toString()).toBe('src/utils/helper.ts:5:1');
    });
  });

  describe('compareTo', () => {
    it('should compare by file path first', () => {
      const id1 = new SymbolId('a.ts', 10, 5);
      const id2 = new SymbolId('b.ts', 10, 5);
      expect(id1.compareTo(id2)).toBeLessThan(0);
      expect(id2.compareTo(id1)).toBeGreaterThan(0);
    });

    it('should compare by line number if file paths are equal', () => {
      const id1 = new SymbolId('main.ts', 5, 10);
      const id2 = new SymbolId('main.ts', 10, 10);
      expect(id1.compareTo(id2)).toBeLessThan(0);
      expect(id2.compareTo(id1)).toBeGreaterThan(0);
    });

    it('should compare by character if file paths and lines are equal', () => {
      const id1 = new SymbolId('main.ts', 10, 5);
      const id2 = new SymbolId('main.ts', 10, 10);
      expect(id1.compareTo(id2)).toBeLessThan(0);
      expect(id2.compareTo(id1)).toBeGreaterThan(0);
    });

    it('should return 0 for equal IDs', () => {
      const id1 = new SymbolId('main.ts', 10, 5);
      const id2 = new SymbolId('main.ts', 10, 5);
      expect(id1.compareTo(id2)).toBe(0);
    });
  });

  describe('equals', () => {
    it('should return true for identical IDs', () => {
      const id1 = new SymbolId('main.ts', 10, 5);
      const id2 = new SymbolId('main.ts', 10, 5);
      expect(id1.equals(id2)).toBe(true);
    });

    it('should return false for different IDs', () => {
      const id1 = new SymbolId('main.ts', 10, 5);
      const id2 = new SymbolId('main.ts', 10, 6);
      expect(id1.equals(id2)).toBe(false);
    });
  });
});
