  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw-vendedor.js')
      .then(() => console.log('SW registrado'))
      .catch(e => console.log('SW error:', e));
  }
