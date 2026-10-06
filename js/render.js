// Отрисовка мира и интерфейса на canvas.
(function () {
  const SV = globalThis.SV || (globalThis.SV = {});
  const U = SV.utils;

  const TILE = 48;
  const SCALE = 3; // размер «пикселя» спрайта

  // Псевдослучайное число по координатам плитки — узор земли не меняется между кадрами.
  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function drawGround(ctx, camX, camY, w, h) {
    const x0 = Math.floor(camX / TILE) - 1;
    const y0 = Math.floor(camY / TILE) - 1;
    const x1 = Math.ceil((camX + w) / TILE) + 1;
    const y1 = Math.ceil((camY + h) / TILE) + 1;
    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        const sx = tx * TILE - camX;
        const sy = ty * TILE - camY;
        ctx.fillStyle = (tx + ty) & 1 ? '#232b3a' : '#202736';
        ctx.fillRect(sx, sy, TILE, TILE);
        const r = hash(tx, ty);
        if (r < 0.35) {
          // травинки и камешки
          ctx.fillStyle = r < 0.15 ? '#2f3b4f' : '#2a3a33';
          const px = Math.floor(hash(tx + 7, ty) * (TILE - 6));
          const py = Math.floor(hash(tx, ty + 7) * (TILE - 6));
          ctx.fillRect(sx + px, sy + py, 3, 3);
          ctx.fillRect(sx + px + 3, sy + py - 3, 3, 3);
        }
      }
    }
  }

  function drawSprite(ctx, name, x, y, flip, flash, scale) {
    const img = SV.sprites.get(name, scale || SCALE, flash);
    const dx = Math.round(x - img.width / 2);
    const dy = Math.round(y - img.height / 2);
    if (flip) {
      ctx.save();
      ctx.translate(dx + img.width, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(img, dx, dy);
    }
  }

  function drawShadow(ctx, x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGem(ctx, x, y, value, t) {
    const s = value >= 10 ? 7 : value >= 3 ? 6 : 5;
    const color = value >= 10 ? '#ff6ad5' : value >= 3 ? '#5ad1ff' : '#6affb0';
    const bob = Math.sin(t * 6 + x * 0.1) * 1.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - s + bob);
    ctx.lineTo(x + s * 0.7, y + bob);
    ctx.lineTo(x, y + s + bob);
    ctx.lineTo(x - s * 0.7, y + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(Math.round(x - 1), Math.round(y - s * 0.5 + bob), 2, 2);
  }

  function drawBar(ctx, x, y, w, h, frac, fg, bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fg;
    ctx.fillRect(x, y, Math.round(w * U.clamp(frac, 0, 1)), h);
  }

  function drawEnemy(ctx, e, t) {
    const wobble = Math.sin(t * 8 + e.id) * 1.5;
    drawShadow(ctx, e.x, e.y + e.r, e.r * 0.9);
    drawSprite(ctx, e.sprite, e.x, e.y + wobble, false, e.flash > 0, e.scale);
  }

  function drawPickup(ctx, gem, t) {
    if (gem.kind === 'xp') return drawGem(ctx, gem.x, gem.y, gem.value, t);
    const bob = Math.sin(t * 5) * 2;
    drawSprite(ctx, gem.kind, gem.x, gem.y + bob, false, false, 3);
  }

  function drawAura(ctx, p, r, t) {
    if (r <= 0) return;
    const pulse = 1 + Math.sin(t * 4) * 0.03;
    ctx.fillStyle = 'rgba(120, 200, 255, 0.12)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160, 225, 255, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -t * 20;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawBlade(ctx, b, t) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(t * 10);
    const s = b.r;
    ctx.fillStyle = '#e6f7ff';
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.35, 0);
    ctx.lineTo(0, s);
    ctx.lineTo(-s * 0.35, 0);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#7fd4ff';
    ctx.fill();
    ctx.restore();
  }

  function drawBolt(ctx, b) {
    ctx.globalAlpha = b.life / b.max;
    ctx.strokeStyle = '#fff6a0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    b.pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const end = b.pts[b.pts.length - 1];
    ctx.fillStyle = 'rgba(255, 240, 150, 0.5)';
    ctx.beginPath();
    ctx.arc(end.x, end.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawWorld(ctx, g, w, h) {
    const p = g.player;
    const camX = Math.round(p.x - w / 2);
    const camY = Math.round(p.y - h / 2);
    drawGround(ctx, camX, camY, w, h);

    ctx.save();
    ctx.translate(-camX, -camY);

    drawAura(ctx, p, g.weapons.aura.radius, g.time);
    for (const gem of g.gems) drawPickup(ctx, gem, g.time);
    for (const e of g.enemies) drawEnemy(ctx, e, g.time);

    // Игрок: мигает во время неуязвимости
    const blink = p.invuln > 0 && Math.floor(g.time * 20) % 2 === 0;
    drawShadow(ctx, p.x, p.y + 17, 11);
    if (!blink) {
      const step = p.moving ? Math.abs(Math.sin(g.time * 12)) * 2 : 0;
      drawSprite(ctx, 'hero', p.x, p.y - step, p.facing < 0, false);
    }
    drawBar(ctx, Math.round(p.x - 16), Math.round(p.y + 22), 32, 4, p.hp / p.maxHp, '#ff4d5e', '#3a1520');

    for (const b of g.bullets) {
      ctx.fillStyle = 'rgba(255,230,120,0.35)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff4b0';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const bl of g.weapons.orbit.blades) drawBlade(ctx, bl, g.time);

    for (const s of g.enemyShots) {
      ctx.fillStyle = 'rgba(200, 90, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8b0ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const b of g.bolts) drawBolt(ctx, b);

    for (const pt of g.particles) {
      ctx.globalAlpha = pt.life / pt.max;
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x) - 2, Math.round(pt.y) - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of g.texts) {
      ctx.globalAlpha = Math.min(1, (t.life / t.max) * 2);
      ctx.fillStyle = '#0f1220';
      ctx.fillText(t.text, t.x + 1, t.y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawHud(ctx, g, w) {
    // Полоса опыта по верху экрана
    drawBar(ctx, 0, 0, w, 10, g.xp / g.xpToNext, '#4ad7ff', '#10202c');
    ctx.font = 'bold 16px monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText('Ур. ' + g.level, 12, 18);
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(U.formatTime(g.time), w / 2, 18);
    ctx.textAlign = 'right';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('☠ ' + g.kills, w - 60, 18);

    // Значки полученных улучшений
    let x = 12;
    let y = 42;
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const d of SV.upgrades.DEFS) {
      const lvl = g.upgrades[d.id];
      if (!lvl) continue;
      if (x + 26 > Math.min(w, 340)) {
        x = 12;
        y += 30;
      }
      ctx.fillStyle = 'rgba(15,18,32,0.7)';
      ctx.fillRect(x, y, 26, 26);
      ctx.fillStyle = d.color;
      ctx.fillText(d.icon, x + 13, y + 11);
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(lvl >= d.max ? 'MAX' : String(lvl), x + 13, y + 22);
      ctx.font = 'bold 13px monospace';
      x += 30;
    }

    // Полоса здоровья босса
    const boss = g.enemies.find((e) => e.boss);
    if (boss) {
      const bw = Math.min(w - 40, 420);
      const bx = (w - bw) / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#ffd84a';
      ctx.fillText('Король слизней', w / 2, 46);
      drawBar(ctx, bx, 64, bw, 8, boss.hp / boss.maxHp, '#ffd84a', '#3a2a10');

      // Стрелка у края экрана, если босс ещё не виден
      const dx = boss.x - g.player.x;
      const dy = boss.y - g.player.y;
      const h = g.view.h;
      if (Math.abs(dx) > w / 2 || Math.abs(dy) > h / 2) {
        const k = Math.min((w / 2 - 30) / Math.abs(dx || 1), (h / 2 - 30) / Math.abs(dy || 1));
        const ax = w / 2 + dx * k;
        const ay = h / 2 + dy * k;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(Math.atan2(dy, dx));
        ctx.fillStyle = '#ffd84a';
        ctx.strokeStyle = '#0f1220';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-10, -11);
        ctx.lineTo(-10, 11);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        ctx.restore();
      }
    }

    if (g.banner) {
      ctx.globalAlpha = Math.min(1, g.banner.life);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 24px monospace';
      ctx.fillStyle = '#0f1220';
      ctx.fillText(g.banner.text, w / 2 + 2, 112);
      ctx.fillStyle = '#ff9a5a';
      ctx.fillText(g.banner.text, w / 2, 110);
      ctx.globalAlpha = 1;
    }
  }

  function drawJoystick(ctx, js) {
    if (!js || !js.active) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(js.ox, js.oy, js.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(js.ox + js.dx, js.oy + js.dy, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  function render(ctx, g, w, h, joystick) {
    ctx.imageSmoothingEnabled = false;
    drawWorld(ctx, g, w, h);
    drawHud(ctx, g, w);
    drawJoystick(ctx, joystick);
  }

  SV.render = { render };
})();
