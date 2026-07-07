import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import ParticipantCard from './ParticipantCard';
import ShareModal from './ShareModal';
import DeviceSelection from './DeviceSelection';

export default function VoiceRoom() {
  const { code } = useParams();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [participants, setParticipants] = useState([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [toast, setToast] = useState(null);

  // Device selection state
  const [showDeviceSelection, setShowDeviceSelection] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState(null);

  // PTT mode state
  const [pttMode, setPttMode] = useState(false);
  const [isPTTActive, setIsPTTActive] = useState(false);

  // Sidetone (kendi sesini duyma) state
  const [sidetone, setSidetone] = useState(false);

  // Shared AudioContext for all participants
  const audioContextRef = useRef(null);

  // Reconnect duplicate join prevention
  const hasJoinedRef = useRef(false);

  const socket = useSocket(token);
  const {
    localStream,
    remoteStreams,
    isMuted,
    startLocalStream,
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    removePeerConnection,
    toggleMute,
  } = useWebRTC(socket.socket, user?.id);

  // Ref'ler - stale closure önlemek için
  const createOfferRef = useRef(createOffer);
  const handleOfferRef = useRef(handleOffer);
  const handleAnswerRef = useRef(handleAnswer);
  const handleIceCandidateRef = useRef(handleIceCandidate);
  const removePeerConnectionRef = useRef(removePeerConnection);
  const localStreamRef = useRef(localStream);

  useEffect(() => {
    createOfferRef.current = createOffer;
    handleOfferRef.current = handleOffer;
    handleAnswerRef.current = handleAnswer;
    handleIceCandidateRef.current = handleIceCandidate;
    removePeerConnectionRef.current = removePeerConnection;
    localStreamRef.current = localStream;
  }, [createOffer, handleOffer, handleAnswer, handleIceCandidate, removePeerConnection, localStream]);

  // Show toast message
  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Device selection completed
  const handleDeviceSelected = useCallback(async (deviceId) => {
    setSelectedDevice(deviceId);

    try {
      await startLocalStream(deviceId);
      // Shared AudioContext oluştur
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext();
      }
      setShowDeviceSelection(false);
    } catch (err) {
      console.error('Failed to get microphone:', err);
      showToast('Mikrofon erişimi başarısız oldu. Lütfen mikrofon iznini kontrol edin.');
    }
  }, [startLocalStream, showToast]);

  // Join room - localStream hazır olduğunda
  useEffect(() => {
    if (socket.isConnected && code && !showDeviceSelection && localStream && !hasJoinedRef.current) {
      hasJoinedRef.current = true;
      socket.joinRoom(code);
      sessionStorage.setItem('currentRoom', code);
    }
  }, [socket.isConnected, code, socket, showDeviceSelection, localStream]);

  // Cleanup session on unmount
  useEffect(() => {
    return () => {
      sessionStorage.removeItem('currentRoom');
      hasJoinedRef.current = false;
      // Cleanup shared AudioContext
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  // PTT mode keyboard handlers
  useEffect(() => {
    if (!pttMode) return;

    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setIsPTTActive(true);
        localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = true; });
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPTTActive(false);
        localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [pttMode]);

  // PTT mode: send mute status
  useEffect(() => {
    if (pttMode && !showDeviceSelection) {
      socket.sendMuteStatus(code, !isPTTActive);
    }
  }, [isPTTActive, pttMode, code, socket, showDeviceSelection]);

  // Socket event handlers - ref'ler kullanarak stale closure önle
  useEffect(() => {
    if (!socket.socket || showDeviceSelection) return;

    const handleRoomJoined = (data) => {
      setRoomName(data.code);
      setParticipants(data.participants);

      // Stream hazır mı kontrol et, değilse bekle
      const checkAndCreateOffers = (retries = 0) => {
        if (localStreamRef.current || retries > 10) {
          data.participants.forEach((p) => {
            if (p.userId !== user?.id) {
              console.log(`Creating offer for ${p.userId}, stream: ${!!localStreamRef.current}`);
              createOfferRef.current(p.userId);
            }
          });
        } else if (retries < 10) {
          setTimeout(() => checkAndCreateOffers(retries + 1), 200);
        }
      };
      checkAndCreateOffers();
    };

    const handleUserJoined = (data) => {
      setParticipants((prev) => {
        if (prev.some(p => p.userId === data.userId)) return prev;
        return [...prev, data];
      });
      showToast(`${data.name} odaya katıldı`);

      // Yeni kullanıcıya offer gönder
      setTimeout(() => {
        createOfferRef.current(data.userId);
      }, 500);
    };

    const handleUserLeft = (data) => {
      setParticipants((prev) => prev.filter((p) => p.userId !== data.userId));
      removePeerConnectionRef.current(data.userId);
      showToast(`${data.name} odadan ayrıldı`);
    };

    const handleWebRTCSignal = (data) => {
      switch (data.type) {
        case 'offer':
          handleOfferRef.current(data.fromUserId, data.signal);
          break;
        case 'answer':
          handleAnswerRef.current(data.fromUserId, data.signal);
          break;
        case 'ice-candidate':
          handleIceCandidateRef.current(data.fromUserId, data.signal);
          break;
      }
    };

    const handleParticipantMuteStatus = (data) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.userId === data.userId ? { ...p, isMuted: data.isMuted } : p
        )
      );
    };

    const handleRoomClosed = () => {
      showToast('Oda kapatıldı');
      navigate('/');
    };

    socket.on('room-joined', handleRoomJoined);
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('webrtc-signal', handleWebRTCSignal);
    socket.on('participant-mute-status', handleParticipantMuteStatus);
    socket.on('room-closed', handleRoomClosed);

    return () => {
      socket.off('room-joined', handleRoomJoined);
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      socket.off('webrtc-signal', handleWebRTCSignal);
      socket.off('participant-mute-status', handleParticipantMuteStatus);
      socket.off('room-closed', handleRoomClosed);
    };
  }, [socket, user, showDeviceSelection, navigate, showToast]);

  const handleToggleMute = () => {
    if (pttMode) return;
    const newMuted = toggleMute();
    socket.sendMuteStatus(code, newMuted);
  };

  const handleTogglePTT = () => {
    const newPTTMode = !pttMode;
    setPttMode(newPTTMode);
    setIsPTTActive(false);

    if (newPTTMode && !isMuted) {
      toggleMute();
      socket.sendMuteStatus(code, true);
    }
    if (!newPTTMode && isMuted) {
      toggleMute();
      socket.sendMuteStatus(code, false);
    }
  };

  const handleLeaveRoom = () => {
    socket.leaveRoom(code);
    navigate('/');
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/room/${code}`;
    navigator.clipboard.writeText(url);
    showToast('Link kopyalandı!');
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    showToast('Kod kopyalandı!');
  };

  // Device selection screen
  if (showDeviceSelection) {
    return (
      <div className="voice-room device-selection-screen">
        <div className="room-header">
          <div className="room-info">
            <span className="room-code">{code}</span>
            <span className="room-name">Mikrofon Ayarı</span>
          </div>
          <div className="room-actions">
            <button className="btn btn-danger btn-sm" onClick={() => navigate('/')}>
              İptal
            </button>
          </div>
        </div>

        <div className="room-body">
          <DeviceSelection
            onDeviceSelected={handleDeviceSelected}
            onError={(err) => showToast(err)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="voice-room">
      <div className="room-header">
        <div className="room-info">
          <div
            className="room-code"
            onClick={handleCopyCode}
            title="Kodu kopyalamak için tıklayın"
          >
            {code}
          </div>
          <span className="room-name">{roomName || 'Sohbet Odası'}</span>
          <span style={{ color: 'var(--text-secondary)' }}>
            ({participants.length} kişi)
          </span>
        </div>

        <div className="room-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowShareModal(true)}
          >
            📤 Davet Et
          </button>
          <button className="btn btn-danger btn-sm" onClick={handleLeaveRoom}>
            Odadan Ayrıl
          </button>
        </div>
      </div>

      {pttMode && (
        <div className="ptt-indicator">
          📢 Push-to-Talk: Boşluk tuşuna basılı tutarak konuş
        </div>
      )}

      <div className="room-body">
        {participants.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🎙️</div>
            <p>Henüz katılımcı yok</p>
          </div>
        ) : (
          <div className="participants-grid">
            {participants.map((participant) => (
              <ParticipantCard
                key={participant.userId}
                participant={participant}
                isMe={participant.userId === user?.id}
                remoteStream={
                  participant.userId !== user?.id
                    ? remoteStreams.get(participant.userId)
                    : null
                }
                localStream={participant.userId === user?.id ? localStream : null}
                sidetone={participant.userId === user?.id ? sidetone : false}
                audioContextRef={audioContextRef}
              />
            ))}
          </div>
        )}
      </div>

      <div className="room-footer">
        <button
          className={`footer-btn ptt-toggle ${pttMode ? 'active' : ''}`}
          onClick={handleTogglePTT}
          title={pttMode ? 'PTT Modunu Kapat' : 'PTT Modunu Aç'}
        >
          📢
        </button>

        <button
          className={`footer-btn sidetone-btn ${sidetone ? 'active' : ''}`}
          onClick={() => setSidetone(!sidetone)}
          title={sidetone ? 'Kendi sesini kapat' : 'Kendi sesini duy (sidetone)'}
        >
          {sidetone ? '🔊' : '🔈'}
        </button>

        <button
          className={`footer-btn mute-btn ${
            pttMode ? (isPTTActive ? 'unmuted' : 'muted') : (isMuted ? 'muted' : 'unmuted')
          }`}
          onClick={handleToggleMute}
          disabled={pttMode}
          title={pttMode ? 'PTT modunda: Basılı tutarak konuş' : (isMuted ? 'Ses Aç' : 'Sessize Al')}
        >
          {pttMode ? (isPTTActive ? '🎤' : '🔇') : (isMuted ? '🔇' : '🎤')}
        </button>

        <button
          className="footer-btn leave-btn"
          onClick={handleLeaveRoom}
          title="Odadan Ayrıl"
        >
          📞
        </button>
      </div>

      {showShareModal && (
        <ShareModal
          code={code}
          roomName={roomName}
          onClose={() => setShowShareModal(false)}
          onCopyLink={handleCopyLink}
          onCopyCode={handleCopyCode}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
