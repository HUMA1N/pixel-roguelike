// Управление: клавиатура (стрелки / WASD) и экранный джойстик для касаний и мыши.
(function () {
  const SV = globalThis.SV || (globalThis.SV = {});

  // Используем e.code, чтобы WASD работали и при русской раскладке.
  const KEYMAP = {
    ArrowUp: [0, -1],
    KeyW: [0, -1],
    ArrowDown: [0, 1],
    KeyS: [0, 1],
    ArrowLeft: [-1, 0],
    KeyA: [-1, 0],
    ArrowRight: [1, 0],
    KeyD: [1, 0],
  };

  function createInput(canvas) {
    const pressed = new Set();
    const joystick = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0, radius: 60 };

    window.addEventListener('keydown', (e) => {
      if (KEYMAP[e.code]) {
        pressed.add(e.code);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => pressed.delete(e.code));
    window.addEventListener('blur', () => pressed.clear());

    function local(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (joystick.active) return;
      const pt = local(e);
      joystick.active = true;
      joystick.id = e.pointerId;
      joystick.ox = pt.x;
      joystick.oy = pt.y;
      joystick.dx = 0;
      joystick.dy = 0;
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!joystick.active || e.pointerId !== joystick.id) return;
      const pt = local(e);
      let dx = pt.x - joystick.ox;
      let dy = pt.y - joystick.oy;
      const l = Math.hypot(dx, dy);
      if (l > joystick.radius) {
        dx = (dx / l) * joystick.radius;
        dy = (dy / l) * joystick.radius;
      }
      joystick.dx = dx;
      joystick.dy = dy;
      e.preventDefault();
    });
    function release(e) {
      if (e.pointerId !== joystick.id) return;
      joystick.active = false;
      joystick.id = null;
      joystick.dx = 0;
      joystick.dy = 0;
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    function get() {
      let x = 0;
      let y = 0;
      for (const code of pressed) {
        x += KEYMAP[code][0];
        y += KEYMAP[code][1];
      }
      if (x !== 0 || y !== 0) return { x, y };
      if (joystick.active) {
        // Небольшая «мёртвая зона», чтобы герой не дёргался от случайного касания
        const l = Math.hypot(joystick.dx, joystick.dy);
        if (l < 8) return { x: 0, y: 0 };
        return { x: joystick.dx / joystick.radius, y: joystick.dy / joystick.radius };
      }
      return { x: 0, y: 0 };
    }

    function reset() {
      pressed.clear();
      joystick.active = false;
      joystick.id = null;
      joystick.dx = 0;
      joystick.dy = 0;
    }

    return { get, joystick, reset };
  }

  SV.createInput = createInput;
})();
