import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Davet linkinden gelen redirect parametresi
  const redirectTo = searchParams.get('redirect');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Lütfen isminizi girin');
      return;
    }

    setLoading(true);
    try {
      await login(name.trim());

      // Redirect varsa oraya, yoksa ana sayfaya
      if (redirectTo) {
        navigate(redirectTo, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🎙️ Sesli Sohbet</h1>
        <p>
          {redirectTo
            ? 'Sohbete katılmak için isminizi girin.'
            : 'Hoş geldiniz! Sohbete katılmak için isminizi girin.'}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="name">İsminiz</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn: Ahmet"
              maxLength={100}
              autoFocus
            />
          </div>

          {error && <div className="error-text">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Giriş yapılıyor...' : 'Sohbete Başla'}
          </button>
        </form>
      </div>
    </div>
  );
}
