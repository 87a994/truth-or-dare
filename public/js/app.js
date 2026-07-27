let myPlayer = null;
let currentRoom = null;
let isHost = false;
let currentSelectionMode = 'wheel';
let avatars = ['😎', '🤩', '😈', '👻', '🤡', '🎃', '😺', '🐶', '🐰', '🦊', '🐯', '🐲', '🦄', '🐱', '🐸', '🦁', '🐵', '🦋', '🕷️', '👽'];

function getRandomAvatar() {
  return avatars[Math.floor(Math.random() * avatars.length)];
}

function showTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  if (tab === 'create') {
    document.querySelector('.tab:first-child').classList.add('active');
    document.getElementById('createTab').classList.add('active');
  } else {
    document.querySelector('.tab:last-child').classList.add('active');
    document.getElementById('joinTab').classList.add('active');
  }
}

function selectMode(el, mode) {
  document.querySelectorAll('.mode-btn[data-mode]').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

function selectSmode(el, mode) {
  document.querySelectorAll('.mode-btn[data-smode]').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  currentSelectionMode = mode;
  if (socket && currentRoom) {
    socket.emit('setSelectionMode', { code: currentRoom, mode });
  }
}

function showToast(msg, isError = true) {
  const toast = document.getElementById('errorToast');
  toast.textContent = msg;
  toast.style.background = isError ? 'rgba(255,0,0,0.9)' : 'rgba(0,200,0,0.9)';
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function createRoom() {
  const name = document.getElementById('createName').value.trim();
  if (!name) return showToast('请输入你的名字');
  const modeBtn = document.querySelector('.mode-btn[data-mode].active');
  const mode = modeBtn ? modeBtn.dataset.mode : 'multi';

  document.getElementById('loadingOverlay').classList.remove('hidden');

  socket.emit('createRoom', { playerName: name, mode });
}

function joinRoom() {
  const name = document.getElementById('joinName').value.trim();
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if (!name) return showToast('请输入你的名字');
  if (!code || code.length !== 6) return showToast('请输入6位房间码');

  document.getElementById('loadingOverlay').classList.remove('hidden');
  socket.emit('joinRoom', { playerName: name, code });
}

function startGame() {
  if (!socket || !currentRoom) return;
  socket.emit('startGame', { code: currentRoom });
}

function chooseTruth() {
  if (!socket || !currentRoom) return;
  socket.emit('chooseTruth', { code: currentRoom });
}

function chooseDare() {
  if (!socket || !currentRoom) return;
  socket.emit('chooseDare', { code: currentRoom });
}

function confirmDone() {
  if (!socket || !currentRoom) return;
  socket.emit('addScore', { code: currentRoom, playerId: socket.id });
  document.getElementById('questionDisplay').classList.add('hidden');
  if (isHost) {
    document.getElementById('hostNextBtn').classList.remove('hidden');
  }
}

function nextRound() {
  if (!socket || !currentRoom) return;
  socket.emit('nextRound', { code: currentRoom });
  document.getElementById('hostNextBtn').classList.add('hidden');
}

function renderPlayers(players, hostId) {
  const container = document.getElementById('playersContainer');
  if (!container) return;
  container.innerHTML = players.map(p => `
    <div class="player-item">
      <span class="avatar">${p.avatar || '😎'}</span>
      <span class="name">${p.name}</span>
      ${p.id === hostId ? '<span class="badge-host">房主</span>' : ''}
    </div>
  `).join('');
  document.getElementById('playerCount').textContent = players.length;
}

function renderGamePlayers(players, currentPlayerId) {
  const container = document.getElementById('gamePlayersContainer');
  if (!container) return;
  container.innerHTML = players.map(p => `
    <div class="game-player-mini ${p.id === currentPlayerId ? 'active' : ''}">
      ${p.avatar || '😎'} ${p.name} <span class="gscore">🏆${p.score}</span>
    </div>
  `).join('');
  document.getElementById('myScoreBadge').textContent = players.find(p => p.id === socket.id) 
    ? `🏆 ${players.find(p => p.id === socket.id).score}分` 
    : '🏆 0分';
}

function getRandomAvatar() {
  return avatars[Math.floor(Math.random() * avatars.length)];
}

initSocket();

socket.on('connect', () => {
  document.getElementById('loadingOverlay').classList.add('hidden');
});

socket.on('roomCreated', (data) => {
  myPlayer = data.player;
  myPlayer.avatar = getRandomAvatar();
  currentRoom = data.code;
  isHost = true;
  document.getElementById('homePage').classList.add('hidden');
  document.getElementById('waitingRoom').classList.remove('hidden');
  document.getElementById('displayCode').textContent = data.code;
  document.getElementById('gameCode').textContent = data.code;
  document.getElementById('hostControls').classList.remove('hidden');
  document.getElementById('nonHostMsg').classList.add('hidden');
});

socket.on('roomJoined', (data) => {
  myPlayer = data.player;
  myPlayer.avatar = getRandomAvatar();
  currentRoom = data.code;
  isHost = data.host === socket.id;
  document.getElementById('homePage').classList.add('hidden');
  document.getElementById('waitingRoom').classList.remove('hidden');
  document.getElementById('displayCode').textContent = data.code;
  document.getElementById('gameCode').textContent = data.code;
  if (!isHost) {
    document.getElementById('hostControls').classList.add('hidden');
    document.getElementById('nonHostMsg').classList.remove('hidden');
  } else {
    document.getElementById('hostControls').classList.remove('hidden');
    document.getElementById('nonHostMsg').classList.add('hidden');
  }
});

socket.on('playersUpdate', (data) => {
  const players = data.players.map(p => {
    if (p.id === socket.id && myPlayer && myPlayer.avatar) {
      return { ...p, avatar: myPlayer.avatar };
    }
    return p;
  });
  renderPlayers(players, data.host);
  renderGamePlayers(players, null);
  if (data.host === socket.id && !isHost) {
    isHost = true;
    document.getElementById('hostControls').classList.remove('hidden');
    document.getElementById('nonHostMsg').classList.add('hidden');
  }
  if (data.host !== socket.id && isHost) {
    isHost = false;
    document.getElementById('hostControls').classList.add('hidden');
    document.getElementById('nonHostMsg').classList.remove('hidden');
  }
});

socket.on('gameStarted', (data) => {
  document.getElementById('waitingRoom').classList.add('hidden');
  document.getElementById('gameRoom').classList.remove('hidden');
  document.getElementById('playerSelectPhase').classList.add('hidden');
  document.getElementById('gamePlayPhase').classList.remove('hidden');
  showPlayerTurn(data.currentPlayer);
});

socket.on('wheelResult', (data) => {
  showSelectionAnimation('wheel');
  setTimeout(() => {
    document.getElementById('playerSelectPhase').classList.add('hidden');
    document.getElementById('gamePlayPhase').classList.remove('hidden');
    showPlayerTurn(data.player);
  }, 2000);
});

socket.on('diceResult', (data) => {
  const container = document.getElementById('diceContainer');
  container.classList.remove('hidden');
  const display = document.getElementById('diceDisplay');
  const results = document.getElementById('diceResults');
  let count = 0;
  const interval = setInterval(() => {
    display.textContent = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][Math.floor(Math.random() * 6)];
    count++;
    if (count > 10) {
      clearInterval(interval);
      const finalDice = data.results.find(r => r.id === data.chosen.id);
      display.textContent = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][(finalDice ? finalDice.dice : 1) - 1];
      results.innerHTML = data.results.map(r => `${r.name}: ${['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][r.dice - 1]}`).join(' | ');
      setTimeout(() => {
        document.getElementById('playerSelectPhase').classList.add('hidden');
        document.getElementById('gamePlayPhase').classList.remove('hidden');
        showPlayerTurn(data.chosen);
      }, 1500);
    }
  }, 100);
});

