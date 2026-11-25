import { useState } from 'react';

export default function LoginForm({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Login failed.');
      onLoggedIn(data.user);
    } catch (error) {
      setError(error instanceof TypeError ? 'Could not reach the server. Please try again.' : error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card auth-form" onSubmit={handleSubmit} aria-labelledby="login-title">
      <h2 id="login-title">Log in</h2>
      <p>Welcome back to DocChat.</p>
      <fieldset disabled={submitting}>
        <label htmlFor="login-email">Email</label>
        <input id="login-email" type="email" autoComplete="email" required maxLength={254}
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="login-password">Password</label>
        <input id="login-password" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit">{submitting ? 'Logging in…' : 'Login'}</button>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
