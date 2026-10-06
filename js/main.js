// Точка входа в браузере: экраны меню, игровой цикл, пауза, выбор улучшений, рекорд.
(function () {
  const SV = globalThis.SV;
  const U = SV.utils;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const input = SV.createInput(canvas);
  const audio = SV.createAudio();

  const $ = (id) => document.getElementById(id);
  const screens = {
    start: $('screen-start'),
    pause: $('screen-pause'),
    levelup: $('screen-levelup'),
    over: $('screen-over'),
  };

  let storage = null;
  try {
    storage = window.localStorage;
  } catch (e) {
    storage = null;
  }

  const MUTE_KEY = 'pixelSurvivor.muted';
  try {
    audio.setMuted(storage && storage.getItem(MUTE_KEY) === '1');
  } catch (e) {
    // без хранилища звук просто включён
  }

  let game = null;
  let paused = false;
  let viewW = 0;
  let viewH = 0;
  let levelupShownAt = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (game) {
      game.view.w = viewW;
      game.view.h = viewH;
    }
  }
  window.addEventListener('resize', resize);
  resize();

  function current() {
    for (const k in screens) if (!screens[k].classList.contains('hidden')) return k;
    return null;
  }

  function show(name) {
    for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
    $('pauseBtn').classList.toggle('hidden', name !== null);
  }

  function renderBest() {
    const best = U.loadBest(storage);
    const text = best.time > 0
      ? 'Рекорд: ' + U.formatTime(best.time) + ' · убито ' + best.kills + ' · уровень ' + best.level
      : 'Рекорда пока нет — самое время поставить!';
    for (const el of document.querySelectorAll('.best')) el.textContent = text;
  }

  function renderMute() {
    $('muteBtn').textContent = audio.muted ? 'Звук: выкл' : 'Звук: вкл';
  }

  function startGame() {
    audio.unlock();
    game = SV.game.createGame({ viewW, viewH });
    paused = false;
    input.reset();
    show(null);
  }

  function upgradesList() {
    const items = SV.upgrades.DEFS.filter((d) => game.upgrades[d.id]).map((d) => {
      const lvl = game.upgrades[d.id];
      return '<li><span class="ico" style="color:' + d.color + '">' + d.icon + '</span> ' + d.name +
        ' — ' + (lvl >= d.max ? 'макс.' : 'ур. ' + lvl) + '</li>';
    });
    return items.join('');
  }

  function setPaused(v) {
    if (!game || game.state !== 'playing') return;
    paused = v;
    if (v) $('pause-list').innerHTML = upgradesList();
    show(v ? 'pause' : null);
  }

  function showLevelUp() {
    const box = $('choices');
    box.innerHTML = '';
    game.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'card';
      b.innerHTML =
        '<span class="key">' + (i + 1) + '</span>' +
        '<span class="ico" style="color:' + c.color + '">' + c.icon + '</span>' +
        '<span class="card-body"><span class="card-title">' + c.name + '</span>' +
        '<span class="card-level">' + (c.kind === 'item' ? '' : c.isNew ? 'Новое!' : 'Уровень ' + c.level) + '</span>' +
        '<span class="card-text">' + c.text + '</span></span>';
      b.addEventListener('click', () => choose(i));
      box.appendChild(b);
    });
    $('levelup-title').textContent = 'Уровень ' + (game.level - game.pendingLevels + 1) + '!';
    levelupShownAt = performance.now();
    input.reset();
    show('levelup');
  }

  function choose(i) {
    if (!game || game.state !== 'levelup') return;
    // Защита от случайного нажатия сразу после появления окна
    if (performance.now() - levelupShownAt < 250) return;
    SV.game.chooseUpgrade(game, i);
    handleEvents();
    if (game.state === 'playing') show(null);
  }

  function gameOver() {
    const result = { time: game.time, kills: game.kills, level: game.level };
    const { isNew } = U.saveBest(storage, result);
    $('over-stats').textContent =
      'Время: ' + U.formatTime(result.time) + ' · убито: ' + result.kills + ' · уровень: ' + result.level;
    $('over-new').classList.toggle('hidden', !isNew);
    renderBest();
    show('over');
  }

  function handleEvents() {
    const evs = game.events.splice(0);
    for (const ev of evs) {
      audio.play(ev.type);
      if (ev.type === 'gameover') gameOver();
      else if (ev.type === 'levelup') showLevelUp();
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = (now - last) / 1000;
    last = now;
    if (game) {
      if (!paused && game.state === 'playing') {
        SV.game.update(game, dt, input.get());
        handleEvents();
      }
      SV.render.render(ctx, game, viewW, viewH, game.state === 'playing' ? input.joystick : null);
    } else {
      ctx.fillStyle = '#1b2130';
      ctx.fillRect(0, 0, viewW, viewH);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---- Кнопки и клавиши ----
  $('startBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);
  $('menuBtn').addEventListener('click', () => {
    game = null;
    paused = false;
    renderBest();
    show('start');
  });
  $('resumeBtn').addEventListener('click', () => setPaused(false));
  $('pauseBtn').addEventListener('click', () => setPaused(true));
  $('muteBtn').addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    try {
      if (storage) storage.setItem(MUTE_KEY, audio.muted ? '1' : '0');
    } catch (e) {
      // ничего страшного
    }
    renderMute();
  });

  window.addEventListener('keydown', (e) => {
    audio.unlock();
    const scr = current();
    if (scr === 'levelup') {
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
      if (n != null) {
        e.preventDefault();
        choose(n);
      }
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      setPaused(!paused);
    } else if (e.code === 'Enter' || e.code === 'Space') {
      if (scr === 'start' || scr === 'over') {
        e.preventDefault();
        startGame();
      } else if (scr === 'pause') {
        e.preventDefault();
        setPaused(false);
      }
    }
  });
  window.addEventListener('pointerdown', () => audio.unlock());

  // Ставим паузу, если вкладку свернули
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPaused(true);
  });

  // Для проверки из консоли браузера и автотестов: SV.currentGame()
  SV.currentGame = () => game;

  renderBest();
  renderMute();
  show('start');
})();