socket.on('nextPlayer', (data) => {
  document.getElementById('gamePlayPhase').classList.remove('hidden');
  document.getElementById('questionDisplay').classList.add('hidden');
  document.getElementById('choiceButtons').classList.remove('hidden');
  document.getElementById('hostNextBtn').classList.add('hidden');
  showPlayerTurn(data.player);
});

socket.on('showTruth', (data) => {
  document.getElementById('choiceButtons').classList.add('hidden');
  const display = document.getElementById('questionDisplay');
  display.classList.remove('hidden');
  document.getElementById('qTypeBadge').textContent = '💔 真心话';
  document.getElementById('qTypeBadge').className = 'question-type-badge truth';
  document.getElementById('questionText').textContent = data.question;
  renderGamePlayers(
    document.querySelectorAll('.game-player-mini').length > 0 ? [] : [],
    data.playerId
  );
  if (data.playerId !== socket.id) {
    document.getElementById('questionDisplay').querySelector('.btn-secondary').classList.add('hidden');
  } else {
    document.getElementById('questionDisplay').querySelector('.btn-secondary').classList.remove('hidden');
  }
});

socket.on('showDare', (data) => {
  document.getElementById('choiceButtons').classList.add('hidden');
  const display = document.getElementById('questionDisplay');
  display.classList.remove('hidden');
  document.getElementById('qTypeBadge').textContent = '🔥 大冒险';
  document.getElementById('qTypeBadge').className = 'question-type-badge dare';
  document.getElementById('questionText').textContent = data.challenge;
  if (data.playerId !== socket.id) {
    document.getElementById('questionDisplay').querySelector('.btn-secondary').classList.add('hidden');
  } else {
    document.getElementById('questionDisplay').querySelector('.btn-secondary').classList.remove('hidden');
  }
});

