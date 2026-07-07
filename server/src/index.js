import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import roomRoutes from './routes/rooms.js';
import { setupSocketHandlers } from './socket/socketHandler.js';
import { connectRedis } from './redis.js';
import { query } from './db.js';

dotenv.config();

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? [process.env.CLIENT_URL, 'https://client-eight-teal-60.vercel.app']
      : '*',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Setup socket handlers
setupSocketHandlers(io);

// Initialize database tables
async function initDB() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        session_token VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(6) UNIQUE NOT NULL,
        name VARCHAR(200) DEFAULT 'Sohbet Odası',
        created_by UUID REFERENCES users(id),
        max_participants INTEGER DEFAULT 10,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS room_participants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(room_id, user_id)
      )
    `);

    await query('CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code)');
    await query('CREATE INDEX IF NOT EXISTS idx_rooms_active ON rooms(is_active)');
    await query('CREATE INDEX IF NOT EXISTS idx_room_participants_room ON room_participants(room_id)');

    console.log('Database tables initialized');
  } catch (error) {
    console.error('Database init error:', error);
  }
}

// Start server
const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await connectRedis();
    await initDB();

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Keep Render free tier alive (ping every 10 min)
    if (process.env.NODE_ENV === 'production') {
      setInterval(() => {
        fetch(`http://localhost:${PORT}/api/health`).catch(() => {});
      }, 10 * 60 * 1000);
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
