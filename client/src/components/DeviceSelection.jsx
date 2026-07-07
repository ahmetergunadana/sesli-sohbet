import { useState, useEffect, useRef } from 'react';

function isSecureContext() {
  return window.isSecureContext || 
         location.hostname === 'localhost' || 
         location.hostname === '127.0.0.1';
}

export default function DeviceSelection({ onDeviceSelected, onError }) {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testStream, setTestStream] = useState(null);
  const audioContextRef = useRef(null);
  const analyzerRef = useRef(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const animFrameRef = useRef(null);
  const callbackFired = useRef(false);

  const secure = isSecureContext();

  useEffect(() => {
    if (!secure && !callbackFired.current) {
      callbackFired.current = true;
      const timer = setTimeout(() => onDeviceSelected(null), 500);
      return () => clearTimeout(timer);
    }

    if (!secure) return;

    const initDevices = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          if (!callbackFired.current) {
            callbackFired.current = true;
            onDeviceSelected(null);
          }
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());

        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = allDevices.filter(d => d.kind === 'audioinput');
        setDevices(audioDevices);

        if (audioDevices.length > 0) {
          setSelectedDevice(audioDevices[0].deviceId);
        }
      } catch (err) {
        if (!callbackFired.current) {
          callbackFired.current = true;
          onDeviceSelected(null);
        }
      }
    };

    initDevices();
  }, [secure, onDeviceSelected]);

  const startTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedDevice ? { deviceId: { exact: selectedDevice } } : true,
      });

      setTestStream(stream);
      setIsTesting(true);

      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyzerRef.current = audioContextRef.current.createAnalyser();
      analyzerRef.current.fftSize = 256;
      source.connect(analyzerRef.current);

      // Chrome autoplay politikası için - AudioContext ile sidetone
      source.connect(audioContextRef.current.destination);

      const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);

      const updateLevel = () => {
        if (!analyzerRef.current) return;
        analyzerRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(average);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();

      setTimeout(() => stopTest(), 5000);
    } catch (err) {
      onError?.('Test sırasında hata oluştu');
    }
  };

  const stopTest = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (testStream) testStream.getTracks().forEach(t => t.stop());
    setIsTesting(false);
    setTestStream(null);
    setAudioLevel(0);
    analyzerRef.current = null;
  };

  const handleContinue = () => {
    if (callbackFired.current) return;
    callbackFired.current = true;
    stopTest();
    onDeviceSelected(selectedDevice);
  };

  useEffect(() => {
    return () => stopTest();
  }, []);

  // HTTP modunda yükleniyor göster
  if (!secure) {
    return (
      <div className="device-selection">
        <h3>🎙️ Odaya hazırlanılıyor...</h3>
        <div className="device-loading">Sohbete bağlanılıyor...</div>
      </div>
    );
  }

  return (
    <div className="device-selection">
      <h3>🎤 Mikrofonunu Seç</h3>
      <p className="device-selection-desc">
        Sohbete katılmadan önce mikrofonunu test edebilirsin.
      </p>

      {devices.length === 0 ? (
        <div className="device-loading">Cihazlar yükleniyor...</div>
      ) : (
        <>
          <div className="input-group">
            <label htmlFor="device-select">Mikrofon Seç</label>
            <select
              id="device-select"
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              disabled={isTesting}
            >
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Mikrofon ${devices.indexOf(device) + 1}`}
                </option>
              ))}
            </select>
          </div>

          <div className="audio-test-section">
            <div className="audio-level-container">
              <div
                className="audio-level-bar"
                style={{ width: `${Math.min(audioLevel * 2, 100)}%` }}
              />
              {isTesting && (
                <span className="audio-level-text">
                  {audioLevel > 30 ? '🎤 Ses algılanıyor...' : '🔇 Sessizlik'}
                </span>
              )}
            </div>

            {!isTesting ? (
              <button type="button" className="btn btn-secondary" onClick={startTest}>
                🧪 Test Et (5 sn)
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={stopTest}>
                ⏹️ Durdur
              </button>
            )}
          </div>

          <button type="button" className="btn btn-primary" onClick={handleContinue}>
            Devam Et
          </button>
        </>
      )}
    </div>
  );
}
