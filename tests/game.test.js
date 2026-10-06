const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load');

const SV = load();
const G = SV.game;

function run(g, seconds, input) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps && g.state === 'playing'; i++) G.update(g, 1 / 60, input || { x: 0, y: 0 });
}

test('новая игра начинается с полным здоровьем на первом уровне', () => {
  const g = G.createGame({ seed: 1 });
  assert.equal(g.state, 'playing');
  assert.equal(g.level, 1);
  assert.equal(g.player.hp, g.player.maxHp);
  assert.equal(g.enemies.length, 0);
});

test('герой двигается по вводу', () => {
  const g = G.createGame({ seed: 1 });
  run(g, 1, { x: 1, y: 0 });
  assert.ok(g.player.x > 100, 'герой ушёл вправо');
  assert.ok(Math.abs(g.player.y) < 1);
});

test('диагональ не быстрее прямого движения', () => {
  const a = G.createGame({ seed: 1 });
  const b = G.createGame({ seed: 1 });
  G.update(a, 0.05, { x: 1, y: 0 });
  G.update(b, 0.05, { x: 1, y: 1 });
  const da = Math.hypot(a.player.x, a.player.y);
  const db = Math.hypot(b.player.x, b.player.y);
  assert.ok(Math.abs(da - db) < 1e-9);
});

test('враги появляются за краем экрана', () => {
  const g = G.createGame({ seed: 3, viewW: 800, viewH: 600 });
  run(g, 2);
  assert.ok(g.enemies.length > 0);
});

test('герой сам стреляет и убивает врагов, с них падают кристаллы', () => {
  const g = G.createGame({ seed: 5 });
  g.enemies.push({ id: 999, type: 'slime', x: 100, y: 0, r: 11, hp: 5, maxHp: 5, speed: 0, damage: 10, xp: 1, flash: 0, kx: 0, ky: 0 });
  g.spawnAcc = -1000; // отключаем обычное появление врагов
  run(g, 1);
  assert.equal(g.kills, 1);
  assert.ok(g.gems.length + g.xp > 0, 'кристалл упал или уже собран');
});

test('кристаллы опыта дают уровень', () => {
  const g = G.createGame({ seed: 1 });
  const need = g.xpToNext;
  G.addXp(g, need);
  assert.equal(g.level, 2);
  assert.ok(g.events.some((e) => e.type === 'levelup'));
});

test('требуемый опыт растёт с уровнем', () => {
  for (let l = 1; l < 50; l++) assert.ok(G.xpForLevel(l + 1) > G.xpForLevel(l));
});

test('стоя на месте, герой рано или поздно погибает', () => {
  const g = G.createGame({ seed: 7 });
  g.player.damage = 0; // не даём отстреливаться
  run(g, 300);
  assert.equal(g.state, 'over');
  assert.ok(g.events.some((e) => e.type === 'gameover'));
});
