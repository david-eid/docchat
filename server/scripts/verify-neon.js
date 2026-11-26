// Opt-in integration check: creates one test account and never deletes records.
// Run from server/: node --env-file=.env scripts/verify-neon.js
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { neonConfig } from '@neondatabase/serverless';
import { app, prisma } from '../index.js';

let httpsQueries = 0;
neonConfig.fetchFunction = async (url, options) => {
  const endpoint = new URL(url);
  assert.equal(endpoint.protocol, 'https:');
  assert.equal(endpoint.port || '443', '443');
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  if (response.ok) httpsQueries++;
  return response;
};

const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
async function request(path, body, cookie) {
  const response = await fetch(`${base}/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  return { status: response.status, data: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

try {
  const migrations = await prisma.$queryRaw`SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY migration_name`;
  await prisma.user.count();
  const documentCount = await prisma.document.count();
  const messageCount = await prisma.message.count();
  console.log('PASS: environment loaded, existing models and migration history readable');
  assert.equal((await request('health')).status, 200);
  assert.deepEqual((await request('me')).data, { user: null });
  assert.equal((await request('register', {})).status, 400);
  assert.equal((await request('login', {})).status, 400);

  const account = { name: 'Part 2 V2 verification',
    email: `docchat-v2-${randomUUID()}@example.com`, password: randomUUID() };
  const registered = await request('register', account);
  assert.equal(registered.status, 201);
  console.log(`Test account retained: ${account.email}`);
  assert.ok(registered.cookie);
  const stored = await prisma.user.findUnique({ where: { email: account.email } });
  assert.notEqual(stored.password, account.password);
  assert.equal(bcrypt.getRounds(stored.password), 10);
  assert.equal(await bcrypt.compare(account.password, stored.password), true);
  assert.equal('password' in registered.data.user, false);
  console.log('PASS: registration and stored bcrypt hash');
  assert.equal((await request('register', account)).status, 409);
  assert.deepEqual((await request('me', undefined, registered.cookie)).data, registered.data);
  assert.deepEqual((await request('me', undefined, registered.cookie)).data, registered.data);
  assert.equal((await request('logout', {}, registered.cookie)).status, 200);
  assert.deepEqual((await request('me', undefined, registered.cookie)).data, { user: null });
  assert.equal((await request('login', { ...account, password: 'incorrect' })).status, 401);
  const login = await request('login', account);
  assert.equal(login.status, 200);
  assert.ok(login.cookie);
  assert.notEqual(login.cookie, registered.cookie);
  assert.deepEqual((await request('me', undefined, login.cookie)).data, registered.data);
  assert.equal((await request('logout', {}, login.cookie)).status, 200);
  assert.deepEqual((await request('me', undefined, login.cookie)).data, { user: null });
  assert.equal(await prisma.document.count(), documentCount);
  assert.equal(await prisma.message.count(), messageCount);
  assert.deepEqual(await prisma.$queryRaw`SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY migration_name`, migrations);
  assert.ok(httpsQueries > 0);
  console.log(`PASS: ${httpsQueries} successful Neon HTTPS requests on port 443`);
  console.log('PASS: health, register, login, me, logout, duplicates, invalid input, incorrect password, bcrypt and cookie persistence');
  console.log('PASS: document/message counts and migration history unchanged; no records deleted');
  console.log('Cookie replay simulates refresh; this is not a browser or physical USEK Wi-Fi test.');
} catch (error) {
  if (error.code === 'ERR_ASSERTION' && typeof error.actual === 'number') {
    console.error(`Assertion: expected ${error.expected}, received ${error.actual}`);
  }
  console.error('FAIL: Neon integration verification (error details suppressed to protect secrets).');
  process.exitCode = 1;
} finally {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
  neonConfig.fetchFunction = undefined;
}
