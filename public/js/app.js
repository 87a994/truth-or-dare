let myPlayer = null;
let currentRoom = null;
let isHost = false;
let currentSelectionMode = 'wheel';
let players = [];
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
  document.getElementById('loadingOverlay').classList.remove('hidden');
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
  document.getElementById('choiceButtons').classList.add('hidden');
  document.getElementById('waitingMsg').classList.add('hidden');
  document.getElementById('approveBtn').classList.add('hidden');
  document.getElementById('waitingApproval').classList.add('hidden');
  if (isHost) {
    document.getElementById('hostNextBtn').classList.remove('hidden');
  } else {
    document.getElementById('waitingMsg').classList.remove('hidden');
    document.getElementById('waitingMsg').querySelector('.muted').textContent = '等待房主开始下一轮...';
  }
}

function submitAnswer() {
  const input = document.getElementById('answerInput');
  const text = input.value.trim();
  if (!text || !socket || !currentRoom) return;
  socket.emit('submitAnswer', { code: currentRoom, answer: text });
  input.value = '';
  input.disabled = true;
  document.getElementById('answerArea').classList.add('hidden');
  document.getElementById('waitingApproval').classList.remove('hidden');
}

function rollMyDice() {
  if (!socket || !currentRoom) return;
  document.getElementById('diceRollBtn').disabled = true;
  document.getElementById('diceRollBtn').textContent = '🎲 掷骰中...';
  socket.emit('rollDice', { code: currentRoom });
}

function approveAnswer() {
  if (!socket || !currentRoom) return;
  socket.emit('approveAnswer', { code: currentRoom });
}

function nextRound() {
  if (!socket || !currentRoom) return;
  socket.emit('nextRound', { code: currentRoom });
  document.getElementById('hostNextBtn').classList.add('hidden');
}

function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || !socket || !currentRoom) return;
  socket.emit('chatMessage', { code: currentRoom, message: text });
  input.value = '';
}

