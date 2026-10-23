import { watchBuildStatus } from './ui/BuildStatus';
import './style.css';
import { Game } from './game/Game';
try {
  const game = new Game();
  watchBuildStatus();
  if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
} catch (e) {
  document.querySelector('#app')!.textContent = `无法初始化 3D 画面：${String(e)}`;
}
if (import.meta.env.PROD && 'serviceWorker' in navigator)
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .catch(() => {});
  });
