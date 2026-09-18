import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd());
const main = readFileSync(join(root, 'frontend/src/main.ts'), 'utf8');
const connection = readFileSync(join(root, 'frontend/src/connection.ts'), 'utf8');

test('theme is forced to dark and there is no light-mode toggle', () => {
  assert.match(main, /applyTheme\(theme:\s*'dark'\s*\)/);
  assert.doesNotMatch(main, /currentTheme\(\)\s*:\s*'light'\|'dark'\s*\{|theme-toggle|case'theme'/);
});

test('test notification UI is removed', () => {
  assert.doesNotMatch(connection, /data-heart-action="test"|data-heart-action=\"test\"|Send test notification|testNotification\(|case'test'/);
});