socket.on('error', (msg) => {
  document.getElementById('loadingOverlay').classList.add('hidden');
  showToast(msg);
});

socket.on('playerLeft', (data) => {
  // handled by playersUpdate
});

function showPlayerTurn(player) {
  const players = document.querySelectorAll('.game-player-mini');
  renderGamePlayers(
    Array.from(players).map(p => ({ 
      id: p.dataset.playerId, 
      name: p.textContent.split('🏆')[0].trim(),
      score: parseInt(p.querySelector('.gscore')?.textContent?.replace('🏆', '') || '0')
    })),
    player.id
  );
  document.getElementById('currentPlayerAvatar').textContent = player.avatar || '😎';
  document.getElementById('currentPlayerName').textContent = player.name;
  document.getElementById('choiceButtons').classList.remove('hidden');
  document.getElementById('questionDisplay').classList.add('hidden');
  document.getElementById('waitingMsg').classList.add('hidden');

  if (player.id === socket.id) {
    document.getElementById('currentPlayerCard').querySelector('.turn-label').textContent = '🎯 选一个吧！';
    document.getElementById('choiceButtons').classList.remove('hidden');
  } else {
    document.getElementById('currentPlayerCard').querySelector('.turn-label').textContent = '⏳ 等待TA选择...';
    document.getElementById('choiceButtons').classList.add('hidden');
    document.getElementById('waitingMsg').classList.remove('hidden');
  }
}

function showSelectionAnimation(type) {
  document.getElementById('playerSelectPhase').classList.remove('hidden');
  document.getElementById('gamePlayPhase').classList.add('hidden');
  document.querySelectorAll('#wheelContainer, #diceContainer, #bottleContainer').forEach(e => e.classList.add('hidden'));
  
  if (type === 'wheel') {
    document.getElementById('wheelContainer').classList.remove('hidden');
  } else if (type === 'dice') {
    document.getElementById('diceContainer').classList.remove('hidden');
  } else if (type === 'bottle') {
    document.getElementById('bottleContainer').classList.remove('hidden');
    const bottle = document.querySelector('.bottle');
    if (bottle) {
      bottle.style.animation = 'none';
      void bottle.offsetWidth;
      bottle.style.animation = 'spinBottle 1.5s ease-out';
    }
  }
}
