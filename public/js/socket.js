let socket;

function initSocket() {
  socket = io({
    transports: ['websocket', 'polling'],
    connectTimeout: 10000
  });
  socket.on('connect_error', (err) => {
    console.error('Socket connect error:', err.message);
  });
}
