const { MongoClient } = require('mongodb');
const crypto = require('crypto');

const CATS = ['Rent', 'Utilities', 'Groceries', 'Transport', 'Dining', 'Fun', 'Other'];
let pending = null;

function vaults() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (!pending) {
    pending = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5 })
      .connect()
      .catch((e) => { pending = null; throw e; });
  }
  return pending.then((c) => c.db(process.env.MONGODB_DB || 'budget').collection('vaults'));
}

class Bad extends Error {
  constructor(m, s) { super(m); this.status = s || 400; }
}
const rid = (n) => crypto.randomBytes(n).toString('hex');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
const isId = (s) => typeof s === 'string' && /^[a-f0-9]{24}$/.test(s);

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}
function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) {} }
  return {};
}
function fail(res, e) {
  if (e && e.status) return send(res, e.status, { error: e.message });
  console.error(e);
  return send(res, 500, { error: 'Something went wrong on the server. Try again.' });
}
function num(v) {
  v = Number(v);
  if (!isFinite(v) || v < 0 || v > 1e9) throw new Bad('Enter a valid number.');
  return Math.round(v * 100) / 100;
}
async function auth(req) {
  const id = req.headers['x-vault'], token = req.headers['x-token'];
  if (!isId(id) || !token) throw new Bad('Please unlock with your PIN.', 401);
  const col = await vaults();
  const doc = await col.findOne({ _id: id });
  if (!doc || !doc.sessions.includes(sha(token))) throw new Bad('Please unlock with your PIN.', 401);
  return { col, doc };
}
function pub(d) {
  return { id: d._id, name: d.name, income: d.income, budgets: d.budgets, goal: d.goal, entries: d.entries };
}

module.exports = { CATS, vaults, Bad, rid, sha, hashPin, isId, send, bodyOf, fail, num, auth, pub };
