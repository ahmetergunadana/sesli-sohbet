import { useState, useRef, useCallback, useEffect } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

export function useWebRTC(socket, localUserId) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const peerConnections = useRef(new Map());
  const pendingCandidates = useRef(new Map());
  const streamRef = useRef(null);

  useEffect(() => {
    streamRef.current = localStream;
  }, [localStream]);

  const removePeerConnection = useCallback((peerUserId) => {
    const pc = peerConnections.current.get(peerUserId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(peerUserId);
    }
    pendingCandidates.current.delete(peerUserId);
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(peerUserId);
      return next;
    });
  }, []);

  const startLocalStream = useCallback(async (deviceId) => {
    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(deviceId && { deviceId: { exact: deviceId } }),
        },
        video: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);

      // Mevcut peer connection'lara stream ekle
      peerConnections.current.forEach((pc, peerUserId) => {
        const senders = pc.getSenders();
        const hasAudio = senders.some(s => s.track?.kind === 'audio');
        if (!hasAudio) {
          stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
          });
          // Yeniden offer gönder
          if (socket) {
            pc.createOffer().then(offer => {
              pc.setLocalDescription(offer);
              socket.sendSignal(peerUserId, offer, 'offer');
            });
          }
        }
      });

      return stream;
    } catch (error) {
      console.error('Failed to get local stream:', error);
      throw error;
    }
  }, [socket]);

  const createPeerConnection = useCallback(
    (peerUserId) => {
      if (peerConnections.current.has(peerUserId)) {
        return peerConnections.current.get(peerUserId);
      }

      console.log(`Creating peer connection for ${peerUserId}`);
      const pc = new RTCPeerConnection(ICE_SERVERS);

      const currentStream = streamRef.current;
      if (currentStream) {
        currentStream.getTracks().forEach((track) => {
          console.log(`Adding track to peer ${peerUserId}:`, track.kind);
          pc.addTrack(track, currentStream);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`[WebRTC] ICE candidate sent to ${peerUserId}: ${event.candidate.candidate.substring(0, 50)}...`);
          socket.sendSignal(peerUserId, event.candidate, 'ice-candidate');
        } else {
          console.log(`[WebRTC] ICE gathering complete for ${peerUserId}`);
        }
      };

      pc.onicegatheringstatechange = () => {
        console.log(`[WebRTC] ICE gathering ${peerUserId}: ${pc.iceGatheringState}`);
      };

      pc.ontrack = (event) => {
        console.log(`Got remote track from ${peerUserId}:`, event.track.kind);
        const [remoteStream] = event.streams;
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(peerUserId, remoteStream);
          return next;
        });
      };

      pc.onconnectionstatechange = () => {
        console.log(`Peer ${peerUserId} connection: ${pc.connectionState}`);
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`ICE ${peerUserId}: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'failed') {
          removePeerConnection(peerUserId);
        }
      };

      peerConnections.current.set(peerUserId, pc);
      return pc;
    },
    [socket, removePeerConnection]
  );

  const createOffer = useCallback(
    async (peerUserId) => {
      try {
        let pc = peerConnections.current.get(peerUserId);
        if (!pc) {
          pc = createPeerConnection(peerUserId);
        }

        // Stream henüz eklenmediyse ekle
        const currentStream = streamRef.current;
        if (currentStream) {
          const senders = pc.getSenders();
          const hasAudio = senders.some(s => s.track?.kind === 'audio');
          if (!hasAudio) {
            console.log(`Adding missing audio track for ${peerUserId}`);
            currentStream.getTracks().forEach(track => {
              pc.addTrack(track, currentStream);
            });
          }
        }

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.sendSignal(peerUserId, offer, 'offer');
        console.log(`Offer sent to ${peerUserId}`);
      } catch (error) {
        console.error('Error creating offer:', error);
      }
    },
    [createPeerConnection, socket]
  );

  const handleOffer = useCallback(
    async (fromUserId, offer) => {
      try {
        let pc = peerConnections.current.get(fromUserId);
        if (!pc) {
          pc = createPeerConnection(fromUserId);
        }

        // Stream henüz eklenmediyse ekle
        const currentStream = streamRef.current;
        if (currentStream) {
          const senders = pc.getSenders();
          const hasAudio = senders.some(s => s.track?.kind === 'audio');
          if (!hasAudio) {
            console.log(`Adding missing audio track for ${fromUserId} (offer)`);
            currentStream.getTracks().forEach(track => {
              pc.addTrack(track, currentStream);
            });
          }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        const pending = pendingCandidates.current.get(fromUserId) || [];
        for (const candidate of pending) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidates.current.delete(fromUserId);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.sendSignal(fromUserId, answer, 'answer');
        console.log(`Answer sent to ${fromUserId}`);
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    },
    [createPeerConnection, socket]
  );

  const handleAnswer = useCallback(
    async (fromUserId, answer) => {
      const pc = peerConnections.current.get(fromUserId);
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));

        const pending = pendingCandidates.current.get(fromUserId) || [];
        for (const candidate of pending) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidates.current.delete(fromUserId);
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    },
    []
  );

  const handleIceCandidate = useCallback(
    async (fromUserId, candidate) => {
      const pc = peerConnections.current.get(fromUserId);
      if (!pc) {
        if (!pendingCandidates.current.has(fromUserId)) {
          pendingCandidates.current.set(fromUserId, []);
        }
        pendingCandidates.current.get(fromUserId).push(candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    },
    []
  );

  const toggleMute = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        return !audioTrack.enabled;
      }
    }
    return false;
  }, [localStream]);

  useEffect(() => {
    return () => {
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [localStream]);

  return {
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
  };
}
