import { getUserByToken } from '../controllers/authController.js';

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token bulunamadı' });
  }

  const token = authHeader.split(' ')[1];
  const user = await getUserByToken(token);

  if (!user) {
    return res.status(401).json({ error: 'Geçersiz token' });
  }

  req.user = user;
  next();
}
