import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('admin key visibility controls', () => {
  it('shows selected and total key counts in the admin page', () => {
    const html = readFileSync('public/admin.html', 'utf8');
    const script = readFileSync('public/admin.js', 'utf8');

    expect(html).toContain('id="keyCount"');
    expect(script).toContain('function updateKeyCount()');
    expect(script).toContain('已勾选');
  });

  it('checks save responses before showing success', () => {
    const script = readFileSync('public/admin.js', 'utf8');

    expect(script).toMatch(/const response = await fetch\('\/api\/admin\/visible-keys'/);
    expect(script).toContain('if (!response.ok)');
    expect(script).toContain('await loadAdminData();');
  });
});
