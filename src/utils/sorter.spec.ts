import { SymbolInfo } from '../domain/entities';
import { compareIds, sortById, sortSymbolInfo } from './sorter';

describe('sorter', () => {
  describe('compareIds', () => {
    it('should compare IDs correctly', () => {
      expect(compareIds('a.ts:10:5', 'b.ts:10:5')).toBeLessThan(0);
      expect(compareIds('b.ts:10:5', 'a.ts:10:5')).toBeGreaterThan(0);
      expect(compareIds('a.ts:5:5', 'a.ts:10:5')).toBeLessThan(0);
      expect(compareIds('a.ts:10:5', 'a.ts:10:10')).toBeLessThan(0);
      expect(compareIds('a.ts:10:5', 'a.ts:10:5')).toBe(0);
    });

    it('should handle invalid IDs gracefully by falling back to string comparison', () => {
      // Invalid format vs Valid format
      expect(compareIds('invalid', 'a.ts:10:5')).toBeGreaterThan(0); // 'i' > 'a'
      expect(compareIds('a.ts:10:5', 'invalid')).toBeLessThan(0); // 'a' < 'i'
      
      // Two invalid IDs
      expect(compareIds('abc', 'def')).toBeLessThan(0);
    });
  });

  describe('sortById', () => {
    it('should sort objects by id property', () => {
      const items = [
        { id: 'b.ts:10:5', val: 2 },
        { id: 'a.ts:10:5', val: 1 },
        { id: 'a.ts:5:5', val: 0 },
      ];
      const sorted = sortById(items);
      expect(sorted[0].val).toBe(0);
      expect(sorted[1].val).toBe(1);
      expect(sorted[2].val).toBe(2);
    });
  });

  describe('sortSymbolInfo', () => {
    it('should sort SymbolInfo recursively', () => {
      const symbols: SymbolInfo[] = [
        {
          id: 'b.ts:10:5',
          name: 'B',
          kind: 'Class',
          line: 10,
          children: [
            { id: 'b.ts:12:5', name: 'B2', kind: 'Method', line: 12 },
            { id: 'b.ts:11:5', name: 'B1', kind: 'Method', line: 11 },
          ],
        },
        {
          id: 'a.ts:10:5',
          name: 'A',
          kind: 'Class',
          line: 10,
          children: [],
        },
      ];

      const sorted = sortSymbolInfo(symbols);

      expect(sorted[0].name).toBe('A');
      expect(sorted[1].name).toBe('B');
      
      // Check children sorting
      expect(sorted[1].children![0].name).toBe('B1');
      expect(sorted[1].children![1].name).toBe('B2');
    });
  });
});
