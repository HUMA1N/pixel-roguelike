// Виды врагов и правила их появления по ходу игры.
(function () {
  const SV = globalThis.SV || (globalThis.SV = {});

  // ai: chase — идёт прямо, wobble — летит зигзагом, ranged — держит дистанцию и стреляет,
  // boss — медленно идёт и призывает слизней.
  const TYPES = {
    slime: { name: 'Слизень', sprite: 'slime', r: 11, hp: 12, speed: 55, damage: 8, xp: 1, kb: 1, ai: 'chase' },
    bat: { name: 'Летучая мышь', sprite: 'bat', r: 9, hp: 7, speed: 100, damage: 6, xp: 1, kb: 1.3, ai: 'wobble' },
    golem: { name: 'Голем', sprite: 'golem', r: 15, hp: 55, speed: 34, damage: 16, xp: 4, kb: 0.25, ai: 'chase' },
    mage: { name: 'Колдун', sprite: 'mage', r: 11, hp: 20, speed: 62, damage: 8, xp: 2, kb: 0.8, ai: 'ranged' },
    king: {
      name: 'Король слизней',
      sprite: 'king',
      scale: 5,
      r: 26,
      hp: 700,
      speed: 46,
      damage: 22,
      xp: 25,
      kb: 0.05,
      ai: 'boss',
      boss: true,
    },
  };

  const BOSS_EVERY = 180; // секунд между боссами
  const RING_FIRST = 100; // первое «кольцо» врагов
  const RING_EVERY = 120;

  // Веса появления обычных врагов в зависимости от времени (секунды).
  function spawnWeights(t) {
    return [
      ['slime', 10],
      ['bat', t >= 30 ? 4 + t / 30 : 0],
      ['golem', t >= 90 ? 2 + t / 60 : 0],
      ['mage', t >= 120 ? 2 + t / 90 : 0],
    ];
  }

  function pickType(t, rng) {
    const w = spawnWeights(t);
    let total = 0;
    for (const [, v] of w) total += v;
    let r = rng() * total;
    for (const [id, v] of w) {
      r -= v;
      if (r < 0) return id;
    }
    return 'slime';
  }

  // Сколько обычных врагов появляется в секунду.
  function spawnRate(t) {
    return Math.min(0.6 + t / 40 + Math.pow(t / 130, 2), 14);
  }

  // Враги со временем становятся крепче.
  function hpMultiplier(t) {
    return 1 + t / 110 + Math.pow(t / 300, 2);
  }

  // ...и быстрее, чтобы от них нельзя было бесконечно убегать.
  function speedMultiplier(t) {
    return 1 + Math.min(t / 500, 0.7);
  }

  SV.enemies = { TYPES, BOSS_EVERY, RING_FIRST, RING_EVERY, spawnWeights, pickType, spawnRate, hpMultiplier, speedMultiplier };
})();
