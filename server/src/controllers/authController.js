import { v4 as uuidv4 } from 'uuid';
import { query } from '../db.js';
import redis from '../redis.js';

const SESSION_EXPIRY = 86400; // 24 hours

export async function createUser(name) {
  const sessionToken = uuidv4();
  const result = await query(
    'INSERT INTO users (name, session_token) VALUES ($1, $2) RETURNING id, name, created_at',
    [name, sessionToken]
  );
  const user = result.rows[0];

  // Cache session in Redis
  await redis.set(
    `session:${sessionToken}`,
    JSON.stringify({ userId: user.id, name: user.name }),
    { EX: SESSION_EXPIRY }
  );

  return { user, token: sessionToken };
}

export async function findOrCreateUser(name) {
  // Check if user exists by name
  const existing = await query('SELECT id, name FROM users WHERE name = $1', [name]);

  if (existing.rows.length > 0) {
    const user = existing.rows[0];
    const sessionToken = uuidv4();

    // Update session token
    await query('UPDATE users SET session_token = $1 WHERE id = $2', [sessionToken, user.id]);

    // Cache new session
    await redis.set(
      `session:${sessionToken}`,
      JSON.stringify({ userId: user.id, name: user.name }),
      { EX: SESSION_EXPIRY }
    );

    return { user, token: sessionToken };
  }

  return createUser(name);
}

export async function getUserByToken(token) {
  // Try Redis first
  const cached = await redis.get(`session:${token}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // Fallback to database
  const result = await query('SELECT id, name FROM users WHERE session_token = $1', [token]);
  if (result.rows.length === 0) {
    return null;
  }

  const user = result.rows[0];

  // Re-cache
  await redis.set(
    `session:${token}`,
    JSON.stringify({ userId: user.id, name: user.name }),
    { EX: SESSION_EXPIRY }
  );

  return { userId: user.id, name: user.name };
}

export async function invalidateSession(token) {
  await redis.del(`session:${token}`);
  await query('UPDATE users SET session_token = NULL WHERE session_token = $1', [token]);
}
