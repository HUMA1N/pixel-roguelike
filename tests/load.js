// Подключает игровые файлы в Node так же, как браузер подключает их через <script>.
const path = require('path');

function load() {
  delete globalThis.SV;
  for (const f of ['utils.js', 'game.js']) {
    const p = path.join(__dirname, '..', 'js', f);
    delete require.cache[require.resolve(p)];
    require(p);
  }
  return globalThis.SV;
}

module.exports = { load };
