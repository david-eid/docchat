
import { useState, useEffect } from 'react';
import ProjectCard from './components/ProjectCard';
import LoginForm from './components/LoginForm';
import RegisterForm from './components/RegisterForm';

function App() {
  const [dark, setDark] = useState(false);
  const [serverMsg, setServerMsg] = useState('loading...');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [sessionCheck, setSessionCheck] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/me', { credentials: 'include', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Could not check your session. Please try again.');
        return response.json();
      })
      .then((data) => setUser(data.user))
      .catch((error) => {
        if (!controller.signal.aborted) setAuthError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [sessionCheck]);

  function onLoggedIn(currentUser) {
    setUser(currentUser);
    setAuthError('');
  }

  async function logout() {
    setLoggingOut(true);
    setAuthError('');
    try {
      const response = await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Logout failed. Please try again.');
      setUser(null);
    } catch {
      setAuthError('Could not log out. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  }

  useEffect(() => {
    fetch('/api/health')
      .then((response) => {
        if (!response.ok) throw new Error('Server request failed');
        return response.json();
      })
      .then((data) => setServerMsg(data.message))
      .catch(() => setServerMsg('Could not reach the server'));
  }, []);

  return (
    <main className={dark ? 'dark' : 'light'}>
      <header>
        <h1>My Portfolio</h1>
        <button onClick={() => setDark(!dark)}>
          Toggle theme
        </button>
      </header>

      <p>Server says: {serverMsg}</p>

      <section aria-labelledby="auth-title">
        <h2 id="auth-title">DocChat account</h2>
        {authError && <p className="error" role="alert">{authError}</p>}
        {loading ? <p role="status">Checking your session…</p> : user ? (
          <div className="card">
            <p role="status">Welcome, {user.name}!</p>
            <button onClick={logout} disabled={loggingOut}>
              {loggingOut ? 'Logging out…' : 'Logout'}
            </button>
          </div>
        ) : authError ? (
          <button onClick={() => {
            setAuthError('');
            setLoading(true);
            setSessionCheck((value) => value + 1);
          }}>Retry session check</button>
        ) : (
          <div className="auth-grid">
            <RegisterForm onLoggedIn={onLoggedIn} />
            <LoginForm onLoggedIn={onLoggedIn} />
          </div>
        )}
      </section>

      <ProjectCard
        title="Team Project"
        description="A Flask web app."
      />

      <ProjectCard
        title="DocChat"
        description="React + AI you can ask about any document."
      />
    </main>
  );
}

export default App;
