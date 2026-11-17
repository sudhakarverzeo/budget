const crypto = require('crypto');
const L = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return L.send(res, 405, { error: 'Method not allowed' });
    const b = L.bodyOf(req);
    const col = await L.vaults();

    if (b.action === 'create') {
      const name = String(b.name || '').trim().slice(0, 40);
      if (!name) throw new L.Bad('Add your name.');
      if (!/^\d{4,6}$/.test(String(b.pin || ''))) throw new L.Bad('PIN must be 4 to 6 digits.');
      const salt = L.rid(8), token = L.rid(24), id = L.rid(12);
      const budgets = {};
      L.CATS.forEach((c) => { budgets[c] = 0; });
      await col.insertOne({
        _id: id, name, salt, pinHash: L.hashPin(b.pin, salt),
        sessions: [L.sha(token)], fails: 0, lockUntil: 0,
        income: 0, budgets, goal: { name: 'Savings goal', target: 0, saved: 0 },
        entries: [], createdAt: Date.now(),
      });
      return L.send(res, 201, { id, token });
    }

    if (b.action === 'login') {
      if (!L.isId(b.id)) throw new L.Bad('That vault code does not look right.');
      const doc = await col.findOne({ _id: b.id });
      if (!doc) throw new L.Bad('No vault found with that code.', 404);
      const now = Date.now();
      if (doc.lockUntil > now) {
        throw new L.Bad('Too many wrong tries. Try again in ' + Math.ceil((doc.lockUntil - now) / 60000) + ' min.', 429);
      }
      const a = Buffer.from(L.hashPin(String(b.pin || ''), doc.salt), 'hex');
      const c = Buffer.from(doc.pinHash, 'hex');
      if (!crypto.timingSafeEqual(a, c)) {
        const fails = (doc.fails || 0) + 1;
        const set = fails >= 5 ? { fails: 0, lockUntil: now + 15 * 60000 } : { fails };
        await col.updateOne({ _id: doc._id }, { $set: set });
        throw new L.Bad('Wrong PIN.', 401);
      }
      const token = L.rid(24);
      await col.updateOne(
        { _id: doc._id },
        { $set: { fails: 0, lockUntil: 0 }, $push: { sessions: { $each: [L.sha(token)], $slice: -10 } } }
      );
      return L.send(res, 200, { id: doc._id, token });
    }

    throw new L.Bad('Unknown action.');
  } catch (e) {
    return L.fail(res, e);
  }
};
