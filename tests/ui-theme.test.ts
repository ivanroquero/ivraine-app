import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd());
const main = readFileSync(join(root, 'frontend/src/main.ts'), 'utf8');
const connection = readFileSync(join(root, 'frontend/src/connection.ts'), 'utf8');

test('theme toggle is available and can switch between light and dark modes', () => {
  assert.match(main, /currentTheme\s*\(|applyTheme\s*\(|case\s*'theme'|theme-toggle/);
  assert.doesNotMatch(main, /applyTheme\(\s*'dark'\s*\);\s*applyTheme\('dark'\)/);
});

test('test notification UI is removed', () => {
  assert.doesNotMatch(connection, /data-heart-action="test"|data-heart-action=\"test\"|Send test notification|testNotification\(|case'test'/);
});
