// Точка входа в браузере: экраны меню, игровой цикл, пауза, рекорд.
(function () {
  const SV = globalThis.SV;
  const U = SV.utils;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const input = SV.createInput(canvas);

  const $ = (id) => document.getElementById(id);
  const screens = {
    start: $('screen-start'),
    pause: $('screen-pause'),
    over: $('screen-over'),
  };

  let storage = null;
  try {
    storage = window.localStorage;
  } catch (e) {
    storage = null;
  }

  let game = null;
  let paused = false;
  let viewW = 0;
  let viewH = 0;

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

  function startGame() {
    game = SV.game.createGame({ viewW, viewH });
    paused = false;
    input.reset();
    show(null);
  }

  function setPaused(v) {
    if (!game || game.state !== 'playing') return;
    paused = v;
    show(v ? 'pause' : null);
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
    for (const ev of game.events) {
      if (ev.type === 'gameover') gameOver();
    }
    game.events.length = 0;
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
      SV.render.render(ctx, game, viewW, viewH, input.joystick);
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
  $('resumeBtn').addEventListener('click', () => setPaused(false));
  $('pauseBtn').addEventListener('click', () => setPaused(true));

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      setPaused(!paused);
    } else if (e.code === 'Enter' || e.code === 'Space') {
      if (!screens.start.classList.contains('hidden') || !screens.over.classList.contains('hidden')) {
        e.preventDefault();
        startGame();
      } else if (paused) {
        e.preventDefault();
        setPaused(false);
      }
    }
  });

  // Ставим паузу, если вкладку свернули
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPaused(true);
  });

  renderBest();
  show('start');
})();
