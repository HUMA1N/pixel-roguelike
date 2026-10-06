// Пиксельные спрайты, нарисованные «кодом»: каждая строка — ряд пикселей,
// каждая буква — цвет из палитры, точка — прозрачный пиксель.
(function () {
  const SV = globalThis.SV || (globalThis.SV = {});

  const PALETTE = {
    k: '#1a1424', // контур
    H: '#3d6fd8', // капюшон
    h: '#7aa5ff', // блик капюшона
    S: '#f2c9a0', // кожа
    e: '#1a1424', // глаза
    B: '#2f4fa8', // плащ
    Y: '#ffd84a', // пряжка
    L: '#3b2f4a', // ноги
    G: '#5bd16a', // слизень
    g: '#b8f5a0',
    m: '#2a6e35',
    R: '#e04a4a',
    r: '#ff9a8a',
    d: '#8a2030',
    P: '#9b59d0',
    p: '#d6a6ff',
    v: '#5a2d82',
    O: '#e88a3a',
    o: '#ffc27a',
    n: '#8a4a1a',
    W: '#f4f4f4',
    w: '#bfc6d6',
    x: '#6b7388',
    Z: '#ffd84a',
  };

  const SPRITES = {
    hero: [
      '...kkkk...',
      '..kHhHHk..',
      '.kHhHHHHk.',
      '.kHSSSSHk.',
      '.kSeSSeSk.',
      '.kSSSSSSk.',
      '..kBBBBk..',
      '.kBBYYBBk.',
      'kSkBBBBkSk',
      '..kBBBBk..',
      '..kL..Lk..',
      '..kk..kk..',
    ],
    slime: [
      '...kkkk...',
      '..kGGGGk..',
      '.kGgGGGGk.',
      'kGgGGGGGGk',
      'kGeGGGGeGk',
      'kGGGGGGGGk',
      'kGGGmmGGGk',
      '.kkkkkkkk.',
    ],
  };

  // Превращает строки в отдельный canvas, увеличенный в scale раз.
  // flash = true — белый силуэт для вспышки при попадании.
  function bake(rows, scale, flash) {
    const h = rows.length;
    const w = rows[0].length;
    const c = document.createElement('canvas');
    c.width = w * scale;
    c.height = h * scale;
    const ctx = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        ctx.fillStyle = flash ? '#ffffff' : PALETTE[ch] || '#ff00ff';
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    return c;
  }

  const cache = {};
  function get(name, scale, flash) {
    const key = name + ':' + scale + ':' + (flash ? 1 : 0);
    if (!cache[key]) cache[key] = bake(SPRITES[name], scale, flash);
    return cache[key];
  }

  SV.sprites = { SPRITES, PALETTE, get };
})();
