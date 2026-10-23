/** Probe the local server; an online network flag alone cannot establish availability. */
export function watchBuildStatus() {
  const label = document.querySelector<HTMLElement>('#build-status');
  if (!label) return;
  if (import.meta.env.DEV) {
    label.textContent = `v${__APP_VERSION__} · 开发预览`;
    return;
  }
  let checking = false;
  const check = async () => {
    if (checking) return;
    checking = true;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 2000);
    try {
      if (!navigator.onLine) throw Error('Network offline');
      const url = new URL(`${import.meta.env.BASE_URL}build-info.json`, location.href);
      // Unique probes bypass previously installed workers' cached metadata too.
      url.searchParams.set('check', String(Date.now()));
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw Error('Local preview unavailable');
      const info = await response.json();
      if (typeof info.version !== 'string') throw Error('Invalid build information');
      label.textContent =
        info.version === __APP_VERSION__
          ? `v${__APP_VERSION__} · 本地服务已连接`
          : `v${__APP_VERSION__} · 新版 v${info.version} 可用，请刷新`;
      label.dataset.connection = 'online';
    } catch {
      label.textContent = `v${__APP_VERSION__} · 离线缓存（本地服务未连接）`;
      label.dataset.connection = 'offline';
    } finally {
      clearTimeout(timer);
      checking = false;
    }
  };
  void check();
  setInterval(() => void check(), 30000);
  window.addEventListener('online', () => void check());
  window.addEventListener('offline', () => void check());
  window.addEventListener('focus', () => void check());
}
