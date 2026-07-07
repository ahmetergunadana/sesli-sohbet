import { getUserByToken } from '../controllers/authController.js';
import redis from '../redis.js';
import { leaveRoom } from '../controllers/roomController.js';

// Store active socket connections: userId -> socketId
const connectedUsers = new Map();

// Store WebRTC peer connections: roomCode -> Map<userId, Set<targetUserId>>
const peerConnections = new Map();

export function setupSocketHandlers(io) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Token gerekli'));
    }

    const user = await getUserByToken(token);
    if (!user) {
      return next(new Error('Geçersiz token'));
    }

    socket.userId = user.userId;
    socket.userName = user.name;
    next();
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userName} (${socket.userId})`);
    connectedUsers.set(socket.userId, socket.id);

    // Join room
    socket.on('join-room', async (code) => {
      try {
        const roomKey = `room_participants:${code}`;

        // Kullanıcı zaten odada mı kontrol et (reconnect durumu)
        const wasAlreadyInRoom = await redis.sIsMember(roomKey, socket.userId);

        await redis.sAdd(roomKey, socket.userId);
        await redis.expire(roomKey, 86400);

        socket.join(code);
        socket.currentRoom = code;

        // Tüm katılımcıları al (duplicate kontrolü ile)
        const participants = await redis.sMembers(roomKey);
        const participantData = [];
        const seenUserIds = new Set();

        for (const userId of participants) {
          if (seenUserIds.has(userId)) continue;
          seenUserIds.add(userId);

          const cached = await redis.get(`session:${await getTokenByUserId(userId)}`);
          if (cached) {
            const user = JSON.parse(cached);
            participantData.push({ userId: user.userId, name: user.name });
          } else {
            participantData.push({ userId, name: 'Bilinmeyen' });
          }
        }

        // Sadece yeni katılımcı ise başkalarına bildir
        if (!wasAlreadyInRoom) {
          socket.to(code).emit('user-joined', {
            userId: socket.userId,
            name: socket.userName,
          });
        }

        // Katılımcı listesini gönder (her zaman)
        socket.emit('room-joined', {
          code,
          participants: participantData,
        });

        console.log(`${socket.userName} joined room ${code}${wasAlreadyInRoom ? ' (reconnect)' : ''}`);
      } catch (error) {
        console.error('Join room error:', error);
        socket.emit('error', { message: 'Odaya katılınamadı' });
      }
    });

    // Get room preview (for join screen)
    socket.on('get-room-preview', async (code) => {
      try {
        const roomKey = `room:${code}`;
        const cached = await redis.get(roomKey);

        if (!cached) {
          socket.emit('room-preview', { error: 'Oda bulunamadı' });
          return;
        }

        const room = JSON.parse(cached);
        const participants = await redis.sMembers(`room_participants:${code}`);

        socket.emit('room-preview', {
          code: room.code,
          name: room.name,
          participantCount: participants.length,
          maxParticipants: room.max_participants || 10,
        });
      } catch (error) {
        console.error('Room preview error:', error);
        socket.emit('room-preview', { error: 'Sunucu hatası' });
      }
    });

    // Leave room
    socket.on('leave-room', async (code) => {
      try {
        await handleLeaveRoom(socket, code);
      } catch (error) {
        console.error('Leave room error:', error);
      }
    });

    // WebRTC signaling
    socket.on('webrtc-signal', (data) => {
      const { targetUserId, signal, type } = data;
      const targetSocketId = connectedUsers.get(targetUserId);

      if (targetSocketId) {
        io.to(targetSocketId).emit('webrtc-signal', {
          fromUserId: socket.userId,
          fromUserName: socket.userName,
          signal,
          type,
        });
      }
    });

    // Mute/unmute notification
    socket.on('mute-status', (data) => {
      const { code, isMuted } = data;
      socket.to(code).emit('participant-mute-status', {
        userId: socket.userId,
        isMuted,
      });
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.userName}`);
      connectedUsers.delete(socket.userId);

      if (socket.currentRoom) {
        // Bu kullanıcının başka aktif bağlantısı var mı kontrol et
        const otherSockets = await io.in(socket.currentRoom).fetchSockets();
        const hasOtherConnection = otherSockets.some(s => s.userId === socket.userId && s.id !== socket.id);

        if (!hasOtherConnection) {
          // Başka bağlantı yoksa odadan çıkar
          await handleLeaveRoom(socket, socket.currentRoom);
        } else {
          console.log(`${socket.userName} has other connections, keeping in room`);
        }
      }
    });
  });
}

async function handleLeaveRoom(socket, code) {
  const roomKey = `room_participants:${code}`;
  await redis.sRem(roomKey, socket.userId);

  socket.leave(code);
  socket.currentRoom = null;

  // Check if room is empty
  const remaining = await redis.sMembers(roomKey);
  if (remaining.length === 0) {
    // Room is empty, close it
    await redis.del(`room:${code}`);
    await redis.del(roomKey);

    // Also update database
    const { query } = await import('../db.js');
    await query('UPDATE rooms SET is_active = false WHERE code = $1', [code]);
    await query('DELETE FROM room_participants WHERE room_id = (SELECT id FROM rooms WHERE code = $1)', [code]);

    console.log(`Room ${code} closed (empty)`);
  } else {
    // Notify others
    socket.to(code).emit('user-left', {
      userId: socket.userId,
      name: socket.userName,
    });
  }

  console.log(`${socket.userName} left room ${code}`);
}

async function getTokenByUserId(userId) {
  // This is a helper - in production you'd cache this better
  const { query } = await import('../db.js');
  const result = await query('SELECT session_token FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.session_token;
}
