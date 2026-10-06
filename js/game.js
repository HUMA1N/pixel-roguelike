// Игровая логика без привязки к браузеру: состояние мира и его обновление за шаг времени.
(function () {
  const SV = globalThis.SV || (globalThis.SV = {});
  const U = SV.utils;
  const E = SV.enemies;
  const UP = SV.upgrades;

  const MAX_ENEMIES = 350;
  const MAX_GEMS = 400;
  const MAX_PARTICLES = 400;
  const MAX_TEXTS = 60;
  const WAND_RANGE = 450;

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
      baseSpeed: 150,
      speed: 150,
      baseMagnet: 70,
      magnet: 70,
      regen: 0,
      armor: 0,
      pierce: 0,
      mult: { damage: 1, cooldown: 1, area: 1 },
      invuln: 0,
      facing: 1,
      moving: false,
    };
  }

  function createGame(opts) {
    opts = opts || {};
    const seed = opts.seed != null ? opts.seed : (Date.now() & 0xffffffff);
    const g = {
      rng: U.makeRng(seed),
      time: 0,
      state: 'playing', // playing | levelup | over
      view: { w: opts.viewW || 800, h: opts.viewH || 600 },
      player: createPlayer(),
      level: 1,
      xp: 0,
      xpToNext: xpForLevel(1),
      pendingLevels: 0,
      choices: [],
      kills: 0,
      upgrades: { wand: 1 },
      weapons: {
        wand: { cd: 0.3 },
        orbit: { angle: 0, blades: [] },
        aura: { tick: 0, radius: 0 },
        lightning: { cd: 1 },
      },
      enemies: [],
      bullets: [],
      enemyShots: [],
      gems: [],
      particles: [],
      texts: [],
      bolts: [],
      banner: null,
      spawnAcc: 0,
      nextBossAt: E.BOSS_EVERY,
      nextRingAt: E.RING_FIRST,
      bossCount: 0,
      events: [],
      nextId: 1,
    };
    UP.recalcStats(g);
    return g;
  }

  // ---------- Враги ----------
  function spawnDistance(g) {
    return Math.hypot(g.view.w, g.view.h) / 2 + 40;
  }

  function makeEnemy(g, type, x, y) {
    const t = E.TYPES[type];
    let hp = t.hp * E.hpMultiplier(g.time);
    if (t.boss) hp = t.hp * (1 + g.bossCount * 0.8);
    return {
      id: g.nextId++,
      type,
      sprite: t.sprite,
      scale: t.scale || 3,
      ai: t.ai,
      boss: !!t.boss,
      x,
      y,
      r: t.r,
      hp,
      maxHp: hp,
      speed: t.speed * (t.boss ? 1 : E.speedMultiplier(g.time)) * (0.9 + g.rng() * 0.2),
      damage: t.damage,
      xp: t.xp,
      kb: t.kb,
      flash: 0,
      kx: 0,
      ky: 0,
      shootCd: 1.5 + g.rng() * 1.5,
      summonCd: 4,
      phase: g.rng() * Math.PI * 2,
      orbitHitAt: -1,
    };
  }

  function spawnEnemy(g, type) {
    if (g.enemies.length >= MAX_ENEMIES) return null;
    const p = g.player;
    const a = g.rng() * Math.PI * 2;
    const d = spawnDistance(g);
    const e = makeEnemy(g, type || E.pickType(g.time, g.rng), p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
    g.enemies.push(e);
    return e;
  }

  // Кольцо врагов, окружающее героя со всех сторон.
  function spawnRing(g) {
    const p = g.player;
    const n = Math.min(18 + Math.floor(g.time / 60) * 2, 40);
    const d = spawnDistance(g);
    const type = g.time > 200 ? 'bat' : 'slime';
    for (let i = 0; i < n && g.enemies.length < MAX_ENEMIES; i++) {
      const a = (i / n) * Math.PI * 2;
      g.enemies.push(makeEnemy(g, type, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d));
    }
    setBanner(g, 'Вас окружают!');
  }

  function setBanner(g, text) {
    g.banner = { text, life: 2.5 };
  }

  function updateSpawning(g, dt) {
    g.spawnAcc += E.spawnRate(g.time) * dt;
    while (g.spawnAcc >= 1) {
      g.spawnAcc -= 1;
      spawnEnemy(g);
    }
    if (g.time >= g.nextRingAt) {
      g.nextRingAt += E.RING_EVERY;
      spawnRing(g);
    }
    if (g.time >= g.nextBossAt) {
      g.nextBossAt += E.BOSS_EVERY;
      // Боссу место освобождаем всегда
      if (g.enemies.length >= MAX_ENEMIES) g.enemies.shift();
      spawnEnemy(g, 'king');
      g.bossCount++;
      setBanner(g, 'Появился Король слизней!');
      g.events.push({ type: 'boss' });
    }
  }

  function updateEnemies(g, dt) {
    const p = g.player;
    const far2 = Math.pow(Math.hypot(g.view.w, g.view.h) * 0.9, 2);
    const aura = g.weapons.aura.radius;
    const aura2 = aura * aura;
    const kbDecay = Math.pow(0.02, dt);

    for (const e of g.enemies) {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      let speed = e.speed;
      if (aura > 0 && dist * dist < aura2) speed *= 0.65; // морозная аура замедляет
      let mx = nx;
      let my = ny;

      if (e.ai === 'wobble') {
        const w = Math.sin(g.time * 4 + e.phase) * 0.8;
        mx = nx - ny * w;
        my = ny + nx * w;
      } else if (e.ai === 'ranged') {
        if (dist < 180) {
          mx = -nx;
          my = -ny;
        } else if (dist < 250) {
          // кружит вокруг героя на безопасной дистанции
          mx = -ny;
          my = nx;
          speed *= 0.5;
        }
        e.shootCd -= dt;
        if (e.shootCd <= 0 && dist < 420) {
          e.shootCd = 2.8;
          g.enemyShots.push({ x: e.x, y: e.y, vx: nx * 160, vy: ny * 160, r: 5, damage: e.damage, life: 4 });
        }
      } else if (e.ai === 'boss') {
        e.summonCd -= dt;
        if (e.summonCd <= 0) {
          e.summonCd = 5;
          for (let i = 0; i < 4 && g.enemies.length < MAX_ENEMIES; i++) {
            const a = (i / 4) * Math.PI * 2 + g.rng();
            g.enemies.push(makeEnemy(g, 'slime', e.x + Math.cos(a) * 40, e.y + Math.sin(a) * 40));
          }
        }
      }

      const ml = Math.hypot(mx, my) || 1;
      e.x += ((mx / ml) * speed + e.kx) * dt;
      e.y += ((my / ml) * speed + e.ky) * dt;
      e.kx *= kbDecay;
      e.ky *= kbDecay;
      if (e.flash > 0) e.flash -= dt;

      // Слишком далеко отставших врагов переносим на другую сторону экрана
      if (!e.boss && dist * dist > far2) {
        e.x = p.x + dx * 0.6;
        e.y = p.y + dy * 0.6;
      }

      const rr = e.r + p.r;
      if (p.invuln <= 0 && U.dist2(e.x, e.y, p.x, p.y) < rr * rr) damagePlayer(g, e.damage);
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
        if (dx > min || dx < -min || dy > min || dy < -min) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.25;
          const nx = (dx / d) * push;
          const ny = (dy / d) * push;
          // Босс почти не сдвигается мелкими врагами
          const wa = a.boss ? 0.1 : 1;
          const wb = b.boss ? 0.1 : 1;
          a.x -= nx * wa;
          a.y -= ny * wa;
          b.x += nx * wb;
          b.y += ny * wb;
        }
      }
    }
  }

  function updateEnemyShots(g, dt) {
    const p = g.player;
    for (const s of g.enemyShots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      const rr = s.r + p.r - 2;
      if (s.life > 0 && U.dist2(s.x, s.y, p.x, p.y) < rr * rr) {
        s.life = 0;
        if (p.invuln <= 0) damagePlayer(g, s.damage);
      }
    }
    g.enemyShots = g.enemyShots.filter((s) => s.life > 0);
  }

  function damagePlayer(g, amount) {
    const p = g.player;
    p.hp -= Math.max(1, amount - p.armor);
    p.invuln = 0.7;
    g.events.push({ type: 'hurt' });
    burst(g, p.x, p.y, '#ff5a5a', 8);
  }

  function damageEnemy(g, e, amount, fromX, fromY, knock) {
    if (e.dead) return;
    e.hp -= amount;
    e.flash = 0.1;
    const d = U.normalize(e.x - fromX, e.y - fromY);
    const k = (knock == null ? 120 : knock) * e.kb;
    e.kx += d.x * k;
    e.ky += d.y * k;
    addText(g, e.x, e.y - e.r, Math.round(amount));
    if (e.hp <= 0) killEnemy(g, e);
  }

  function killEnemy(g, e) {
    e.dead = true;
    g.kills++;
    burst(g, e.x, e.y, e.boss ? '#ffd84a' : '#7ee081', e.boss ? 30 : 6);
    if (e.boss) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        dropGem(g, e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24, 10);
      }
      dropPickup(g, e.x - 12, e.y, 'heart');
      dropPickup(g, e.x + 12, e.y, 'magnet');
      g.events.push({ type: 'bosskill' });
      setBanner(g, 'Король слизней повержен!');
    } else {
      dropGem(g, e.x, e.y, e.xp);
      const r = g.rng();
      if (r < 0.007) dropPickup(g, e.x + 8, e.y, 'heart');
      else if (r < 0.01) dropPickup(g, e.x + 8, e.y, 'magnet');
    }
    g.events.push({ type: 'kill' });
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

  function updateWand(g, dt) {
    const lvl = UP.levelOf(g, 'wand');
    if (!lvl) return;
    const p = g.player;
    const w = g.weapons.wand;
    const st = UP.WEAPON_STATS.wand(lvl);
    w.cd -= dt;
    if (w.cd > 0) return;
    const target = nearestEnemy(g, WAND_RANGE);
    if (!target) return;
    w.cd = st.cooldown * p.mult.cooldown;
    const base = Math.atan2(target.y - p.y, target.x - p.x);
    const speed = 430;
    for (let i = 0; i < st.count; i++) {
      const a = base + (i - (st.count - 1) / 2) * 0.16;
      g.bullets.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: 5 * p.mult.area,
        damage: st.damage * p.mult.damage,
        pierce: p.pierce,
        hit: [],
        life: WAND_RANGE / speed + 0.3,
      });
    }
    g.events.push({ type: 'shoot' });
  }

  function updateBullets(g, dt) {
    for (const b of g.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      for (const e of g.enemies) {
        if (e.dead || b.hit.includes(e.id)) continue;
        const rr = e.r + b.r;
        if (U.dist2(e.x, e.y, b.x, b.y) < rr * rr) {
          damageEnemy(g, e, b.damage, b.x - b.vx, b.y - b.vy);
          b.hit.push(e.id);
          if (b.pierce-- <= 0) {
            b.life = 0;
            break;
          }
        }
      }
    }
    g.bullets = g.bullets.filter((b) => b.life > 0);
  }

  function updateOrbit(g, dt) {
    const w = g.weapons.orbit;
    const lvl = UP.levelOf(g, 'orbit');
    w.blades.length = 0;
    if (!lvl) return;
    const p = g.player;
    const st = UP.WEAPON_STATS.orbit(lvl);
    const radius = st.radius * p.mult.area;
    const br = 9 * p.mult.area;
    w.angle += st.speed * dt;
    for (let i = 0; i < st.count; i++) {
      const a = w.angle + (i / st.count) * Math.PI * 2;
      w.blades.push({ x: p.x + Math.cos(a) * radius, y: p.y + Math.sin(a) * radius, a, r: br });
    }
    for (const e of g.enemies) {
      if (e.dead || g.time - e.orbitHitAt < 0.5) continue;
      for (const b of w.blades) {
        const rr = e.r + b.r;
        if (U.dist2(e.x, e.y, b.x, b.y) < rr * rr) {
          e.orbitHitAt = g.time;
          damageEnemy(g, e, st.damage * p.mult.damage, p.x, p.y, 160);
          break;
        }
      }
    }
  }

  function updateAura(g, dt) {
    const w = g.weapons.aura;
    const lvl = UP.levelOf(g, 'aura');
    if (!lvl) {
      w.radius = 0;
      return;
    }
    const p = g.player;
    const st = UP.WEAPON_STATS.aura(lvl);
    w.radius = st.radius * p.mult.area;
    w.tick -= dt;
    if (w.tick > 0) return;
    w.tick = 0.5;
    const r = w.radius;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const rr = r + e.r;
      if (U.dist2(e.x, e.y, p.x, p.y) < rr * rr) damageEnemy(g, e, st.damage * p.mult.damage, p.x, p.y, 30);
    }
  }

  function updateLightning(g, dt) {
    const lvl = UP.levelOf(g, 'lightning');
    if (!lvl) return;
    const p = g.player;
    const w = g.weapons.lightning;
    const st = UP.WEAPON_STATS.lightning(lvl);
    w.cd -= dt;
    if (w.cd > 0) return;
    const half = Math.hypot(g.view.w, g.view.h) / 2;
    const visible = g.enemies.filter((e) => !e.dead && U.dist2(e.x, e.y, p.x, p.y) < half * half);
    if (!visible.length) return;
    w.cd = st.cooldown * p.mult.cooldown;
    for (let i = 0; i < st.count && visible.length; i++) {
      const idx = Math.floor(g.rng() * visible.length);
      const e = visible.splice(idx, 1)[0];
      g.bolts.push(makeBolt(g, e.x, e.y));
      damageEnemy(g, e, st.damage * p.mult.damage, e.x, e.y - 1, 0);
    }
    g.events.push({ type: 'zap' });
  }

  // Ломаная линия молнии с неба до цели.
  function makeBolt(g, x, y) {
    const pts = [];
    const top = y - 260;
    const steps = 7;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const off = i === 0 || i === steps ? 0 : (g.rng() - 0.5) * 30;
      pts.push({ x: x + off, y: top + (y - top) * t });
    }
    return { pts, life: 0.25, max: 0.25 };
  }

  function updateWeapons(g, dt) {
    updateWand(g, dt);
    updateOrbit(g, dt);
    updateAura(g, dt);
    updateLightning(g, dt);
  }

  // ---------- Опыт и подбираемые предметы ----------
  function dropGem(g, x, y, value) {
    if (g.gems.length >= MAX_GEMS) {
      // Чтобы не тормозить, при избытке кристаллов добавляем опыт в уже лежащий
      const other = g.gems[Math.floor(g.rng() * g.gems.length)];
      if (other.kind === 'xp') {
        other.value += value;
        return;
      }
    }
    g.gems.push({ kind: 'xp', x, y, value, pulled: false });
  }

  function dropPickup(g, x, y, kind) {
    g.gems.push({ kind, x, y, value: 0, pulled: false });
  }

  function updateGems(g, dt) {
    const p = g.player;
    const m2 = p.magnet * p.magnet;
    const pick = p.r + 8;
    let vacuum = false;
    for (const gem of g.gems) {
      if (gem.taken) continue;
      const d2 = U.dist2(gem.x, gem.y, p.x, p.y);
      if (d2 < m2) gem.pulled = true;
      if (gem.pulled) {
        gem.speed = Math.min((gem.speed || 150) + 900 * dt, 900);
        const d = U.normalize(p.x - gem.x, p.y - gem.y);
        gem.x += d.x * gem.speed * dt;
        gem.y += d.y * gem.speed * dt;
      }
      if (U.dist2(gem.x, gem.y, p.x, p.y) < pick * pick) {
        gem.taken = true;
        if (gem.kind === 'xp') addXp(g, gem.value);
        else if (gem.kind === 'heart') {
          p.hp = Math.min(p.maxHp, p.hp + 30);
          addText(g, p.x, p.y - 20, '+30', '#7ee081');
          g.events.push({ type: 'heal' });
        } else if (gem.kind === 'magnet') vacuum = true;
      }
    }
    if (vacuum) {
      for (const gem of g.gems) if (gem.kind === 'xp') gem.pulled = true;
      g.events.push({ type: 'vacuum' });
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
      g.pendingLevels++;
    }
  }

  // Открывает выбор улучшения, если есть неиспользованные уровни.
  function openLevelUp(g) {
    if (g.pendingLevels <= 0 || g.state !== 'playing') return;
    g.state = 'levelup';
    g.choices = UP.pickChoices(g, g.rng, 3);
    g.events.push({ type: 'levelup' });
  }

  // Игрок выбрал вариант index из g.choices.
  function chooseUpgrade(g, index) {
    if (g.state !== 'levelup') return false;
    const c = g.choices[index];
    if (!c) return false;
    UP.applyUpgrade(g, c.id);
    g.pendingLevels--;
    g.choices = [];
    g.state = 'playing';
    g.player.invuln = Math.max(g.player.invuln, 0.5); // короткая передышка после выбора
    openLevelUp(g);
    return true;
  }

  // ---------- Эффекты ----------
  function burst(g, x, y, color, n) {
    for (let i = 0; i < n && g.particles.length < MAX_PARTICLES; i++) {
      const a = g.rng() * Math.PI * 2;
      const s = 40 + g.rng() * 120;
      g.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, max: 0.4, color });
    }
  }

  function addText(g, x, y, text, color) {
    if (g.texts.length >= MAX_TEXTS) g.texts.shift();
    g.texts.push({ x: x + (g.rng() - 0.5) * 10, y, text: String(text), color: color || '#ffffff', life: 0.6, max: 0.6 });
  }

  function updateEffects(g, dt) {
    const drag = Math.pow(0.002, dt);
    for (const pt of g.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= drag;
      pt.vy *= drag;
      pt.life -= dt;
    }
    g.particles = g.particles.filter((pt) => pt.life > 0);
    for (const t of g.texts) {
      t.y -= 30 * dt;
      t.life -= dt;
    }
    g.texts = g.texts.filter((t) => t.life > 0);
    for (const b of g.bolts) b.life -= dt;
    g.bolts = g.bolts.filter((b) => b.life > 0);
    if (g.banner) {
      g.banner.life -= dt;
      if (g.banner.life <= 0) g.banner = null;
    }
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
    if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
  }

  // Один шаг симуляции. input = { x, y } — направление движения от -1 до 1.
  function update(g, dt, input) {
    if (g.state !== 'playing') return;
    dt = Math.min(dt, 0.05);
    g.time += dt;
    updatePlayer(g, dt, input || { x: 0, y: 0 });
    updateSpawning(g, dt);
    updateEnemies(g, dt);
    updateEnemyShots(g, dt);
    updateWeapons(g, dt);
    updateBullets(g, dt);
    g.enemies = g.enemies.filter((e) => !e.dead);
    updateGems(g, dt);
    updateEffects(g, dt);
    if (g.player.hp <= 0) {
      g.player.hp = 0;
      g.state = 'over';
      g.events.push({ type: 'gameover' });
      return;
    }
    openLevelUp(g);
  }

  SV.game = { createGame, update, xpForLevel, addXp, chooseUpgrade, damageEnemy, spawnEnemy, makeEnemy };
})();
