const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load');

const SV = load();
const G = SV.game;

function run(g, seconds, input) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps && g.state !== 'over'; i++) {
    // На выборе улучшения берём первый вариант
    if (g.state === 'levelup') G.chooseUpgrade(g, 0);
    G.update(g, 1 / 60, input || { x: 0, y: 0 });
  }
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
  const e = G.makeEnemy(g, 'slime', 100, 0);
  e.speed = 0;
  g.enemies.push(e);
  g.spawnAcc = -1000; // отключаем обычное появление врагов
  run(g, 2);
  assert.equal(g.kills, 1);
  assert.ok(g.gems.length + g.xp > 0, 'кристалл упал или уже собран');
});

test('кристаллы опыта дают уровень и открывают выбор из трёх улучшений', () => {
  const g = G.createGame({ seed: 1 });
  G.addXp(g, g.xpToNext);
  assert.equal(g.level, 2);
  G.update(g, 1 / 60, { x: 0, y: 0 });
  assert.equal(g.state, 'levelup');
  assert.equal(g.choices.length, 3);
  assert.ok(g.events.some((e) => e.type === 'levelup'));
  // Пока идёт выбор, время стоит
  const t = g.time;
  G.update(g, 1, { x: 0, y: 0 });
  assert.equal(g.time, t);
  const chosen = g.choices[1].id;
  const before = g.upgrades[chosen] || 0;
  assert.ok(G.chooseUpgrade(g, 1));
  assert.equal(g.upgrades[chosen], before + 1);
  assert.equal(g.state, 'playing');
});

test('несколько уровней подряд дают несколько выборов', () => {
  const g = G.createGame({ seed: 2 });
  G.addXp(g, G.xpForLevel(1) + G.xpForLevel(2));
  assert.equal(g.level, 3);
  G.update(g, 1 / 60, { x: 0, y: 0 });
  assert.equal(g.state, 'levelup');
  G.chooseUpgrade(g, 0);
  assert.equal(g.state, 'levelup', 'второй выбор открылся сразу');
  G.chooseUpgrade(g, 0);
  assert.equal(g.state, 'playing');
  assert.equal(g.pendingLevels, 0);
});

test('со временем появляются новые виды врагов и босс', () => {
  const E = SV.enemies;
  const seen = new Set();
  const rng = SV.utils.makeRng(9);
  for (let i = 0; i < 2000; i++) seen.add(E.pickType(10, rng));
  assert.deepEqual([...seen], ['slime']);
  for (let i = 0; i < 2000; i++) seen.add(E.pickType(200, rng));
  assert.deepEqual([...seen].sort(), ['bat', 'golem', 'mage', 'slime']);

  const g = G.createGame({ seed: 4 });
  g.player.invuln = 1e9; // неуязвимый герой, чтобы дожить до босса
  run(g, E.BOSS_EVERY + 1);
  assert.ok(g.events.some((e) => e.type === 'boss'));
});

test('босс оставляет много опыта и предметы', () => {
  const g = G.createGame({ seed: 4 });
  const boss = G.makeEnemy(g, 'king', 300, 0);
  g.enemies.push(boss);
  G.damageEnemy(g, boss, 1e6, 0, 0);
  assert.equal(g.kills, 1);
  assert.ok(g.gems.filter((x) => x.kind === 'xp').length >= 6);
  assert.ok(g.gems.some((x) => x.kind === 'heart'));
  assert.ok(g.gems.some((x) => x.kind === 'magnet'));
});

test('колдун стреляет, и его снаряд ранит героя', () => {
  const g = G.createGame({ seed: 4 });
  g.spawnAcc = -1e9;
  g.upgrades = {}; // без оружия
  const m = G.makeEnemy(g, 'mage', 300, 0);
  m.shootCd = 0;
  g.enemies.push(m);
  run(g, 3);
  assert.ok(g.player.hp < g.player.maxHp);
});

test('каждое оружие наносит урон', () => {
  for (const id of ['wand', 'orbit', 'aura', 'lightning']) {
    const g = G.createGame({ seed: 11 });
    g.spawnAcc = -1e9;
    g.upgrades = { [id]: 1 };
    const e = G.makeEnemy(g, 'golem', id === 'orbit' ? 70 : id === 'aura' ? 40 : 150, 0);
    e.speed = 0;
    e.hp = e.maxHp = 1e6;
    g.enemies.push(e);
    g.player.invuln = 1e9;
    run(g, 3);
    assert.ok(e.hp < 1e6, id + ' не нанёс урона');
  }
});

test('требуемый опыт растёт с уровнем', () => {
  for (let l = 1; l < 50; l++) assert.ok(G.xpForLevel(l + 1) > G.xpForLevel(l));
});

test('стоя на месте, герой рано или поздно погибает', () => {
  const g = G.createGame({ seed: 7 });
  g.upgrades = {}; // без оружия
  run(g, 300);
  assert.equal(g.state, 'over');
  assert.ok(g.events.some((e) => e.type === 'gameover'));
});
