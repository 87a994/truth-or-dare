const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { truths } = require('./data/truths');
const { dares } = require('./data/dares');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

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

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function getNextPlayer(room, currentId) {
  if (!room || room.players.length === 0) return null;
  if (!currentId) return room.players[0];
  const idx = room.players.findIndex(p => p.id === currentId);
  if (idx === -1) return room.players[0];
  return room.players[(idx + 1) % room.players.length];
}

function startDiceRound(room, code) {
  const pool = shuffle([...room.players]);
  const duel = pool.slice(0, Math.min(2, pool.length));
  room.diceData = { players: duel.map(p => ({ id: p.id, name: p.name, dice: null })), index: 0, round: 1 };
  io.to(code).emit('diceDuel', { players: room.diceData.players });
  io.to(code).emit('diceRollTurn', { playerId: room.diceData.players[0].id, round: 1 });
}

function checkDiceResults(room, code) {
  const values = room.diceData.players.map(p => p.dice);
  const minVal = Math.min(...values);
  const tied = room.diceData.players.filter(p => p.dice === minVal);
  if (tied.length === 1) {
    const loser = tied[0];
    const results = room.diceData.players.map(p => ({ id: p.id, name: p.name, dice: p.dice }));
    room.currentPlayerId = loser.id;
    delete room.diceData;
    setTimeout(() => {
      io.to(code).emit('selectResult', { method: 'dice', results, player: loser });
    }, 2500);
  } else if (tied.length === room.diceData.players.length) {
    room.diceData.players.forEach(p => p.dice = null);
    room.diceData.index = 0;
    room.diceData.round++;
    io.to(code).emit('diceRollTie', { tied: tied.map(p => p.id), all: true });
    setTimeout(() => {
      io.to(code).emit('diceRollTurn', { playerId: room.diceData.players[0].id, round: room.diceData.round });
    }, 2000);
  } else {
    const remaining = room.diceData.players.filter(p => p.dice !== minVal);
    room.diceData.players = tied.map(p => ({ ...p, dice: null }));
    room.diceData.index = 0;
    room.diceData.round++;
    io.to(code).emit('diceRollTie', { tied: tied.map(p => p.id), all: false });
    setTimeout(() => {
      io.to(code).emit('diceRollTurn', { playerId: room.diceData.players[0].id, round: room.diceData.round });
    }, 2000);
  }
}

