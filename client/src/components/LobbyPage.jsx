import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { api } from '../services/api';
import { getRandomRoomName } from '../utils/roomNames';

export default function LobbyPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const socket = useSocket(token);

  // Step state: 'menu' | 'create' | 'join'
  const [step, setStep] = useState('menu');

  // Create room state
  const [roomName, setRoomName] = useState(getRandomRoomName());

  // Join room state
  const [roomCode, setRoomCode] = useState('');
  const [roomPreview, setRoomPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showClipboardHint, setShowClipboardHint] = useState(false);

  // General state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Clipboard auto-read on mount
  useEffect(() => {
    const readClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText();
        const match = text.match(/\b[A-Z0-9]{6}\b/i);
        if (match) {
          setRoomCode(match[0].toUpperCase());
          setShowClipboardHint(true);
          setTimeout(() => setShowClipboardHint(false), 3000);
        }
      } catch {
        // İzin yok, sessizce geç
      }
    };
    readClipboard();
  }, []);

  // Room preview when code changes
  useEffect(() => {
    if (roomCode.length === 6 && socket) {
      setPreviewLoading(true);
      const timer = setTimeout(async () => {
        try {
          const preview = await socket.getRoomPreview(roomCode.toUpperCase());
          setRoomPreview(preview);
        } catch {
          setRoomPreview({ error: 'Oda bulunamadı' });
        } finally {
          setPreviewLoading(false);
        }
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setRoomPreview(null);
    }
  }, [roomCode, socket]);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await api.createRoom(roomName || getRandomRoomName());
      navigate(`/room/${data.room.code}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    setError('');

    if (roomCode.length !== 6) {
      setError('Oda kodu 6 haneli olmalıdır');
      return;
    }

    setLoading(true);
    try {
      await api.joinRoom(roomCode.toUpperCase());
      navigate(`/room/${roomCode.toUpperCase()}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Menu Step
  if (step === 'menu') {
    return (
      <div className="lobby-page">
        <div className="lobby-header">
          <h2>🎙️ Sesli Sohbet</h2>
          <div className="user-info">
            <div className="user-avatar">{getInitials(user.name)}</div>
            <span>{user.name}</span>
            <button className="btn btn-secondary btn-sm" onClick={logout}>
              Çıkış
            </button>
          </div>
        </div>

        <div className="menu-container">
          <h3 className="menu-title">Ne yapmak istersiniz?</h3>

          <div className="menu-buttons">
            <button
              className="menu-btn"
              onClick={() => {
                setStep('create');
                setError('');
              }}
            >
              <div className="menu-btn-icon">🎙️</div>
              <div className="menu-btn-title">Oda Kur</div>
              <div className="menu-btn-desc">Yeni bir sohbet odası oluşturun ve arkadaşlarınızı davet edin</div>
            </button>

            <button
              className="menu-btn"
              onClick={() => {
                setStep('join');
                setError('');
              }}
            >
              <div className="menu-btn-icon">🔗</div>
              <div className="menu-btn-title">Odaya Katıl</div>
              <div className="menu-btn-desc">Davet kodu ile mevcut bir sohbet odasına katılın</div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Create Room Step
  if (step === 'create') {
    return (
      <div className="lobby-page">
        <div className="lobby-header">
          <h2>🎙️ Sesli Sohbet</h2>
          <div className="user-info">
            <div className="user-avatar">{getInitials(user.name)}</div>
            <span>{user.name}</span>
            <button className="btn btn-secondary btn-sm" onClick={logout}>
              Çıkış
            </button>
          </div>
        </div>

        <div className="lobby-content">
          <div className="lobby-section create-section">
            <button className="back-btn" onClick={() => { setStep('menu'); setError(''); }}>
              ← Geri
            </button>
            <h3>Yeni Oda Oluştur</h3>
            <form onSubmit={handleCreateRoom}>
              <div className="input-group">
                <label htmlFor="roomName">Oda Adı</label>
                <div className="room-name-input">
                  <input
                    id="roomName"
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Sohbet Odası"
                    maxLength={200}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm refresh-btn"
                    onClick={() => setRoomName(getRandomRoomName())}
                    title="Rastgele isim öner"
                  >
                    🔄
                  </button>
                </div>
              </div>

              {error && <div className="error-text">{error}</div>}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? 'Oluşturuluyor...' : 'Oda Oluştur'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Join Room Step
  if (step === 'join') {
    return (
      <div className="lobby-page">
        <div className="lobby-header">
          <h2>🎙️ Sesli Sohbet</h2>
          <div className="user-info">
            <div className="user-avatar">{getInitials(user.name)}</div>
            <span>{user.name}</span>
            <button className="btn btn-secondary btn-sm" onClick={logout}>
              Çıkış
            </button>
          </div>
        </div>

        <div className="lobby-content">
          <div className="lobby-section join-section">
            <button className="back-btn" onClick={() => { setStep('menu'); setError(''); setRoomCode(''); setRoomPreview(null); }}>
              ← Geri
            </button>
            <h3>Odaya Katıl</h3>
            <form onSubmit={handleJoinRoom}>
              <div className="input-group">
                <label htmlFor="roomCode">Davet Kodu (6 haneli)</label>
                <input
                  id="roomCode"
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="Örn: A3F7K2"
                  maxLength={6}
                  autoFocus
                />
              </div>

              {showClipboardHint && (
                <div className="clipboard-hint">
                  📋 Davet kodu otomatik yapıştırıldı
                </div>
              )}

              {previewLoading && (
                <div className="room-preview loading">
                  <span>⏳ Aranıyor...</span>
                </div>
              )}

              {!previewLoading && roomPreview && !roomPreview.error && (
                <div className="room-preview">
                  <div className="preview-info">
                    <span className="preview-name">📢 {roomPreview.name}</span>
                    <span className="preview-count">
                      👥 {roomPreview.participantCount}/{roomPreview.maxParticipants} kişi
                    </span>
                  </div>
                </div>
              )}

              {!previewLoading && roomPreview && roomPreview.error && roomCode.length === 6 && (
                <div className="room-preview error">
                  <span>❌ {roomPreview.error}</span>
                </div>
              )}

              {error && <div className="error-text">{error}</div>}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || roomCode.length !== 6}
              >
                {loading ? 'Katılınıyor...' : 'Odaya Katıl'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
