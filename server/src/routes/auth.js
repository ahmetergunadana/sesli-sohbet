import { Router } from 'express';
import { findOrCreateUser, getUserByToken } from '../controllers/authController.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'İsim gerekli' });
    }

    if (name.length > 100) {
      return res.status(400).json({ error: 'İsim çok uzun (maksimum 100 karakter)' });
    }

    const { user, token } = await findOrCreateUser(name.trim());

    res.json({
      token,
      user: { id: user.id, name: user.name },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token bulunamadı' });
    }

    const token = authHeader.split(' ')[1];
    const user = await getUserByToken(token);

    if (!user) {
      return res.status(401).json({ error: 'Geçersiz token' });
    }

    res.json({ user: { id: user.userId, name: user.name } });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

export default router;
