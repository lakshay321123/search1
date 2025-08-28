import { normalizeName, nameScore } from './similarity';

test('normalizeName lowercases and trims', () => {
  expect(normalizeName('  John-Doe ')).toBe('john doe');
});

test('nameScore computes token overlap', () => {
  expect(nameScore('John Doe', 'John')).toBeCloseTo(0.5);
  expect(nameScore('Alice', 'Bob')).toBe(0);
});