function selectPlayerForRoom(room, code) {
  if (!room || room.players.length === 0) return;
  const method = room.selectionMode;
  if (method === 'dice') {
    startDiceRound(room, code);
    return;
  } else if (method === 'wheel') {
    const idx = Math.floor(Math.random() * room.players.length);
    room.currentPlayerId = room.players[idx].id;
    io.to(code).emit('selectResult', { method: 'wheel', player: room.players[idx] });
  } else if (method === 'bottle') {
    const idx = Math.floor(Math.random() * room.players.length);
    room.currentPlayerId = room.players[idx].id;
    io.to(code).emit('selectResult', { method: 'bottle', player: room.players[idx] });
  } else {
    const next = getNextPlayer(room, room.currentPlayerId);
    if (!next) return;
    room.currentPlayerId = next.id;
    io.to(code).emit('selectResult', { method: 'turn', player: next });
  }
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ playerName, mode }) => {
    let code;
    do { code = generateCode(); } while (rooms[code]);

    const player = { id: socket.id, name: playerName, score: 0 };
    rooms[code] = {
      code, mode: mode || 'multi', players: [player], host: socket.id,
      currentPlayerId: null, gameState: 'waiting', selectionMode: 'wheel', chat: []
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
    socket.emit('chatHistory', room.chat);
    io.to(roomKey).emit('playersUpdate', { players: room.players, host: room.host });
  });

  socket.on('startGame', ({ code }) => {
    const room = rooms[code];
    if (!room) return socket.emit('error', '房间不存在或已过期，请重新创建');
    if (room.host !== socket.id) return socket.emit('error', '只有房主可以开始游戏');
    if (room.players.length < 1) return socket.emit('error', '至少需要1名玩家');

    room.gameState = 'playing';
    room.usedTruths = [];
    room.usedDares = [];
    io.to(code).emit('gameStarted', { method: room.selectionMode, players: room.players.map(p => ({ id: p.id, name: p.name })) });
    setTimeout(() => selectPlayerForRoom(room, code), 1500);
  });

  socket.on('chooseTruth', ({ code }) => {
    const room = rooms[code];
    if (!room || room.currentPlayerId !== socket.id) return;
    const available = truths.filter((_, i) => !room.usedTruths.includes(i));
    if (available.length === 0) {
      room.usedTruths = [];
      return io.to(code).emit('showTruth', { question: '题库已用完，本轮结束！', playerId: socket.id, playerName: room.players.find(p => p.id === socket.id)?.name });
    }
    const idx = Math.floor(Math.random() * available.length);
    const question = available[idx];
    const originalIdx = truths.indexOf(question);
    room.usedTruths.push(originalIdx);
    io.to(code).emit('showTruth', { question, playerId: socket.id, playerName: room.players.find(p => p.id === socket.id)?.name });
  });

  socket.on('chooseDare', ({ code }) => {
    const room = rooms[code];
    if (!room || room.currentPlayerId !== socket.id) return;
    const available = dares.filter((_, i) => !room.usedDares.includes(i));
    if (available.length === 0) {
      room.usedDares = [];
      return io.to(code).emit('showDare', { challenge: '题库已用完，本轮结束！', playerId: socket.id, playerName: room.players.find(p => p.id === socket.id)?.name });
    }
    const idx = Math.floor(Math.random() * available.length);
    const challenge = available[idx];
    const originalIdx = dares.indexOf(challenge);
    room.usedDares.push(originalIdx);
    io.to(code).emit('showDare', { challenge, playerId: socket.id, playerName: room.players.find(p => p.id === socket.id)?.name });
  });

  socket.on('submitAnswer', ({ code, answer }) => {
    const room = rooms[code];
    if (!room || !answer || !answer.trim()) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    io.to(code).emit('showAnswer', { playerName: player.name, answer: answer.trim(), playerId: socket.id });
  });

  socket.on('approveAnswer', ({ code }) => {
    const room = rooms[code];
    if (!room) return;
    io.to(code).emit('answerApproved');
  });

  socket.on('rollDice', ({ code }) => {
    const room = rooms[code];
    if (!room || !room.diceData) return;
    const idx = room.diceData.players.findIndex(p => p.id === socket.id);
    if (idx === -1 || idx !== room.diceData.index) return;
    const value = rollDice();
    room.diceData.players[idx].dice = value;
    room.diceData.index++;
    io.to(code).emit('diceRolled', { playerId: socket.id, value, players: room.diceData.players.map(p => ({ id: p.id, name: p.name, dice: p.dice })) });
    if (room.diceData.index >= room.diceData.players.length) {
      checkDiceResults(room, code);
    } else {
      setTimeout(() => {
        io.to(code).emit('diceRollTurn', { playerId: room.diceData.players[room.diceData.index].id, round: room.diceData.round });
      }, 1200);
    }
  });

  socket.on('nextRound', ({ code }) => {
    const room = rooms[code];
    if (!room || room.host !== socket.id) return socket.emit('error', '只有房主可以开始游戏');
    io.to(code).emit('roundEnd', { method: room.selectionMode, players: room.players.map(p => ({ id: p.id, name: p.name })) });
    setTimeout(() => selectPlayerForRoom(room, code), 2000);
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

  socket.on('chatMessage', ({ code, message }) => {
    const room = rooms[code];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !message || !message.trim()) return;
    const msg = { id: Date.now(), name: player.name, text: message.trim(), time: Date.now() };
    room.chat.push(msg);
    if (room.chat.length > 100) room.chat.shift();
    io.to(code).emit('chatMessage', msg);
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
