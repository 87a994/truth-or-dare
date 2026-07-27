const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { truths } = require('./data/truths');
const { dares } = require('./data/dares');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getRandomTruth() {
  return truths[Math.floor(Math.random() * truths.length)];
}

function getRandomDare() {
  return dares[Math.floor(Math.random() * dares.length)];
}

function getNextPlayer(roomId, currentPlayerId) {
  const room = rooms[roomId];
  if (!room || room.players.length === 0) return null;
  if (!currentPlayerId) return room.players[0];
  const idx = room.players.findIndex(p => p.id === currentPlayerId);
  return room.players[(idx + 1) % room.players.length];
}

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ playerName, mode }) => {
    let code;
    do { code = generateCode(); } while (rooms[code]);

    const player = { id: socket.id, name: playerName, score: 0 };
    rooms[code] = {
      code,
      mode: mode || 'multi',
      players: [player],
      host: socket.id,
      currentPlayerId: null,
      gameState: 'waiting',
      selectionMode: 'wheel',
      usedTruths: [],
      usedDares: []
    };

    socket.join(code);
    socket.emit('roomCreated', { code, player });
    io.to(code).emit('playersUpdate', { players: rooms[code].players, host: socket.id });
  });

  socket.on('joinRoom', ({ playerName, code }) => {
    const roomKey = code.toUpperCase();
    const room = rooms[roomKey];

    if (!room) return socket.emit('error', '房间不存在，请检查房间码');
    if (room.gameState !== 'waiting') return socket.emit('error', '游戏已开始，无法加入');
    if (room.players.length >= 20) return socket.emit('error', '房间已满');

    const player = { id: socket.id, name: playerName, score: 0 };
    room.players.push(player);
    socket.join(roomKey);
    socket.emit('roomJoined', { code: roomKey, player, host: room.host });
    io.to(roomKey).emit('playersUpdate', { players: room.players, host: room.host });
  });

  socket.on('startGame', ({ code }) => {
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    if (room.players.length < 2) return socket.emit('error', '至少需要2名玩家');

    room.gameState = 'playing';
    room.usedTruths = [];
    room.usedDares = [];
    const firstPlayer = room.players[0];
    room.currentPlayerId = firstPlayer.id;
    io.to(code).emit('gameStarted', { currentPlayer: firstPlayer });
  });

  socket.on('selectPlayer', ({ code, method }) => {
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;

    if (method === 'dice') {
      const results = room.players.map(p => ({ ...p, dice: rollDice() }));
      const maxScore = Math.max(...results.map(r => r.dice));
      const candidates = results.filter(r => r.dice === maxScore);
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      room.currentPlayerId = chosen.id;
      io.to(code).emit('diceResult', { results, chosen });
    } else if (method === 'wheel') {
      const idx = Math.floor(Math.random() * room.players.length);
      room.currentPlayerId = room.players[idx].id;
      io.to(code).emit('wheelResult', { player: room.players[idx] });
    } else {
      const next = getNextPlayer(code, room.currentPlayerId);
      if (next) {
        room.currentPlayerId = next.id;
        io.to(code).emit('nextPlayer', { player: next });
      }
    }
  });

  socket.on('chooseTruth', ({ code }) => {
    const room = rooms[code];
    if (!room || room.currentPlayerId !== socket.id) return;
    let question = getRandomTruth();
    let attempts = 0;
    while (room.usedTruths.includes(question) && attempts < 50) {
      question = getRandomTruth();
      attempts++;
    }
    room.usedTruths.push(question);
    io.to(code).emit('showTruth', { question, playerId: socket.id });
  });

  socket.on('chooseDare', ({ code }) => {
    const room = rooms[code];
    if (!room || room.currentPlayerId !== socket.id) return;
    let challenge = getRandomDare();
    let attempts = 0;
    while (room.usedDares.includes(challenge) && attempts < 50) {
      challenge = getRandomDare();
      attempts++;
    }
    room.usedDares.push(challenge);
    io.to(code).emit('showDare', { challenge, playerId: socket.id });
  });

  socket.on('nextRound', ({ code }) => {
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    const next = getNextPlayer(code, room.currentPlayerId);
    if (next) {
      room.currentPlayerId = next.id;
      io.to(code).emit('nextPlayer', { player: next });
    }
  });

  socket.on('addScore', ({ code, playerId }) => {
    const room = rooms[code];
    if (!room) return;
    const player = room.players.find(p => p.id === playerId);
    if (!player) return;
    player.score++;
    io.to(code).emit('playersUpdate', { players: room.players, host: room.host });
  });

  socket.on('setSelectionMode', ({ code, mode }) => {
    const room = rooms[code];
    if (room && room.host === socket.id) {
      room.selectionMode = mode;
      io.to(code).emit('selectionModeChanged', { mode });
    }
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        if (room.players.length === 0) {
          delete rooms[code];
        } else {
          if (room.host === socket.id) {
            room.host = room.players[0].id;
          }
          io.to(code).emit('playersUpdate', { players: room.players, host: room.host });
          io.to(code).emit('playerLeft', { playerId: socket.id });
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});
