const EMOJIS   = { piedra: '✊', papel: '✋', tijera: '✌️' };
const MEDALLAS = ['🥇', '🥈', '🥉'];
const CHOICES  = ['piedra', 'papel', 'tijera'];

const socket = io();
let myId           = null;
let roomCode       = null;
let myPick         = null;
let selectedMax    = 2;
let selectedRounds = 5;
let savedName      = '';      // para revancha online con mismo nombre

// Estado modo IA
let vsIA          = false;
let iaScore       = 0;
let playerScore   = 0;
let iaRound       = 1;
let iaTotalRounds = 5;
let playerName    = 'Tú';

// Timer
let timerInterval = null;
let timerSeconds  = 0;

// Historial global de partidas (persiste entre sesiones de la app)
const matchHistory = [];   // { date, players, mode, winner }

// ===================== TABS — FIX: usar data-tab en lugar de índice =====================
function switchTab(tab) {
  document.querySelectorAll('.tab[data-tab]').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('lobby-error').textContent = '';
}

// ===================== SELECTOR BUTTONS =====================
document.querySelectorAll('[data-max]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-max]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMax = parseInt(btn.dataset.max);
  });
});

document.querySelectorAll('[data-r]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-r]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRounds = parseInt(btn.dataset.r);
  });
});

document.querySelectorAll('[data-ria]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-ria]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    iaTotalRounds = parseInt(btn.dataset.ria);
  });
});

// ===================== LOBBY ACTIONS =====================
function createRoom() {
  const name = document.getElementById('create-name').value.trim() || 'Jugador 1';
  savedName = name;
  socket.emit('create_room', { name, totalRounds: selectedRounds, maxPlayers: selectedMax });
}

function joinRoom() {
  const name = document.getElementById('join-name').value.trim() || 'Jugador';
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!code) return setError('Ingresa un código de sala.');
  savedName = name;
  socket.emit('join_room', { name, code });
}

function startVsIA() {
  playerName = document.getElementById('ia-name').value.trim() || 'Tú';
  vsIA = true;
  iaScore = 0;
  playerScore = 0;
  iaRound = 1;

  window._players = [
    { id: 'player', name: playerName, score: 0 },
    { id: 'ia',     name: '🤖 IA',    score: 0 }
  ];
  myId = 'player';
  window._totalRounds = iaTotalRounds;

  resetHistoryUI();
  showScreen('s-game');
  renderScoreboard(window._players);
  startRoundIA(1);
}

// Revancha online: recrea la sala con el mismo nombre
function revanchaOnline() {
  if (!savedName) return showScreen('s-lobby');
  socket.emit('create_room', {
    name: savedName,
    totalRounds: window._totalRounds || selectedRounds,
    maxPlayers: (window._players || []).length || selectedMax
  });
}

function setError(msg) {
  document.getElementById('lobby-error').textContent = msg;
}

// ===================== TIMER UI =====================
function startTimerUI(seconds) {
  clearTimerUI();
  timerSeconds = seconds;
  const el = document.getElementById('timer-display');
  if (el) { el.textContent = timerSeconds; el.classList.remove('urgent'); }
  timerInterval = setInterval(() => {
    timerSeconds--;
    if (el) {
      el.textContent = timerSeconds;
      if (timerSeconds <= 5) el.classList.add('urgent');
    }
    if (timerSeconds <= 0) clearTimerUI();
  }, 1000);
}

function clearTimerUI() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  const el = document.getElementById('timer-display');
  if (el) { el.textContent = ''; el.classList.remove('urgent'); }
}

// ===================== SOCKET EVENTS =====================
socket.on('room_created', ({ code, playerId }) => {
  myId = playerId;
  roomCode = code;
  vsIA = false;
  document.getElementById('room-code-display').textContent = code;
  showScreen('s-waiting');
});

socket.on('room_joined', ({ code, playerId }) => {
  myId = playerId;
  roomCode = code;
  vsIA = false;
});

socket.on('room_update', ({ players }) => {
  const list = document.getElementById('waiting-players');
  if (!list) return;
  list.innerHTML = players.map(p =>
    `<li class="${p.id === myId ? 'me' : ''}"><span class="dot"></span>${p.name}${p.id === myId ? ' (tú)' : ''}</li>`
  ).join('');
});

socket.on('error', (msg) => setError(msg));

socket.on('game_start', ({ players, totalRounds, currentRound }) => {
  window._players = players;
  window._totalRounds = totalRounds;
  resetHistoryUI();
  showScreen('s-game');
  renderScoreboard(players);
  startRound(currentRound, totalRounds);
});

socket.on('timer_start', ({ seconds }) => startTimerUI(seconds));

socket.on('pick_update', ({ pickedCount, totalPlayers }) => {
  if (myPick) {
    document.getElementById('pick-waiting').textContent =
      `${pickedCount} de ${totalPlayers} jugadores han elegido...`;
  }
});

