// Игровая логика без привязки к браузеру: состояние мира и его обновление за шаг времени.
(function () {
  const SV = globalThis.SV || (globalThis.SV = {});
  const U = SV.utils;

  const MAX_PARTICLES = 400;

  // Сколько опыта нужно, чтобы перейти с уровня level на следующий.
  function xpForLevel(level) {
    return Math.floor(5 + (level - 1) * 5 + Math.pow(level - 1, 1.6));
  }

  function createPlayer() {
    return {
      x: 0,
      y: 0,
      r: 12,
      hp: 100,
      maxHp: 100,
      speed: 150,
      invuln: 0,
      facing: 1,
      moving: false,
      // Характеристики основного оружия
      damage: 10,
      fireRate: 1.6, // выстрелов в секунду
      fireCd: 0,
      bulletSpeed: 430,
      bulletRange: 420,
      magnet: 70,
    };
  }

  function createGame(opts) {
    opts = opts || {};
    const seed = opts.seed != null ? opts.seed : (Date.now() & 0xffffffff);
    return {
      rng: U.makeRng(seed),
      time: 0,
      state: 'playing', // playing | over
      view: { w: opts.viewW || 800, h: opts.viewH || 600 },
      player: createPlayer(),
      level: 1,
      xp: 0,
      xpToNext: xpForLevel(1),
      kills: 0,
      enemies: [],
      bullets: [],
      gems: [],
      particles: [],
      spawnAcc: 0,
      events: [],
      nextId: 1,
    };
  }

  // ---------- Враги ----------
  function spawnPoint(g) {
    const p = g.player;
    const a = g.rng() * Math.PI * 2;
    // Чуть дальше края экрана, чтобы враги появлялись незаметно.
    const d = Math.hypot(g.view.w, g.view.h) / 2 + 40;
    return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
  }

  function spawnEnemy(g) {
    const pt = spawnPoint(g);
    const hp = 14 + g.time * 0.12;
    g.enemies.push({
      id: g.nextId++,
      type: 'slime',
      x: pt.x,
      y: pt.y,
      r: 11,
      hp,
      maxHp: hp,
      speed: 55 + g.rng() * 15,
      damage: 10,
      xp: 1,
      flash: 0,
      kx: 0,
      ky: 0,
    });
  }

  function updateSpawning(g, dt) {
    const rate = Math.min(1 + g.time / 15, 12); // врагов в секунду
    g.spawnAcc += rate * dt;
    while (g.spawnAcc >= 1) {
      g.spawnAcc -= 1;
      if (g.enemies.length < 300) spawnEnemy(g);
    }
  }

  function updateEnemies(g, dt) {
    const p = g.player;
    const far2 = Math.pow(Math.hypot(g.view.w, g.view.h) * 0.9, 2);
    for (const e of g.enemies) {
      const d = U.normalize(p.x - e.x, p.y - e.y);
      e.x += (d.x * e.speed + e.kx) * dt;
      e.y += (d.y * e.speed + e.ky) * dt;
      // Отталкивание после попадания постепенно затухает
      e.kx *= Math.pow(0.02, dt);
      e.ky *= Math.pow(0.02, dt);
      if (e.flash > 0) e.flash -= dt;

      // Слишком далеко отставших врагов переносим на другую сторону экрана
      if (U.dist2(e.x, e.y, p.x, p.y) > far2) {
        e.x = p.x + (p.x - e.x) * 0.6;
        e.y = p.y + (p.y - e.y) * 0.6;
      }

      // Касание игрока
      const rr = e.r + p.r;
      if (p.invuln <= 0 && U.dist2(e.x, e.y, p.x, p.y) < rr * rr) {
        damagePlayer(g, e.damage);
      }
    }
    separateEnemies(g);
  }

  // Простое расталкивание, чтобы враги не сливались в одну точку.
  function separateEnemies(g) {
    const es = g.enemies;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.25;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  function damagePlayer(g, amount) {
    const p = g.player;
    p.hp -= amount;
    p.invuln = 0.6;
    g.events.push({ type: 'hurt' });
    burst(g, p.x, p.y, '#ff5a5a', 8);
  }

  function damageEnemy(g, e, amount, fromX, fromY) {
    e.hp -= amount;
    e.flash = 0.1;
    const d = U.normalize(e.x - fromX, e.y - fromY);
    e.kx += d.x * 120;
    e.ky += d.y * 120;
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      g.kills++;
      dropGem(g, e.x, e.y, e.xp);
      burst(g, e.x, e.y, '#7ee081', 6);
      g.events.push({ type: 'kill' });
    }
  }

  // ---------- Оружие ----------
  function nearestEnemy(g, range) {
    const p = g.player;
    let best = null;
    let bestD = range * range;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = U.dist2(e.x, e.y, p.x, p.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  function updateWeapons(g, dt) {
    const p = g.player;
    p.fireCd -= dt;
    if (p.fireCd > 0) return;
    const target = nearestEnemy(g, p.bulletRange);
    if (!target) return;
    p.fireCd = 1 / p.fireRate;
    const a = Math.atan2(target.y - p.y, target.x - p.x);
    g.bullets.push({
      x: p.x,
      y: p.y,
      vx: Math.cos(a) * p.bulletSpeed,
      vy: Math.sin(a) * p.bulletSpeed,
      r: 5,
      damage: p.damage,
      life: p.bulletRange / p.bulletSpeed + 0.2,
    });
    g.events.push({ type: 'shoot' });
  }

  function updateBullets(g, dt) {
    for (const b of g.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      for (const e of g.enemies) {
        if (e.dead) continue;
        const rr = e.r + b.r;
        if (U.dist2(e.x, e.y, b.x, b.y) < rr * rr) {
          damageEnemy(g, e, b.damage, b.x - b.vx, b.y - b.vy);
          b.life = 0;
          break;
        }
      }
    }
    g.bullets = g.bullets.filter((b) => b.life > 0);
    g.enemies = g.enemies.filter((e) => !e.dead);
  }

  // ---------- Опыт ----------
  function dropGem(g, x, y, value) {
    g.gems.push({ x, y, value, pulled: false });
  }

  function updateGems(g, dt) {
    const p = g.player;
    const m2 = p.magnet * p.magnet;
    const pick = p.r + 6;
    for (const gem of g.gems) {
      const d2 = U.dist2(gem.x, gem.y, p.x, p.y);
      if (d2 < m2) gem.pulled = true;
      if (gem.pulled) {
        const d = U.normalize(p.x - gem.x, p.y - gem.y);
        const sp = 380;
        gem.x += d.x * sp * dt;
        gem.y += d.y * sp * dt;
      }
      if (U.dist2(gem.x, gem.y, p.x, p.y) < pick * pick) {
        gem.taken = true;
        addXp(g, gem.value);
      }
    }
    g.gems = g.gems.filter((gm) => !gm.taken);
  }

  function addXp(g, amount) {
    g.xp += amount;
    g.events.push({ type: 'gem' });
    while (g.xp >= g.xpToNext) {
      g.xp -= g.xpToNext;
      g.level++;
      g.xpToNext = xpForLevel(g.level);
      // Простая версия: каждый уровень автоматически усиливает выстрел.
      g.player.damage *= 1.15;
      g.player.hp = Math.min(g.player.maxHp, g.player.hp + 10);
      g.events.push({ type: 'levelup' });
    }
  }

  // ---------- Эффекты ----------
  function burst(g, x, y, color, n) {
    for (let i = 0; i < n && g.particles.length < MAX_PARTICLES; i++) {
      const a = g.rng() * Math.PI * 2;
      const s = 40 + g.rng() * 120;
      g.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, max: 0.4, color });
    }
  }

  function updateParticles(g, dt) {
    for (const pt of g.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.9;
      pt.vy *= 0.9;
      pt.life -= dt;
    }
    g.particles = g.particles.filter((pt) => pt.life > 0);
  }

  // ---------- Игрок ----------
  function updatePlayer(g, dt, input) {
    const p = g.player;
    const mv = U.normalize(input.x, input.y);
    // Джойстик может давать неполное отклонение — учитываем его силу.
    const strength = Math.min(1, Math.hypot(input.x, input.y));
    p.x += mv.x * p.speed * strength * dt;
    p.y += mv.y * p.speed * strength * dt;
    p.moving = strength > 0.05;
    if (mv.x !== 0) p.facing = mv.x > 0 ? 1 : -1;
    if (p.invuln > 0) p.invuln -= dt;
  }

  // Один шаг симуляции. input = { x, y } — направление движения от -1 до 1.
  function update(g, dt, input) {
    if (g.state !== 'playing') return;
    dt = Math.min(dt, 0.05);
    g.time += dt;
    updatePlayer(g, dt, input || { x: 0, y: 0 });
    updateSpawning(g, dt);
    updateEnemies(g, dt);
    updateWeapons(g, dt);
    updateBullets(g, dt);
    updateGems(g, dt);
    updateParticles(g, dt);
    if (g.player.hp <= 0) {
      g.player.hp = 0;
      g.state = 'over';
      g.events.push({ type: 'gameover' });
    }
  }

  SV.game = { createGame, update, xpForLevel, addXp, damageEnemy, spawnEnemy };
})();
