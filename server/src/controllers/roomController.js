import { query } from '../db.js';
import redis from '../redis.js';
import { generateRoomCode } from '../utils/roomCode.js';

const ROOM_CACHE_EXPIRY = 86400; // 24 hours

async function generateUniqueCode() {
  let code;
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 100) {
    code = generateRoomCode();
    const cached = await redis.exists(`room:${code}`);
    if (cached) {
      attempts++;
      continue;
    }
    const dbResult = await query('SELECT 1 FROM rooms WHERE code = $1', [code]);
    exists = dbResult.rows.length > 0;
    attempts++;
  }

  if (exists) {
    throw new Error('Could not generate unique room code');
  }

  return code;
}

export async function createRoom(name, createdBy) {
  const code = await generateUniqueCode();

  const result = await query(
    `INSERT INTO rooms (code, name, created_by) 
     VALUES ($1, $2, $3) 
     RETURNING id, code, name, created_by, created_at`,
    [code, name || 'Sohbet Odası', createdBy]
  );

  const room = result.rows[0];

  // Add creator as first participant
  await query(
    'INSERT INTO room_participants (room_id, user_id) VALUES ($1, $2)',
    [room.id, createdBy]
  );

  // Cache room in Redis
  await redis.set(
    `room:${code}`,
    JSON.stringify({ ...room, participants: [createdBy] }),
    { EX: ROOM_CACHE_EXPIRY }
  );

  // Track participants in Redis Set
  await redis.sAdd(`room_participants:${code}`, createdBy);

  return room;
}

export async function getRoomByCode(code) {
  // Try Redis first
  const cached = await redis.get(`room:${code}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // Fallback to database
  const result = await query(
    `SELECT r.*, 
      COALESCE(
        json_agg(
          json_build_object(
            'userId', rp.user_id,
            'name', u.name,
            'joinedAt', rp.joined_at
          )
        ) FILTER (WHERE rp.user_id IS NOT NULL),
        '[]'
      ) as participants
     FROM rooms r
     LEFT JOIN room_participants rp ON r.id = rp.room_id
     LEFT JOIN users u ON rp.user_id = u.id
     WHERE r.code = $1 AND r.is_active = true
     GROUP BY r.id`,
    [code]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const room = result.rows[0];

  // Cache
  await redis.set(`room:${code}`, JSON.stringify(room), { EX: ROOM_CACHE_EXPIRY });

  return room;
}

export async function joinRoom(code, userId) {
  const room = await query(
    'SELECT id, code, name, max_participants FROM rooms WHERE code = $1 AND is_active = true',
    [code]
  );

  if (room.rows.length === 0) {
    return { error: 'Oda bulunamadı' };
  }

  const roomData = room.rows[0];

  // Check participant count
  const participantCount = await query(
    'SELECT COUNT(*) as count FROM room_participants WHERE room_id = $1',
    [roomData.id]
  );

  if (parseInt(participantCount.rows[0].count) >= roomData.max_participants) {
    return { error: 'Oda dolu (maksimum 10 kişi)' };
  }

  // Check if already in room
  const existing = await query(
    'SELECT 1 FROM room_participants WHERE room_id = $1 AND user_id = $2',
    [roomData.id, userId]
  );

  if (existing.rows.length === 0) {
    await query(
      'INSERT INTO room_participants (room_id, user_id) VALUES ($1, $2)',
      [roomData.id, userId]
    );

    // Update Redis
    await redis.sAdd(`room_participants:${code}`, userId);
  }

  return { room: roomData };
}

export async function leaveRoom(code, userId) {
  const room = await query('SELECT id FROM rooms WHERE code = $1', [code]);
  if (room.rows.length === 0) return;

  const roomId = room.rows[0].id;

  await query(
    'DELETE FROM room_participants WHERE room_id = $1 AND user_id = $2',
    [roomId, userId]
  );

  // Update Redis
  await redis.sRem(`room_participants:${code}`, userId);

  // Check if room is empty
  const remaining = await query(
    'SELECT COUNT(*) as count FROM room_participants WHERE room_id = $1',
    [roomId]
  );

  if (parseInt(remaining.rows[0].count) === 0) {
    // Close empty room
    await query('UPDATE rooms SET is_active = false WHERE id = $1', [roomId]);
    await redis.del(`room:${code}`);
    await redis.del(`room_participants:${code}`);
    return { roomClosed: true };
  }

  // Update cached room
  const participants = await redis.sMembers(`room_participants:${code}`);
  const cached = await redis.get(`room:${code}`);
  if (cached) {
    const roomData = JSON.parse(cached);
    roomData.participants = participants;
    await redis.set(`room:${code}`, JSON.stringify(roomData), { EX: ROOM_CACHE_EXPIRY });
  }

  return { roomClosed: false };
}

export async function deleteRoom(code, userId) {
  const room = await query(
    'SELECT id, created_by FROM rooms WHERE code = $1',
    [code]
  );

  if (room.rows.length === 0) {
    return { error: 'Oda bulunamadı' };
  }

  if (room.rows[0].created_by !== userId) {
    return { error: 'Sadece oda sahibi odayı silebilir' };
  }

  await query('DELETE FROM room_participants WHERE room_id = $1', [room.rows[0].id]);
  await query('DELETE FROM rooms WHERE id = $1', [room.rows[0].id]);

  // Clean Redis
  await redis.del(`room:${code}`);
  await redis.del(`room_participants:${code}`);

  return { success: true };
}
