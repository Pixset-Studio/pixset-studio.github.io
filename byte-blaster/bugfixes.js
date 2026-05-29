// bugfixes.js — минимальная безопасная версия
// Все критичные исправления fire/ice уже встроены в index.html

console.log('✔ bugfixes.js loaded (minimal safe version)');

// Защита от смерти после флага (BUG #6)
window.addEventListener('load', function() {
  if (typeof window.doHurtPlayer === 'function') {
    const _orig6a = window.doHurtPlayer;
    window.doHurtPlayer = function() {
      if (window.exitAnim) return;
      return _orig6a.apply(this, arguments);
    };
  }
  if (typeof window.doHurtPlayer2 === 'function') {
    const _orig6b = window.doHurtPlayer2;
    window.doHurtPlayer2 = function() {
      if (window.exitAnim) return;
      if (window.godMode) return;
      if (window.infiniteLives) { if (window.lives2 !== undefined) window.lives2 = Math.max(window.lives2, 3); return; }
      return _orig6b.apply(this, arguments);
    };
  }

  // Retry кнопка сбрасывает жизни (BUG #7)
  if (typeof window.showGameover === 'function') {
    const _orig7 = window.showGameover;
    window.showGameover = function() {
      const r = _orig7.apply(this, arguments);
      const btn = document.getElementById('retryBtn');
      if (btn && window.advMode && window.advLevel) {
        btn.onclick = function() {
          window.SFX && window.SFX.menu && window.SFX.menu();
          window.startAdv(window.advLevel, true);
        };
      }
      return r;
    };
  }

  console.log('✔ Safe patches applied');
});
