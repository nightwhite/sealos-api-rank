import { describe, expect, it } from 'vitest';
import { createAdminAuth } from '../src/adminAuth.js';

describe('createAdminAuth', () => {
  it('creates and verifies http-only admin sessions', () => {
    const sessions = new Map();
    const db = {
      createAdminSession: (hash, expiresAt) => sessions.set(hash, { token_hash: hash, expires_at: expiresAt }),
      getAdminSession: (hash) => sessions.get(hash),
      deleteExpiredAdminSessions: () => {},
    };
    const auth = createAdminAuth({ adminPassword: 'secret', db, now: () => new Date('2026-05-28T00:00:00Z') });

    const login = auth.login('secret');

    expect(login.ok).toBe(true);
    expect(login.cookieOptions.httpOnly).toBe(true);
    expect(login.cookieOptions.sameSite).toBe('lax');
    expect(auth.verify(login.token)).toBe(true);
  });

  it('rejects wrong passwords and expired sessions', () => {
    const db = {
      createAdminSession: () => {},
      getAdminSession: () => ({ expires_at: '2026-05-27T00:00:00.000Z' }),
      deleteExpiredAdminSessions: () => {},
    };
    const auth = createAdminAuth({ adminPassword: 'secret', db, now: () => new Date('2026-05-28T00:00:00Z') });

    expect(auth.login('bad')).toEqual({ ok: false });
    expect(auth.verify('token')).toBe(false);
  });
});
