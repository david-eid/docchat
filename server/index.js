import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { loadEnvFile } from 'node:process';
import { pathToFileURL } from 'node:url';

try {
  loadEnvFile(new URL('.env', import.meta.url));
} catch (error) {
  if (error.code !== 'ENOENT') throw new Error('Could not load server/.env');
}

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('Set SESSION_SECRET in server/.env to a private random value of at least 32 characters.');
}

export const prisma = new PrismaClient();
export const app = express();
app.use(express.json()); // Read JSON request bodies.

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is alive' });
});

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

// MemoryStore is sufficient for local coursework. Server restarts end sessions.
app.use(session({
  name: 'docchat.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { ...cookieOptions, maxAge: 24 * 60 * 60 * 1000 },
}));

const safeUser = { id: true, name: true };
const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = (email) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validPassword = (password) => typeof password === 'string'
  && password.length > 0 && Buffer.byteLength(password, 'utf8') <= 72;

async function logIn(req, userId) {
  // Replace the old session ID when authentication succeeds.
  await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  req.session.userId = userId;
  await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
}

app.post('/api/register', async (req, res) => {
  const { name, password } = req.body ?? {};
  const email = normalizeEmail(req.body?.email);
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || !validEmail(email)
    || !validPassword(password) || password.length < 8) {
    return res.status(400).json({ error: 'Enter a name (1–100 characters), a valid email, and a password of at least 8 characters (at most 72 UTF-8 bytes).' });
  }
  try {
    const user = await prisma.user.create({
      data: { email, name: name.trim(), password: await bcrypt.hash(password, 10) },
      select: safeUser,
    });
    await logIn(req, user.id);
    res.status(201).json({ user });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'An account with this email already exists.' });
    throw error;
  }
});

app.post('/api/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!validEmail(email) || !validPassword(password)) {
    return res.status(400).json({ error: 'Enter a valid email and password.' });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  await logIn(req, user.id);
  res.json({ user: { id: user.id, name: user.name } });
});

app.get('/api/me', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!req.session.userId) return res.json({ user: null });
  const user = await prisma.user.findUnique({ where: { id: req.session.userId }, select: safeUser });
  if (!user) delete req.session.userId;
  res.json({ user });
});

app.post('/api/logout', (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('docchat.sid', cookieOptions);
    res.json({ success: true });
  });
});

// Do not send Prisma errors or connection details to the browser or console.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON request.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  res.status(500).json({ error: 'Unable to complete the request. Please try again later.' });
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}
