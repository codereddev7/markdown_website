import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const { login, register } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (isSignUp) {
      const result = await register(email, password);
      if (result.success) {
        navigate('/');
      } else {
        setError(result.msg);
      }
    } else {
      const success = await login(email, password);
      if (success) {
        navigate('/');
      } else {
        setError('Invalid email or password');
      }
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>{isSignUp ? 'Sign Up' : 'Admin Login'}</h2>
        {error && <div style={{ color: 'var(--danger)', marginBottom: '15px', textAlign: 'center' }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}>
            {isSignUp ? 'Sign Up' : 'Login'}
          </button>
        </form>
        <div style={{ marginTop: '20px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button className="action-btn" onClick={() => { setIsSignUp(!isSignUp); setError(''); }} style={{ fontSize: '0.9rem' }}>
            {isSignUp ? 'Already have an account? Login' : "Don't have an account? Sign Up"}
          </button>
          <button className="action-btn" onClick={() => navigate('/')}>
            ← Back to Public View
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
