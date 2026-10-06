// Общие вспомогательные функции: математика, случайные числа, рекорд.
// Файлы подключаются обычными <script>, поэтому всё складываем в глобальный объект SV.
// Так игра открывается даже двойным щелчком по index.html (без сервера),
// а тесты в Node просто подключают эти же файлы через require.
(function () {
  const SV = globalThis.SV || (globalThis.SV = {});

  // Детерминированный генератор случайных чисел (mulberry32) — удобно для тестов.
  function makeRng(seed) {
    let a = seed >>> 0;
    return function rng() {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function dist2(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  // Нормализует вектор; нулевой вектор остаётся нулевым.
  function normalize(x, y) {
    const l = Math.hypot(x, y);
    if (l === 0) return { x: 0, y: 0 };
    return { x: x / l, y: y / l };
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  // ---- Рекорд в localStorage ----
  const BEST_KEY = 'pixelSurvivor.best.v1';
  const EMPTY_BEST = { time: 0, kills: 0, level: 0 };

  function loadBest(storage) {
    try {
      const raw = storage && storage.getItem(BEST_KEY);
      if (!raw) return { ...EMPTY_BEST };
      const v = JSON.parse(raw);
      return {
        time: Number(v.time) || 0,
        kills: Number(v.kills) || 0,
        level: Number(v.level) || 0,
      };
    } catch (e) {
      return { ...EMPTY_BEST };
    }
  }

  // Главный показатель рекорда — время выживания. Убийства и уровень храним как отдельные максимумы.
  function saveBest(storage, result) {
    const prev = loadBest(storage);
    const isNew = result.time > prev.time;
    const best = {
      time: Math.max(prev.time, result.time),
      kills: Math.max(prev.kills, result.kills),
      level: Math.max(prev.level, result.level),
    };
    try {
      if (storage) storage.setItem(BEST_KEY, JSON.stringify(best));
    } catch (e) {
      // Хранилище может быть недоступно (приватный режим) — игра всё равно работает.
    }
    return { best, isNew };
  }

  SV.utils = { makeRng, clamp, dist2, normalize, formatTime, loadBest, saveBest, BEST_KEY };
})();
