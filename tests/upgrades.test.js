const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load');

const SV = load();
const UP = SV.upgrades;
const G = SV.game;

test('варианты выбора не повторяются', () => {
  const rng = SV.utils.makeRng(1);
  for (let i = 0; i < 200; i++) {
    const g = G.createGame({ seed: i });
    const ch = UP.pickChoices(g, rng, 3);
    assert.equal(ch.length, 3);
    assert.equal(new Set(ch.map((c) => c.id)).size, 3);
    for (const c of ch) assert.ok(c.text.length > 0, 'у варианта есть описание');
  }
});

test('прокачанное до максимума больше не предлагается, а в конце предлагается лечение', () => {
  const g = G.createGame({ seed: 1 });
  for (const d of UP.DEFS) g.upgrades[d.id] = d.max;
  UP.recalcStats(g);
  const ch = UP.pickChoices(g, g.rng, 3);
  assert.equal(ch.length, 1);
  assert.equal(ch[0].id, 'snack');
  g.player.hp = 10;
  UP.applyUpgrade(g, 'snack');
  assert.equal(g.player.hp, 40);

  g.upgrades.power = 4;
  const ch2 = UP.pickChoices(g, g.rng, 3);
  assert.deepEqual(ch2.map((c) => c.id), ['power']);
});

test('пассивные улучшения меняют характеристики героя', () => {
  const g = G.createGame({ seed: 1 });
  const p = g.player;
  const speed = p.speed;
  UP.applyUpgrade(g, 'boots');
  assert.ok(p.speed > speed);
  UP.applyUpgrade(g, 'power');
  assert.ok(p.mult.damage > 1);
  UP.applyUpgrade(g, 'haste');
  assert.ok(p.mult.cooldown < 1);
  const maxHp = p.maxHp;
  UP.applyUpgrade(g, 'vitality');
  assert.equal(p.maxHp, maxHp + 20);
  UP.applyUpgrade(g, 'armor');
  assert.equal(p.armor, 1);
});

test('нельзя прокачать выше максимума', () => {
  const g = G.createGame({ seed: 1 });
  for (let i = 0; i < 20; i++) UP.applyUpgrade(g, 'pierce');
  assert.equal(g.upgrades.pierce, UP.BY_ID.pierce.max);
});

test('оружие с каждым уровнем становится сильнее', () => {
  for (const id of Object.keys(UP.WEAPON_STATS)) {
    const max = UP.BY_ID[id].max;
    for (let n = 2; n <= max; n++) {
      const a = UP.WEAPON_STATS[id](n - 1);
      const b = UP.WEAPON_STATS[id](n);
      const better = b.damage > a.damage || (b.count || 0) > (a.count || 0) ||
        (b.cooldown || 0) < (a.cooldown || 0) || (b.radius || 0) > (a.radius || 0);
      assert.ok(better, id + ' ур. ' + n);
      assert.ok(!b.cooldown || b.cooldown > 0);
      assert.ok(UP.weaponDiff(id, n).length > 0);
    }
  }
});

test('у всех спрайтов строки одинаковой длины и известные цвета', () => {
  const { SPRITES, PALETTE } = SV.sprites;
  for (const name in SPRITES) {
    const rows = SPRITES[name];
    for (const r of rows) {
      assert.equal(r.length, rows[0].length, name);
      for (const ch of r) assert.ok(ch === '.' || ch in PALETTE, name + ': ' + ch);
    }
  }
  for (const t of Object.values(SV.enemies.TYPES)) assert.ok(SPRITES[t.sprite], t.sprite);
});
