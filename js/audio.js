// Простые звуки, синтезированные Web Audio — без звуковых файлов.
(function () {
  const SV = globalThis.SV || (globalThis.SV = {});

  const SOUNDS = {
    shoot: { f: 880, f2: 660, d: 0.05, type: 'square', v: 0.03, gap: 0.08 },
    kill: { f: 300, f2: 120, d: 0.08, type: 'square', v: 0.05, gap: 0.05 },
    gem: { f: 1200, f2: 1600, d: 0.05, type: 'triangle', v: 0.05, gap: 0.04 },
    hurt: { f: 200, f2: 60, d: 0.2, type: 'sawtooth', v: 0.1, gap: 0.1 },
    levelup: { f: 520, f2: 1040, d: 0.35, type: 'triangle', v: 0.12, gap: 0.2 },
    zap: { f: 1500, f2: 200, d: 0.15, type: 'sawtooth', v: 0.05, gap: 0.1 },
    boss: { f: 110, f2: 70, d: 0.8, type: 'sawtooth', v: 0.12, gap: 1 },
    heal: { f: 600, f2: 900, d: 0.25, type: 'sine', v: 0.1, gap: 0.2 },
    vacuum: { f: 300, f2: 1400, d: 0.5, type: 'sine', v: 0.1, gap: 0.5 },
    bosskill: { f: 200, f2: 900, d: 0.7, type: 'square', v: 0.08, gap: 1 },
    gameover: { f: 400, f2: 50, d: 1, type: 'triangle', v: 0.15, gap: 1 },
  };

  function createAudio() {
    let ctx = null;
    let muted = false;
    const lastAt = {};

    // Браузеры разрешают звук только после действия пользователя — включаем по первому нажатию.
    function unlock() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }

    function play(name) {
      const s = SOUNDS[name];
      if (!s || muted || !ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (lastAt[name] && now - lastAt[name] < s.gap) return; // не шумим слишком часто
      lastAt[name] = now;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = s.type;
      osc.frequency.setValueAtTime(s.f, now);
      osc.frequency.exponentialRampToValueAtTime(s.f2, now + s.d);
      gain.gain.setValueAtTime(s.v, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + s.d);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + s.d + 0.02);
    }

    return {
      unlock,
      play,
      setMuted(v) {
        muted = v;
      },
      get muted() {
        return muted;
      },
    };
  }

  SV.createAudio = createAudio;
})();
