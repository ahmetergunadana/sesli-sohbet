import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  createRoom,
  getRoomByCode,
  joinRoom,
  leaveRoom,
  deleteRoom,
} from '../controllers/roomController.js';

const router = Router();

// POST /api/rooms - Yeni oda oluştur
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    const room = await createRoom(name, req.user.userId);
    res.json({ room });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Oda oluşturulamadı' });
  }
});

// GET /api/rooms/:code - Oda bilgisi getir
router.get('/:code', authMiddleware, async (req, res) => {
  try {
    const room = await getRoomByCode(req.params.code);
    if (!room) {
      return res.status(404).json({ error: 'Oda bulunamadı' });
    }
    res.json({ room });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// POST /api/rooms/join - Odaya katıl
router.post('/join', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || code.length !== 6) {
      return res.status(400).json({ error: 'Geçerli bir oda kodu girin (6 haneli)' });
    }

    const result = await joinRoom(code.toUpperCase(), req.user.userId);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ room: result.room });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// DELETE /api/rooms/:code - Odadan ayrıl veya odayı sil
router.delete('/:code', authMiddleware, async (req, res) => {
  try {
    const { action } = req.query;

    if (action === 'delete') {
      const result = await deleteRoom(req.params.code, req.user.userId);
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      return res.json(result);
    }

    const result = await leaveRoom(req.params.code, req.user.userId);
    res.json(result);
  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

export default router;