socket.on('round_result', ({ picks, winners, scores, players, currentRound, nextRound, totalRounds, finished, timedOut }) => {
  clearTimerUI();
  window._players = players;
  renderScoreboard(players);
  if (timedOut) document.getElementById('pick-waiting').textContent = '⏰ Tiempo agotado — jugada automática';
  showRoundResult({ picks, winners, players, currentRound, nextRound, totalRounds, finished });
});

socket.on('game_over', ({ players }) => {
  clearTimerUI();
  recordMatch(players, 'online');
  showEndScreen(players);
});

socket.on('player_left', () => {
  clearTimerUI();
  document.getElementById('pick-waiting').textContent = '⚠️ Un jugador se desconectó.';
});

// ===================== GAME RENDER =====================
function renderScoreboard(players) {
  document.getElementById('scoreboard').innerHTML = players.map(p =>
    `<div class="score-row">
      <span class="score-name">${p.name}${p.id === myId ? ' <span class="you-tag">(tú)</span>' : ''}</span>
      <span class="score-pts">${p.score}</span>
    </div>`
  ).join('');
}

function startRound(current, total) {
  myPick = null;
  document.getElementById('round-badge').textContent = `Ronda ${current} / ${total}`;
  document.getElementById('turn-banner').style.display = '';
  document.getElementById('turn-banner').textContent = 'Elige tu mano 👇';
  document.getElementById('result-panel').style.display = 'none';
  document.getElementById('pick-waiting').textContent = '';
  document.querySelectorAll('.hand-btn').forEach(b => b.classList.remove('locked', 'selected'));
}

document.querySelectorAll('.hand-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (myPick) return;
    if (vsIA) { pickVsIA(btn.dataset.pick); return; }
    myPick = btn.dataset.pick;
    btn.classList.add('selected');
    document.querySelectorAll('.hand-btn').forEach(b => b.classList.add('locked'));
    document.getElementById('turn-banner').textContent = `Elegiste ${EMOJIS[myPick]} — esperando...`;
    socket.emit('pick', { code: roomCode, choice: myPick });
  });
});

function showRoundResult({ picks, winners, players, currentRound, nextRound, totalRounds, finished }) {
  document.getElementById('turn-banner').style.display = 'none';
  document.getElementById('pick-waiting').textContent = '';

  document.getElementById('reveal-row').innerHTML = players.map(p =>
    `<div class="reveal-item">
      <div class="reveal-emoji">${EMOJIS[picks[p.id]]}</div>
      <div class="reveal-name">${p.name}${p.id === myId ? ' (tú)' : ''}</div>
      <div class="reveal-choice">${picks[p.id].charAt(0).toUpperCase() + picks[p.id].slice(1)}</div>
    </div>`
  ).join('');

  const winNames = winners.map(id => players.find(p => p.id === id)?.name).filter(Boolean);
  const isWinner = winners.includes(myId);
  const isDraw   = winners.length === 0;

  let txt, cls;
  if (isDraw)        { txt = '🤝 Empate';              cls = 'draw'; }
  else if (isWinner) { txt = '🏆 ¡Ganaste la ronda!';  cls = 'win';  }
  else               { txt = `${winNames.join(' & ')} gana`;          cls = 'lose'; }

  const msgEl = document.getElementById('result-msg');
  msgEl.textContent = txt;
  msgEl.className = 'result-msg ' + cls;

  // ── Historial de rondas en partida ──
  addRoundToHistory(currentRound, players, picks, txt, cls);

  document.getElementById('result-panel').style.display = '';
  const nextBtn = document.getElementById('btn-next');

  if (finished) {
    nextBtn.textContent = 'Ver resultados →';
    nextBtn.onclick = () => {
      if (vsIA) { recordMatch(window._players, 'ia'); }
      showEndScreen(players);
    };
  } else {
    nextBtn.textContent = 'Siguiente ronda →';
    nextBtn.onclick = () => {
      if (vsIA) { startRoundIA(nextRound); }
      else { socket.emit('ready_next', { code: roomCode }); startRound(nextRound, totalRounds); }
    };
  }
}

// ===================== HISTORIAL DE RONDAS (en partida) =====================
function addRoundToHistory(roundNum, players, picks, resultTxt, cls) {
  const histEl = document.getElementById('history-list');
  if (histEl.querySelector('.empty-hist')) histEl.innerHTML = '';
  const item = document.createElement('div');
  item.className = 'hist-item';
  const matchup = players.map(p => `${p.name} ${EMOJIS[picks[p.id]]}`).join(' vs ');
  item.innerHTML = `<span class="hist-round">R${roundNum}</span><span class="hist-matchup">${matchup}</span><span class="hist-res ${cls}">${resultTxt}</span>`;
  histEl.prepend(item);
}

function resetHistoryUI() {
  document.getElementById('history-list').innerHTML = '<span class="empty-hist">Sin rondas jugadas aún</span>';
}

// ===================== MODO IA =====================
function beatsLocal(a, b) {
  if (a === b) return 0;
  if ((a==='piedra'&&b==='tijera')||(a==='tijera'&&b==='papel')||(a==='papel'&&b==='piedra')) return 1;
  return -1;
}

