import { detectIntent } from './intent';

test('detectIntent classifies people', () => {
  expect(detectIntent('John Doe')).toBe('people');
});

test('detectIntent classifies local queries', () => {
  expect(detectIntent('pizza near me')).toBe('local');
});

test('detectIntent classifies company queries', () => {
  expect(detectIntent('Acme Inc')).toBe('company');
});

test('detectIntent falls back to general', () => {
  expect(detectIntent('What is the weather?')).toBe('general');
});
