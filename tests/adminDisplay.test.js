import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('admin key visibility controls', () => {
  it('shows selected and total key counts in the admin page', () => {
    const html = readFileSync('public/admin.html', 'utf8');
    const script = readFileSync('public/admin.js', 'utf8');

    expect(html).toContain('id="keyCount"');
    expect(html).toMatch(/id="saveKeysButton"[\s\S]+id="adminMessage"[\s\S]+id="keyList"/);
    expect(script).toContain('function updateKeyCount()');
    expect(script).toContain('已勾选');
  });

  it('checks save responses before showing success', () => {
    const script = readFileSync('public/admin.js', 'utf8');

    expect(script).toMatch(/const response = await fetch\('\/api\/admin\/visible-keys'/);
    expect(script).toContain('if (!response.ok)');
    expect(script).toContain('await loadAdminData();');
  });

  it('reports the server-confirmed visible key count after saving', () => {
    const script = readFileSync('public/admin.js', 'utf8');

    expect(script).toContain('let savedVisibleCount = 0;');
    expect(script).toContain('savedVisibleCount = keys.filter((key) => key.visible).length;');
    expect(script).toContain('Key 展示范围已保存，当前展示 ${savedVisibleCount} 个');
    expect(script).not.toContain('Key 展示范围已保存，已展示 ${keyIds.length} 个');
  });

  it('shows immediate feedback while saving visible keys', () => {
    const script = readFileSync('public/admin.js', 'utf8');

    expect(script).toContain("setAdminMessage('正在保存 Key 展示范围...');");
    expect(script).toContain('saveKeysButton.disabled = true;');
    expect(script).toContain('saveKeysButton.disabled = false;');
  });

  it('makes key save status obvious on the button and status text', () => {
    const html = readFileSync('public/admin.html', 'utf8');
    const script = readFileSync('public/admin.js', 'utf8');
    const styles = readFileSync('public/styles.css', 'utf8');

    expect(html).toContain('id="adminMessage" class="admin-message" role="status"');
    expect(script).toContain("saveKeysButton.textContent = '保存中...';");
    expect(script).toContain("saveKeysButton.textContent = '已保存';");
    expect(script).toContain("saveKeysButton.textContent = '保存 Key';");
    expect(styles).toContain('.admin-message');
  });

  it('shows a failed save message when the network request throws', () => {
    const script = readFileSync('public/admin.js', 'utf8');
    const styles = readFileSync('public/styles.css', 'utf8');

    expect(script).toContain("setAdminMessage('保存失败，请检查网络连接', 'error');");
    expect(script).toContain("setAdminMessage(`Key 展示范围已保存，当前展示 ${savedVisibleCount} 个`, 'success');");
    expect(styles).toContain('.admin-message.error');
  });
});
