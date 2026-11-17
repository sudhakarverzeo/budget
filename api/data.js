const L = require('./_lib');

function entry(e) {
  if (!e || typeof e !== 'object') throw new L.Bad('Missing entry.');
  const m = String(e.m || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new L.Bad('Bad month.');
  if (!L.CATS.includes(e.cat)) throw new L.Bad('Pick a category.');
  const amt = Number(e.amt);
  if (!isFinite(amt) || amt <= 0 || amt > 1e9) throw new L.Bad('Enter an amount above zero.');
  const label = String(e.label || '').trim().slice(0, 60);
  if (!label) throw new L.Bad('Add a name.');
  const day = Math.round(Number(e.day));
  return {
    id: L.rid(5), m, cat: e.cat, rec: e.rec ? 1 : 0, label,
    amt: Math.round(amt * 100) / 100, day: day >= 1 && day <= 31 ? day : 1,
  };
}

module.exports = async (req, res) => {
  try {
    const { col, doc } = await L.auth(req);
    if (req.method === 'GET') return L.send(res, 200, L.pub(doc));
    if (req.method !== 'POST') return L.send(res, 405, { error: 'Method not allowed' });

    const op = L.bodyOf(req).op || {};
    let upd;
    if (op.type === 'add' || op.type === 'addMany') {
      const list = (op.type === 'add' ? [op.entry] : (Array.isArray(op.entries) ? op.entries : [])).slice(0, 50).map(entry);
      if (doc.entries.length + list.length > 20000) throw new L.Bad('This vault is full.');
      upd = { $push: { entries: { $each: list } } };
    } else if (op.type === 'delete') {
      upd = { $pull: { entries: { id: String(op.id) } } };
    } else if (op.type === 'settings') {
      const budgets = {};
      L.CATS.forEach((c) => { budgets[c] = L.num((op.budgets || {})[c] || 0); });
      const g = op.goal || {};
      upd = {
        $set: {
          income: L.num(op.income || 0), budgets,
          goal: { name: String(g.name || '').trim().slice(0, 40) || 'Savings goal', target: L.num(g.target || 0), saved: L.num(g.saved || 0) },
        },
      };
    } else if (op.type === 'logout') {
      await col.updateOne({ _id: doc._id }, { $pull: { sessions: L.sha(req.headers['x-token']) } });
      return L.send(res, 200, { ok: true });
    } else {
      throw new L.Bad('Unknown action.');
    }
    await col.updateOne({ _id: doc._id }, upd);
    return L.send(res, 200, L.pub(await col.findOne({ _id: doc._id })));
  } catch (e) {
    return L.fail(res, e);
  }
};
