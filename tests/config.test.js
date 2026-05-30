import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('requires Sub2API URL, admin key, and admin password', () => {
    expect(() => loadConfig({})).toThrow('SUB2API_BASE_URL is required');
    expect(() => loadConfig({ SUB2API_BASE_URL: 'https://api.example.com' })).toThrow('ADMIN_KEY is required');
    expect(() => loadConfig({ SUB2API_BASE_URL: 'https://api.example.com', ADMIN_KEY: 'admin-test' })).toThrow('ADMIN_PASSWORD is required');
  });

  it('normalizes base URL and defaults optional values', () => {
    const config = loadConfig({
      SUB2API_BASE_URL: 'https://api.example.com/',
      ADMIN_KEY: 'admin-test',
      ADMIN_PASSWORD: 'secret',
    });

    expect(config.sub2apiBaseUrl).toBe('https://api.example.com/api/v1');
    expect(config.adminKey).toBe('admin-test');
    expect(config.adminPassword).toBe('secret');
    expect(config.port).toBe(3000);
    expect(config.databasePath).toBe('data/rank.sqlite');
  });

  it('keeps explicit api v1 base path', () => {
    const config = loadConfig({
      SUB2API_BASE_URL: 'https://api.example.com/api/v1/',
      ADMIN_KEY: 'admin-test',
      ADMIN_PASSWORD: 'secret',
    });

    expect(config.sub2apiBaseUrl).toBe('https://api.example.com/api/v1');
  });
});
