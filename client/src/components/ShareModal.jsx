import { useState } from 'react';

export default function ShareModal({ code, roomName, onClose, onCopyLink, onCopyCode }) {
  const [toast, setToast] = useState(null);

  const shareUrl = `${window.location.origin}/room/${code}`;

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  const handleShareLink = async () => {
    const shareData = {
      title: 'Sesli Sohbet Odası',
      text: `"${roomName || 'Sohbet Odası'}" odasına katıl!`,
      url: shareUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        showToast('Paylaşım başarılı!');
      } catch (err) {
        if (err.name !== 'AbortError') {
          await navigator.clipboard.writeText(shareUrl);
          showToast('Link kopyalandı!');
        }
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link kopyalandı!');
    }
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(code);
    showToast('Kod kopyalandı!');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>📤 Davet Yöntemi Seçin</h3>

        <div className="share-options-grid">
          <button className="share-option-btn" onClick={handleShareLink}>
            <div className="share-option-icon">🔗</div>
            <div className="share-option-title">Davet Bağlantısı ile</div>
            <div className="share-option-desc">
              {navigator.share ? 'Doğrudan paylaş' : 'Linki kopyala ve paylaş'}
            </div>
          </button>

          <button className="share-option-btn" onClick={handleCopyCode}>
            <div className="share-option-icon">🔢</div>
            <div className="share-option-title">Oda Kodu ile</div>
            <div className="share-option-desc">6 haneli kodu kopyala</div>
          </button>
        </div>

        <div className="share-code-display">
          <span className="share-code-label">Oda Kodu:</span>
          <span className="share-code-value">{code}</span>
        </div>

        <button className="btn btn-secondary close-btn" onClick={onClose}>
          Kapat
        </button>

        {toast && <div className="modal-toast">{toast}</div>}
      </div>
    </div>
  );
}
