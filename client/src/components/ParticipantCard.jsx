import { useRef, useEffect, useState } from 'react';

export default function ParticipantCard({
  participant,
  isMe,
  remoteStream,
  localStream,
  sidetone = false,
  audioContextRef,
}) {
  const audioRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const analyzerCleanupRef = useRef(null);

  useEffect(() => {
    const stream = isMe ? localStream : remoteStream;
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
    }
  }, [isMe, localStream, remoteStream]);

  // Simple speaking detection - shared AudioContext kullan
  useEffect(() => {
    const stream = isMe ? localStream : remoteStream;
    if (!stream || !audioContextRef?.current) return;

    // Önceki analyzer'ı temizle
    if (analyzerCleanupRef.current) {
      analyzerCleanupRef.current();
      analyzerCleanupRef.current = null;
    }

    const audioContext = audioContextRef.current;
    const source = audioContext.createMediaStreamSource(stream);
    const analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 256;

    source.connect(analyzer);

    const dataArray = new Uint8Array(analyzer.frequencyBinCount);
    let speakingTimeout = null;
    let animFrameId = null;

    const checkSpeaking = () => {
      analyzer.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

      if (average > 30) {
        setIsSpeaking(true);
        clearTimeout(speakingTimeout);
        speakingTimeout = setTimeout(() => setIsSpeaking(false), 300);
      }

      if (audioContext.state !== 'closed') {
        animFrameId = requestAnimationFrame(checkSpeaking);
      }
    };

    checkSpeaking();

    analyzerCleanupRef.current = () => {
      cancelAnimationFrame(animFrameId);
      clearTimeout(speakingTimeout);
      source.disconnect();
      analyzer.disconnect();
    };

    return () => {
      if (analyzerCleanupRef.current) {
        analyzerCleanupRef.current();
        analyzerCleanupRef.current = null;
      }
    };
  }, [isMe, localStream, remoteStream, audioContextRef]);

  const getInitials = (name) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div
      className={`participant-card ${isSpeaking ? 'is-speaking' : ''} ${
        isMe ? 'is-me' : ''
      }`}
    >
      <audio ref={audioRef} autoPlay playsInline muted={isMe && !sidetone} />
      <div className="participant-avatar">
        {getInitials(participant.name)}
      </div>
      <div className="participant-name">
        {participant.name} {isMe && '(Sen)'}
      </div>
      <div className="participant-status">
        <div
          className={`status-icon ${
            participant.isMuted ? 'muted' : 'unmuted'
          }`}
        >
          {participant.isMuted ? '🔇' : '🎤'}
        </div>
      </div>
    </div>
  );
}
