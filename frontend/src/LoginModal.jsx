import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { apiPost, saveTokens } from './api';
import logo from './assets/Municipality of San Pascual.jpg';

function PasswordInput({ value, onChange, placeholder, show, onToggle, required, autoFocus }) {
  return (
    <div className="lp-password-wrapper">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      <button type="button" className="lp-eye-btn" onClick={onToggle} tabIndex={-1}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export default function LoginModal({ onLoginSuccess }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await apiPost('/api/auth/login/', {
        role: 'admin',
        identifier,
        password,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed.');
        return;
      }
      saveTokens({ access: data.access, refresh: data.refresh });
      onLoginSuccess(data.username, data.is_staff, data.full_name);
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="lp-page">
      <div className="lp-bg" />

      <div className="lp-wrapper">
        <div className="lp-card">
          <div className="lp-brand">
            <img src={logo} alt="Municipality Logo" className="lp-logo-img" />
            <div>
              <div className="lp-brand-title">San Pascual, Batangas</div>
              <div className="lp-brand-sub">E-TAXMAP</div>
            </div>
          </div>

          <h1 className="lp-heading">Login</h1>

          {error && <div className="lp-error">{error}</div>}

          <form onSubmit={handleLogin} className="lp-form">
            <div className="lp-field">
              <label>Admin Email or ID</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter your admin email or ID"
                required
                autoFocus
              />
            </div>

            <div className="lp-field">
              <label>Password</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                required
              />
            </div>

            <button type="submit" className="lp-submit" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Log-in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
