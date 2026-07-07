import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || '';

export function useSocket(token) {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const joinedRoomRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    const socket = io(WS_URL || undefined, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('reconnect_attempt', (attempt) => {
      console.log(`Yeniden bağlanma denemesi: ${attempt}`);
    });

    socket.on('reconnect_failed', () => {
      console.error('Yeniden bağlanma başarısız - lütfen sayfayı yenileyin');
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      joinedRoomRef.current = null;
    };
  }, [token]);

  const joinRoom = useCallback((code) => {
    joinedRoomRef.current = code;
    socketRef.current?.emit('join-room', code);
  }, []);

  const leaveRoom = useCallback((code) => {
    joinedRoomRef.current = null;
    socketRef.current?.emit('leave-room', code);
  }, []);

  const sendSignal = useCallback((targetUserId, signal, type) => {
    socketRef.current?.emit('webrtc-signal', {
      targetUserId,
      signal,
      type,
    });
  }, []);

  const sendMuteStatus = useCallback((code, isMuted) => {
    socketRef.current?.emit('mute-status', { code, isMuted });
  }, []);

  const getRoomPreview = useCallback((code) => {
    return new Promise((resolve) => {
      if (!socketRef.current) {
        resolve({ error: 'Bağlantı yok' });
        return;
      }

      const timeout = setTimeout(() => {
        resolve({ error: 'Zaman aşımı' });
      }, 3000);

      socketRef.current.emit('get-room-preview', code);
      socketRef.current.once('room-preview', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });
  }, []);

  const on = useCallback((event, callback) => {
    socketRef.current?.on(event, callback);
  }, []);

  const off = useCallback((event, callback) => {
    socketRef.current?.off(event, callback);
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    joinRoom,
    leaveRoom,
    sendSignal,
    sendMuteStatus,
    getRoomPreview,
    on,
    off,
  };
}