function startRoundIA(round) {
  myPick = null;
  document.getElementById('round-badge').textContent = `Ronda ${round} / ${iaTotalRounds}`;
  document.getElementById('turn-banner').style.display = '';
  document.getElementById('turn-banner').textContent = 'Elige tu mano 👇';
  document.getElementById('result-panel').style.display = 'none';
  document.getElementById('pick-waiting').textContent = '';
  document.querySelectorAll('.hand-btn').forEach(b => b.classList.remove('locked', 'selected'));
  startTimerUI(15);
  window._iaTimerTimeout = setTimeout(() => {
    if (!myPick) pickVsIA(CHOICES[Math.floor(Math.random() * 3)]);
  }, 15000);
}

function pickVsIA(playerChoice) {
  clearTimerUI();
  if (window._iaTimerTimeout) { clearTimeout(window._iaTimerTimeout); window._iaTimerTimeout = null; }
  myPick = playerChoice;
  document.querySelectorAll('.hand-btn').forEach(b => {
    b.classList.add('locked');
    if (b.dataset.pick === playerChoice) b.classList.add('selected');
  });
  setTimeout(() => {
    const iaChoice = CHOICES[Math.floor(Math.random() * 3)];
    const r = beatsLocal(playerChoice, iaChoice);
    let winners = [];
    if (r === 1)       { playerScore++; winners = ['player']; }
    else if (r === -1) { iaScore++;     winners = ['ia'];     }
    window._players[0].score = playerScore;
    window._players[1].score = iaScore;
    renderScoreboard(window._players);
    const finished = iaRound >= iaTotalRounds;
    showRoundResult({
      picks: { player: playerChoice, ia: iaChoice },
      winners,
      players: window._players,
      currentRound: iaRound,
      nextRound: iaRound + 1,
      totalRounds: iaTotalRounds,
      finished
    });
    if (!finished) iaRound++;
  }, 600);
}

// ===================== HISTORIAL DE PARTIDAS (entre sesiones) =====================
function recordMatch(players, mode) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const top  = sorted[0];
  const tied = sorted.filter(p => p.score === top.score);
  matchHistory.unshift({
    date:    new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
    mode,
    players: sorted.map(p => ({ name: p.name, score: p.score })),
    winner:  tied.length > 1 ? 'Empate' : top.name
  });
  if (matchHistory.length > 50) matchHistory.pop();
}

function openHistory() {
  const modal = document.getElementById('history-modal');
  const body  = document.getElementById('hm-body');
  modal.classList.add('open');

  if (matchHistory.length === 0) {
    body.innerHTML = '<p class="hm-empty">Todavía no hay partidas registradas.</p>';
    return;
  }

  body.innerHTML = matchHistory.map((m, i) => `
    <div class="hm-row">
      <div class="hm-meta">
        <span class="hm-num">#${i + 1}</span>
        <span class="hm-mode">${m.mode === 'ia' ? '🤖 vs IA' : '🌐 Online'}</span>
        <span class="hm-date">${m.date}</span>
      </div>
      <div class="hm-scores">
        ${m.players.map(p => `<span class="hm-player">${p.name} <b>${p.score}</b></span>`).join('<span class="hm-vs">·</span>')}
      </div>
      <div class="hm-winner ${m.winner === 'Empate' ? 'draw' : 'win'}">
        ${m.winner === 'Empate' ? '🤝 Empate' : '🏆 ' + m.winner}
      </div>
    </div>
  `).join('');
}

function closeHistory() {
  document.getElementById('history-modal').classList.remove('open');
}

// ===================== END SCREEN =====================
function showEndScreen(players) {
  showScreen('s-end');
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const top    = sorted[0];
  const tied   = sorted.filter(p => p.score === top.score);
  const iWon   = tied.some(p => p.id === myId);

  document.getElementById('end-icon').textContent  = tied.length > 1 ? '🤝' : (iWon ? '🏆' : '😔');
  document.getElementById('champ-text').textContent = tied.length > 1
    ? `Empate entre ${tied.map(p => p.name).join(' y ')}`
    : `${top.name} es el campeón`;

  document.getElementById('final-scores').innerHTML = sorted.map((p, i) =>
    `<div class="final-row">
      <span class="final-medal">${MEDALLAS[i] || ''}</span>
      <span class="final-name">${p.name}${p.id === myId ? ' (tú)' : ''}</span>
      <span class="final-pts">${p.score} pts</span>
    </div>`
  ).join('');

  // Mostrar botones según modo
  document.getElementById('btn-replay-ia').style.display     = vsIA    ? '' : 'none';
  document.getElementById('btn-replay-online').style.display = !vsIA   ? '' : 'none';
}

// ===================== UTILS =====================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    // reset inline styles for welcome screen
    if (s.id === 's-welcome') {
      s.style.display = 'none';
      s.style.opacity = '';
      s.style.transform = '';
    }
  });
  const target = document.getElementById(id);
  target.classList.add('active');
  // welcome screen uses flex, others use block
  if (id === 's-welcome') target.style.display = 'flex';
  if (id === 's-lobby') {
    clearTimerUI();
    vsIA = false;
  }
}
