// Mobile panel: one button that opens the board. Delegated, because the script may load before the HTML.
document.addEventListener('click', (event) => {
  if (event.target.closest && event.target.closest('#jd-open')) webviewApi.postMessage({ type: 'open' });
});
