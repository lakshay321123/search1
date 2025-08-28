import { sanitizeHtml } from './sanitize';

test('strips script tags and event handlers', () => {
  const dirty = '<div onclick="evil()"><script>alert(1)</script>hello</div>';
  const clean = sanitizeHtml(dirty);
  expect(clean).not.toContain('<script>');
  expect(clean).not.toContain('onclick');
});
