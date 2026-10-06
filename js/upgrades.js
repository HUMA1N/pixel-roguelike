// Оружие и пассивные улучшения. На каждом уровне игрок выбирает 1 из 3.
(function () {
  const SV = globalThis.SV || (globalThis.SV = {});

  // Характеристики оружия на уровне n (n начинается с 1).
  const WEAPON_STATS = {
    wand: (n) => ({
      damage: 10 + 4 * (n - 1),
      count: 1 + Math.floor((n - 1) / 2),
      cooldown: 0.55 * (1 - 0.06 * (n - 1)),
    }),
    orbit: (n) => ({
      count: 1 + n,
      damage: 8 + 4 * (n - 1),
      radius: 70 + 6 * (n - 1),
      speed: 3 + 0.4 * (n - 1),
    }),
    aura: (n) => ({
      radius: 60 + 12 * (n - 1),
      damage: 4 + 3 * (n - 1),
    }),
    lightning: (n) => ({
      count: n,
      damage: 22 + 9 * (n - 1),
      cooldown: 2.4 - 0.25 * (n - 1),
    }),
  };

  const STAT_LABELS = {
    damage: 'урон',
    count: 'количество',
    cooldown: 'перезарядка',
    radius: 'радиус',
    speed: 'скорость вращения',
  };

  function fmt(v) {
    return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  // Описание «что изменится» для следующего уровня оружия, собранное по разнице характеристик.
  function weaponDiff(id, nextLevel) {
    const a = WEAPON_STATS[id](nextLevel - 1);
    const b = WEAPON_STATS[id](nextLevel);
    const parts = [];
    for (const k in STAT_LABELS) {
      if (k in a && a[k] !== b[k]) parts.push(STAT_LABELS[k] + ': ' + fmt(a[k]) + ' → ' + fmt(b[k]));
    }
    return parts.join(', ');
  }

  const DEFS = [
    // ---- Оружие ----
    { id: 'wand', kind: 'weapon', name: 'Магический жезл', icon: '✦', color: '#fff4b0', max: 7,
      intro: 'Стреляет в ближайшего врага.' },
    { id: 'orbit', kind: 'weapon', name: 'Кружащие клинки', icon: '✚', color: '#9fe8ff', max: 6,
      intro: 'Клинки вращаются вокруг героя и режут врагов.' },
    { id: 'aura', kind: 'weapon', name: 'Морозная аура', icon: '◎', color: '#8fd8ff', max: 6,
      intro: 'Поле вокруг героя ранит и замедляет врагов.' },
    { id: 'lightning', kind: 'weapon', name: 'Молния', icon: 'ϟ', color: '#ffe066', max: 6,
      intro: 'Бьёт случайных врагов на экране.' },
    // ---- Пассивные ----
    { id: 'power', kind: 'passive', name: 'Сила', icon: '▲', color: '#ff7a5a', max: 5, text: 'Весь урон +15%' },
    { id: 'haste', kind: 'passive', name: 'Скорострельность', icon: '»', color: '#ffd84a', max: 5,
      text: 'Перезарядка оружия −8%' },
    { id: 'boots', kind: 'passive', name: 'Быстрые сапоги', icon: '➜', color: '#7ee081', max: 5,
      text: 'Скорость движения +10%' },
    { id: 'vitality', kind: 'passive', name: 'Живучесть', icon: '♥', color: '#ff4d5e', max: 5,
      text: 'Макс. здоровье +20 и лечение на 20' },
    { id: 'regen', kind: 'passive', name: 'Регенерация', icon: '✿', color: '#ff9ad5', max: 5,
      text: 'Восстанавливает 0,5 здоровья в секунду' },
    { id: 'magnet', kind: 'passive', name: 'Магнит', icon: '∪', color: '#c08bff', max: 5,
      text: 'Кристаллы притягиваются с расстояния +35%' },
    { id: 'armor', kind: 'passive', name: 'Броня', icon: '■', color: '#bfc6d6', max: 5,
      text: 'Получаемый урон −1' },
    { id: 'pierce', kind: 'passive', name: 'Пробивание', icon: '➶', color: '#ffb366', max: 3,
      text: 'Снаряды жезла пробивают ещё одного врага' },
    { id: 'area', kind: 'passive', name: 'Размах', icon: '✺', color: '#66e0c2', max: 5,
      text: 'Радиус ауры, клинков и снарядов +10%' },
  ];

  // Запасной вариант, когда всё улучшено до максимума.
  const SNACK = { id: 'snack', kind: 'item', name: 'Жареная курица', icon: '●', color: '#e8a050', max: Infinity,
    text: 'Восстанавливает 30 здоровья' };

  const BY_ID = {};
  for (const d of DEFS) BY_ID[d.id] = d;
  BY_ID.snack = SNACK;

  function levelOf(g, id) {
    return g.upgrades[id] || 0;
  }

  function describe(g, def) {
    const next = levelOf(g, def.id) + 1;
    if (def.kind === 'weapon') return next === 1 ? def.intro : weaponDiff(def.id, next);
    return def.text;
  }

  // Выбирает до n разных вариантов из ещё не прокачанных до конца.
  function pickChoices(g, rng, n) {
    n = n || 3;
    const pool = DEFS.filter((d) => levelOf(g, d.id) < d.max);
    // Перемешивание Фишера — Йетса
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = pool[i];
      pool[i] = pool[j];
      pool[j] = t;
    }
    const picked = pool.slice(0, n);
    if (picked.length === 0) picked.push(SNACK);
    return picked.map((d) => ({
      id: d.id,
      kind: d.kind,
      name: d.name,
      icon: d.icon,
      color: d.color,
      level: levelOf(g, d.id) + 1,
      isNew: levelOf(g, d.id) === 0 && d.kind !== 'item',
      text: describe(g, d),
    }));
  }

  // Пересчитывает характеристики героя по уровням пассивных улучшений.
  function recalcStats(g) {
    const p = g.player;
    const L = (id) => levelOf(g, id);
    p.mult.damage = 1 + 0.15 * L('power');
    p.mult.cooldown = Math.pow(0.92, L('haste'));
    p.mult.area = 1 + 0.1 * L('area');
    p.speed = p.baseSpeed * (1 + 0.1 * L('boots'));
    p.magnet = p.baseMagnet * (1 + 0.35 * L('magnet'));
    p.regen = 0.5 * L('regen');
    p.armor = L('armor');
    p.pierce = L('pierce');
    p.maxHp = 100 + 20 * L('vitality');
  }

  function applyUpgrade(g, id) {
    const def = BY_ID[id];
    if (!def) throw new Error('Неизвестное улучшение: ' + id);
    const p = g.player;
    if (def.kind === 'item') {
      p.hp = Math.min(p.maxHp, p.hp + 30);
      return;
    }
    if (levelOf(g, id) >= def.max) return;
    g.upgrades[id] = levelOf(g, id) + 1;
    recalcStats(g);
    if (id === 'vitality') p.hp = Math.min(p.maxHp, p.hp + 20);
  }

  SV.upgrades = { DEFS, SNACK, BY_ID, WEAPON_STATS, pickChoices, applyUpgrade, recalcStats, levelOf, weaponDiff };
})();
