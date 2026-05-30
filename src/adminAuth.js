import { createHash, randomBytes } from 'node:crypto';

const sessionMaxAgeMs = 7 * 24 * 60 * 60 * 1000;

export function createAdminAuth({ adminPassword, db, now = () => new Date() }) {
  return {
    login(password) {
      if (password !== adminPassword) return { ok: false };
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(now().getTime() + sessionMaxAgeMs).toISOString();
      db.createAdminSession(hashToken(token), expiresAt);
      return {
        ok: true,
        token,
        cookieOptions: {
          httpOnly: true,
          sameSite: 'lax',
          maxAge: sessionMaxAgeMs,
          path: '/',
        },
      };
    },
    verify(token) {
      if (!token) return false;
      db.deleteExpiredAdminSessions(now().toISOString());
      const session = db.getAdminSession(hashToken(token));
      return Boolean(session && new Date(session.expires_at).getTime() > now().getTime());
    },
  };
}

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}
