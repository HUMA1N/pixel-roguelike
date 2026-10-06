const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load');

const { utils: U } = load();

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

test('formatTime показывает минуты и секунды', () => {
  assert.equal(U.formatTime(0), '0:00');
  assert.equal(U.formatTime(65.9), '1:05');
  assert.equal(U.formatTime(600), '10:00');
});

test('normalize не ломается на нулевом векторе', () => {
  assert.deepEqual(U.normalize(0, 0), { x: 0, y: 0 });
  const v = U.normalize(3, 4);
  assert.ok(Math.abs(v.x - 0.6) < 1e-9 && Math.abs(v.y - 0.8) < 1e-9);
});

test('генератор случайных чисел повторяется при одинаковом зерне', () => {
  const a = U.makeRng(42);
  const b = U.makeRng(42);
  for (let i = 0; i < 10; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test('рекорд сохраняется и обновляется только при лучшем времени', () => {
  const s = memoryStorage();
  assert.deepEqual(U.loadBest(s), { time: 0, kills: 0, level: 0 });

  let r = U.saveBest(s, { time: 60, kills: 30, level: 4 });
  assert.equal(r.isNew, true);
  assert.equal(U.loadBest(s).time, 60);

  r = U.saveBest(s, { time: 30, kills: 50, level: 2 });
  assert.equal(r.isNew, false);
  assert.deepEqual(U.loadBest(s), { time: 60, kills: 50, level: 4 });
});

test('битые данные или недоступное хранилище не роняют игру', () => {
  const s = memoryStorage();
  s.setItem(U.BEST_KEY, '{не json');
  assert.deepEqual(U.loadBest(s), { time: 0, kills: 0, level: 0 });
  const broken = {
    getItem() {
      throw new Error('нет доступа');
    },
    setItem() {
      throw new Error('нет доступа');
    },
  };
  assert.deepEqual(U.loadBest(broken), { time: 0, kills: 0, level: 0 });
  assert.doesNotThrow(() => U.saveBest(broken, { time: 5, kills: 1, level: 1 }));
  assert.doesNotThrow(() => U.saveBest(null, { time: 5, kills: 1, level: 1 }));
});
