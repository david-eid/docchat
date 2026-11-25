import { useState } from 'react';

export default function RegisterForm({ onLoggedIn }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (new TextEncoder().encode(password).length > 72) {
      setError('Password must be at most 72 UTF-8 bytes.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Registration failed.');
      onLoggedIn(data.user);
    } catch (error) {
      setError(error instanceof TypeError ? 'Could not reach the server. Please try again.' : error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card auth-form" onSubmit={handleSubmit} aria-labelledby="register-title">
      <h2 id="register-title">Create an account</h2>
      <p>Get started with DocChat.</p>
      <fieldset disabled={submitting}>
        <label htmlFor="register-name">Name</label>
        <input id="register-name" autoComplete="name" required maxLength={100}
          value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="register-email">Email</label>
        <input id="register-email" type="email" autoComplete="email" required maxLength={254}
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="register-password">Password</label>
        <input id="register-password" type="password" autoComplete="new-password" required minLength={8}
          aria-describedby="password-hint" value={password} onChange={(e) => setPassword(e.target.value)} />
        <small id="password-hint">At least 8 characters; at most 72 UTF-8 bytes.</small>
        <button type="submit">{submitting ? 'Creating account…' : 'Register'}</button>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
