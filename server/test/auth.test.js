import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';

process.env.SESSION_SECRET = 'test-only-session-secret-not-for-real-use';
process.env.DATABASE_URL = 'postgresql://test:test@localhost/docchat_test';
const { app, prisma } = await import('../index.js');

// Exercise real HTTP, bcrypt and session middleware with an in-memory database
// double. These checks do not claim to verify PostgreSQL or a Prisma migration.
const users = [];
prisma.user.create = async ({ data, select }) => {
  if (users.some((user) => user.email === data.email)) {
    throw Object.assign(new Error('Duplicate'), { code: 'P2002' });
  }
  const user = { id: users.length + 1, ...data };
  users.push(user);
  return select ? { id: user.id, name: user.name } : user;
};
prisma.user.findUnique = async ({ where, select }) => {
  const user = users.find((item) => where.id ? item.id === where.id : item.email === where.email);
  return user ? (select ? { id: user.id, name: user.name } : user) : null;
};

let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

async function request(path, { body, cookie, raw } = {}) {
  const response = await fetch(`${base}/api/${path}`, {
    method: body !== undefined || raw !== undefined ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
}

test('health and anonymous session work without a database', async () => {
  assert.deepEqual((await request('health')).data, { status: 'ok', message: 'Server is alive' });
  const result = await request('me');
  assert.deepEqual(result.data, { user: null });
  assert.equal(result.cookie, null);
});

test('registration validates fields and JSON', async () => {
  for (const body of [{}, { name: ' ', email: 'a@example.com', password: 'password1' },
    { name: 'Ada', email: 'invalid', password: 'password1' },
    { name: 'Ada', email: 'a@example.com', password: 'short' },
    { name: 'Ada', email: 'a@example.com', password: '😀'.repeat(19) }]) {
    assert.equal((await request('register', { body })).status, 400);
  }
  assert.equal((await request('register', { raw: '{broken' })).status, 400);
});

test('registration, hashed storage, duplicate rejection, login, session persistence and logout', async () => {
  const body = { name: ' Ada ', email: ' ADA@example.com ', password: 'coursework-password' };
  const registration = await request('register', { body });
  assert.equal(registration.status, 201);
  assert.deepEqual(registration.data, { user: { id: 1, name: 'Ada' } });
  assert.match(registration.cookie, /HttpOnly/);
  assert.match(registration.cookie, /SameSite=Lax/);
  const cookie = registration.cookie.split(';')[0];
  assert.equal(users[0].email, 'ada@example.com');
  assert.notEqual(users[0].password, body.password);
  assert.equal(bcrypt.getRounds(users[0].password), 10);
  assert.equal(await bcrypt.compare(body.password, users[0].password), true);
  assert.deepEqual((await request('me', { cookie })).data, registration.data);
  // A fresh HTTP request carrying the same cookie simulates a page reload.
  assert.deepEqual((await request('me', { cookie })).data, registration.data);
  assert.equal((await request('register', { body })).status, 409);
  assert.equal((await request('logout', { body: {}, cookie })).status, 200);
  assert.deepEqual((await request('me', { cookie })).data, { user: null });
  assert.equal((await request('login', { body: { email: body.email, password: 'wrong-password' } })).status, 401);
  assert.equal((await request('login', { body: { email: 'unknown@example.com', password: body.password } })).status, 401);
  assert.equal((await request('login', { body: {} })).status, 400);
  const login = await request('login', { body });
  assert.equal(login.status, 200);
  assert.deepEqual(login.data, registration.data);
  const loginCookie = login.cookie.split(';')[0];
  assert.notEqual(loginCookie, cookie);
  assert.deepEqual((await request('me', { cookie: loginCookie })).data, registration.data);
  const logout = await request('logout', { body: {}, cookie: loginCookie });
  assert.deepEqual(logout.data, { success: true });
  assert.match(logout.cookie, /Expires=Thu, 01 Jan 1970/);
  assert.deepEqual((await request('me', { cookie: loginCookie })).data, { user: null });
});

test('Neon HTTP duplicate errors preserve the existing conflict response', async () => {
  const original = prisma.user.create;
  prisma.user.create = async () => { throw Object.assign(new Error('private-database-details'), { code: '23505' }); };
  try {
    const result = await request('register', { body: { name: 'Ada', email: 'ada@example.com', password: 'password1' } });
    assert.equal(result.status, 409);
    assert.deepEqual(result.data, { error: 'An account with this email already exists.' });
  } finally {
    prisma.user.create = original;
  }
});

test('database errors never expose internal details', async () => {
  const original = prisma.user.findUnique;
  prisma.user.findUnique = async () => { throw new Error('private-database-details'); };
  try {
    const result = await request('login', { body: { email: 'ada@example.com', password: 'password1' } });
    assert.equal(result.status, 500);
    assert.deepEqual(result.data, { error: 'Unable to complete the request. Please try again later.' });
  } finally {
    prisma.user.findUnique = original;
  }
});