function showSelectionAnimation(method, playerList) {
  document.getElementById('gamePlayPhase').classList.add('hidden');
  document.getElementById('playerSelectPhase').classList.remove('hidden');
  document.getElementById('selectResult').classList.add('hidden');
  document.querySelectorAll('#wheelContainer, #diceContainer, #bottleContainer').forEach(e => e.classList.add('hidden'));
  const titleMap = { wheel: '🎰 转盘选人中...', dice: '🎲 骰子选人中...', bottle: '🍾 转瓶选人中...', turn: '🔄 轮到谁呢...' };
  document.getElementById('phaseTitle').textContent = titleMap[method] || '🎰 选人中...';
  const list = playerList && playerList.length ? playerList : players;

  if (method === 'bottle') {
    document.getElementById('bottleContainer').classList.remove('hidden');
    const namesContainer = document.getElementById('bottleNames');
    namesContainer.innerHTML = list.map((p, i) => {
      const angle = (360 / list.length) * i;
      return `<span class="bottle-name-item" style="transform:rotate(${angle}deg) translateY(-80px) rotate(-${angle}deg)">${p.avatar || '😎'} ${p.name}</span>`;
    }).join('');
    const bottle = document.querySelector('.bottle');
    if (bottle) {
      bottle.style.animation = 'none';
      void bottle.offsetWidth;
      bottle.style.animation = 'spinBottle 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    }
  } else if (method === 'dice') {
    document.getElementById('diceContainer').classList.remove('hidden');
    document.getElementById('diceDisplay').textContent = '🎲';
    document.getElementById('diceResults').textContent = '';
    document.getElementById('diceDuelMessages').innerHTML = '';
    document.getElementById('diceDuelPlayers').innerHTML = '';
    document.getElementById('diceRollBtn').classList.add('hidden');
    document.getElementById('diceWaitMsg').classList.add('hidden');
  } else {
    document.getElementById('wheelContainer').classList.remove('hidden');
    const colors = ['#ff6b6b','#ffd93d','#6c5ce7','#00cec9','#fd79a8','#e17055','#00b894','#0984e3','#e84393','#fdcb6e'];
    const inner = document.getElementById('wheelInner');
    const namesEl = document.getElementById('wheelNames');
    const total = list.length;
    const segAngle = 360 / total;
    inner.style.background = `conic-gradient(${list.map((p, i) => `${colors[i % colors.length]} ${i * segAngle}deg ${(i + 1) * segAngle}deg`).join(',')})`;
    namesEl.innerHTML = list.map((p, i) => {
      const angle = (segAngle * i) + (segAngle / 2);
      return `<span class="wheel-name-item" style="transform:rotate(${angle}deg) translateY(-60px) rotate(-${angle}deg)">${p.name}</span>`;
    }).join('');
    const wheel = document.querySelector('.wheel');
    if (wheel) {
      wheel.style.animation = 'none';
      void wheel.offsetWidth;
      wheel.style.animation = 'spinWheel 3.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    }
  }
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
  const me = players.find(p => p.id === socket.id);
  document.getElementById('myScoreBadge').textContent = me ? `🏆 ${me.score}分` : '🏆 0分';
}

function showPlayerTurn(player) {
  document.getElementById('currentPlayerAvatar').textContent = player.avatar || '😎';
  document.getElementById('currentPlayerName').textContent = player.name;
  document.getElementById('questionDisplay').classList.add('hidden');
  document.getElementById('waitingMsg').classList.add('hidden');
  document.getElementById('hostNextBtn').classList.add('hidden');
  document.getElementById('choiceButtons').classList.add('hidden');

  if (player.id === socket.id) {
    document.getElementById('currentPlayerCard').querySelector('.turn-label').textContent = '🎯 选一个吧！';
    document.getElementById('choiceButtons').classList.remove('hidden');
  } else {
    document.getElementById('currentPlayerCard').querySelector('.turn-label').textContent = '⏳ 等待TA选择...';
    document.getElementById('waitingMsg').classList.remove('hidden');
    document.getElementById('waitingMsg').querySelector('.muted').textContent = `等待 ${player.name} 作答...`;
  }
}

initSocket();

socket.on('connect', () => {
  document.getElementById('loadingOverlay').classList.add('hidden');
});

socket.on('roomCreated', (data) => {
  document.getElementById('loadingOverlay').classList.add('hidden');
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
  document.getElementById('chatCard').classList.remove('hidden');
});

socket.on('roomJoined', (data) => {
  document.getElementById('loadingOverlay').classList.add('hidden');
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
  document.getElementById('chatCard').classList.remove('hidden');
});

socket.on('playersUpdate', (data) => {
  players = data.players.map(p => {
    if (p.id === socket.id && myPlayer && myPlayer.avatar) {
      return { ...p, avatar: myPlayer.avatar };
    }
    return { ...p, avatar: p.avatar || avatars[Math.floor(Math.random() * avatars.length)] };
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
  document.getElementById('loadingOverlay').classList.add('hidden');
  document.getElementById('waitingRoom').classList.add('hidden');
  document.getElementById('gameRoom').classList.remove('hidden');
  currentSelectionMode = data.method;
  if (data.players) players = data.players.map(p => ({ ...p, avatar: p.avatar || avatars[Math.floor(Math.random() * avatars.length)] }));
  showSelectionAnimation(data.method, players);
});

socket.on('diceDuel', (data) => {
  document.getElementById('diceRollBtn').classList.add('hidden');
  document.getElementById('diceWaitMsg').classList.add('hidden');
  document.getElementById('diceDuelMessages').innerHTML = '';
  document.getElementById('diceResults').textContent = '';
  document.getElementById('diceDuelPlayers').innerHTML = data.players.map(p =>
    `<span class="duel-player-name">${p.name}</span>`
  ).join(' <span class="vs">VS</span> ');
});

socket.on('diceRollTurn', (data) => {
  document.getElementById('diceResults').textContent = '';
  if (data.playerId === socket.id) {
    document.getElementById('diceRollBtn').classList.remove('hidden');
    document.getElementById('diceRollBtn').disabled = false;
    document.getElementById('diceRollBtn').textContent = `🎲 第${data.round}轮 - 开始掷骰！`;
    document.getElementById('diceWaitMsg').classList.add('hidden');
  } else {
    document.getElementById('diceRollBtn').classList.add('hidden');
    document.getElementById('diceWaitMsg').classList.remove('hidden');
    const p = players.find(p2 => p2.id === data.playerId);
    document.getElementById('diceWaitMsg').textContent = `⏳ 等待 ${p ? p.name : '对手'} 掷骰子 (第${data.round}轮)...`;
  }
});

socket.on('diceRolled', (data) => {
  document.getElementById('diceRollBtn').classList.add('hidden');
  const display = document.getElementById('diceDisplay');
  const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  display.classList.add('dice-shake');
  let count = 0;
  const interval = setInterval(() => {
    display.textContent = faces[Math.floor(Math.random() * 6)];
    count++;
    if (count > 12) {
      clearInterval(interval);
      display.classList.remove('dice-shake');
      display.textContent = faces[(data.value || 1) - 1];
      const results = document.getElementById('diceResults');
      results.innerHTML = data.players.map(p =>
        `${p.name}: ${p.dice ? faces[p.dice - 1] : '⏳'}`
      ).join(' | ');
    }
  }, 100);
});

socket.on('diceRollTie', (data) => {
  const msg = document.getElementById('diceDuelMessages');
  if (data.all) {
    msg.innerHTML += '<p class="tie-msg">⚖️ 全部平局！重新掷！</p>';
  } else {
    const names = data.tied.map(id => {
      const p = players.find(p2 => p2.id === id);
      return p ? p.name : '未知';
    }).join(' 和 ');
    msg.innerHTML += `<p class="tie-msg">⚖️ ${names} 平局！重新掷！</p>`;
  }
});

socket.on('roundEnd', (data) => {
  if (data.players) players = data.players.map(p => ({ ...p, avatar: p.avatar || avatars[Math.floor(Math.random() * avatars.length)] }));
  showSelectionAnimation(data.method, players);
});

socket.on('selectResult', (data) => {
  document.getElementById('playerSelectPhase').classList.add('hidden');
  document.getElementById('gamePlayPhase').classList.remove('hidden');

  if (data.method === 'dice' && data.results) {
    const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    const results = document.getElementById('diceResults');
    results.innerHTML = data.results.map(r => `${r.name}: ${faces[r.dice - 1]}`).join(' | ');
    setTimeout(() => {
      document.getElementById('selectedAvatar').textContent = data.player.avatar || '😎';
      document.getElementById('selectedName').textContent = data.player.name;
      document.getElementById('selectResult').classList.remove('hidden');
      setTimeout(() => {
        document.getElementById('selectResult').classList.add('hidden');
        showPlayerTurn(data.player);
      }, 2500);
    }, 1500);
    return;
  }

  if (data.method === 'bottle' || data.method === 'wheel' || data.method === 'turn') {
    document.getElementById('diceContainer').classList.add('hidden');
    setTimeout(() => {
      document.getElementById('selectedAvatar').textContent = data.player.avatar || '😎';
      document.getElementById('selectedName').textContent = data.player.name;
      document.getElementById('selectResult').classList.remove('hidden');
      setTimeout(() => {
        document.getElementById('selectResult').classList.add('hidden');
        showPlayerTurn(data.player);
      }, 2500);
    }, data.method === 'bottle' ? 2500 : 1500);
  }
});

socket.on('showTruth', (data) => {
  document.getElementById('choiceButtons').classList.add('hidden');
  document.getElementById('waitingMsg').classList.add('hidden');
  const display = document.getElementById('questionDisplay');
  display.classList.remove('hidden');
  document.getElementById('qTypeBadge').textContent = '💔 真心话';
  document.getElementById('qTypeBadge').className = 'question-type-badge truth';
  document.getElementById('questionText').textContent = `${data.playerName} 的真心话：${data.question}`;
  document.getElementById('answerDisplay').classList.add('hidden');
  document.getElementById('answerDisplay').textContent = '';
  document.getElementById('waitingApproval').classList.add('hidden');
  document.getElementById('approveBtn').classList.add('hidden');
  document.getElementById('doneBtn').classList.add('hidden');
  if (data.playerId === socket.id) {
    document.getElementById('answerArea').classList.remove('hidden');
    document.getElementById('answerInput').value = '';
    document.getElementById('answerInput').disabled = false;
  } else {
    document.getElementById('answerArea').classList.add('hidden');
  }
});

socket.on('showDare', (data) => {
  document.getElementById('choiceButtons').classList.add('hidden');
  document.getElementById('waitingMsg').classList.add('hidden');
  const display = document.getElementById('questionDisplay');
  display.classList.remove('hidden');
  document.getElementById('qTypeBadge').textContent = '🔥 大冒险';
  document.getElementById('qTypeBadge').className = 'question-type-badge dare';
  document.getElementById('questionText').textContent = `${data.playerName} 的大冒险：${data.challenge}`;
  document.getElementById('answerArea').classList.add('hidden');
  document.getElementById('answerDisplay').classList.add('hidden');
  const btn = document.getElementById('doneBtn');
  btn.classList.toggle('hidden', data.playerId !== socket.id);
  btn.textContent = '✅ 完成了';
});

socket.on('showAnswer', (data) => {
  const answerDisplay = document.getElementById('answerDisplay');
  answerDisplay.classList.remove('hidden');
  answerDisplay.innerHTML = `<strong>${data.playerName} 的回答：</strong>${data.answer}`;
  document.getElementById('answerInput').disabled = true;
  if (data.playerId === socket.id) {
    document.getElementById('waitingApproval').classList.remove('hidden');
  } else {
    document.getElementById('approveBtn').classList.remove('hidden');
  }
});

socket.on('answerApproved', () => {
  document.getElementById('waitingApproval').classList.add('hidden');
  document.getElementById('approveBtn').classList.add('hidden');
  document.getElementById('doneBtn').classList.remove('hidden');
});

socket.on('chatMessage', (data) => {
  const container = document.getElementById('chatMessages');
  const msg = document.createElement('div');
  msg.className = 'chat-msg';
  const isMe = data.name === (myPlayer ? myPlayer.name : '');
  msg.innerHTML = `<span class="chat-name ${isMe ? 'chat-me' : ''}">${data.name}</span><span class="chat-text">${data.text}</span>`;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
});

socket.on('chatHistory', (messages) => {
  const container = document.getElementById('chatMessages');
  container.innerHTML = '';
  messages.forEach(m => {
    const msg = document.createElement('div');
    msg.className = 'chat-msg';
    msg.innerHTML = `<span class="chat-name">${m.name}</span><span class="chat-text">${m.text}</span>`;
    container.appendChild(msg);
  });
  container.scrollTop = container.scrollHeight;
});

socket.on('selectionModeChanged', (data) => {
  currentSelectionMode = data.mode;
});

socket.on('error', (msg) => {
  document.getElementById('loadingOverlay').classList.add('hidden');
  showToast(msg);
});

socket.on('playerLeft', (data) => {});
