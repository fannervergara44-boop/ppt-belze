const OPCIONES = ['piedra', 'papel', 'tijera'];
const EMOJIS = { piedra: '✊', papel: '✋', tijera: '✌️' };
const MEDALLAS = ['🥇', '🥈', '🥉'];

let selectedMode = '1v1ai';
let selectedRounds = 5;
let state = {};

// --- SETUP UI ---
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMode = btn.dataset.mode;
    document.getElementById('p2-block').style.display = selectedMode === '1v1ai' ? 'none' : '';
    document.getElementById('p3-block').style.display = selectedMode === '1v1v1' ? '' : 'none';
  });
});

document.querySelectorAll('.round-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.round-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRounds = parseInt(btn.dataset.r);
  });
});

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', () => showScreen('s-setup'));

// --- GAME LOGIC ---
function beats(a, b) {
  if (a === b) return 0;
  if ((a==='piedra'&&b==='tijera')||(a==='tijera'&&b==='papel')||(a==='papel'&&b==='piedra')) return 1;
  return -1;
}

function aiPick() {
  return OPCIONES[Math.floor(Math.random() * 3)];
}

function startGame() {
  const p1 = document.getElementById('p1name').value.trim() || 'Jugador 1';
  const p2 = selectedMode === '1v1ai' ? 'IA 🤖' : (document.getElementById('p2name').value.trim() || 'Jugador 2');
  const p3 = selectedMode === '1v1v1' ? (document.getElementById('p3name').value.trim() || 'Jugador 3') : null;

  const players = [
    { name: p1, score: 0, isAI: false },
    { name: p2, score: 0, isAI: selectedMode === '1v1ai' },
  ];
  if (p3) players.push({ name: p3, score: 0, isAI: false });

  state = {
    players,
    totalRounds: selectedRounds,
    currentRound: 1,
    picks: {},
    turnIndex: 0,
    history: [],
    roundDone: false
  };

  showScreen('s-game');
  renderGame();
}

function renderGame() {
  // Round badge
  document.getElementById('round-badge').textContent = `Ronda ${state.currentRound} / ${state.totalRounds}`;

  // Scoreboard
  const sb = document.getElementById('scoreboard');
  sb.innerHTML = state.players.map(p =>
    `<div class="score-row"><span class="score-name">${p.name}</span><span class="score-pts">${p.score}</span></div>`
  ).join('');

  // Reset hands
  document.querySelectorAll('.hand-btn').forEach(b => b.classList.remove('locked', 'selected'));
  document.getElementById('result-panel').style.display = 'none';
  state.picks = {};
  state.roundDone = false;
  state.turnIndex = 0;

  renderTurn();
}

function humanPlayers() {
  return state.players.filter(p => !p.isAI);
}

function renderTurn() {
  const humans = humanPlayers();
  const turnBanner = document.getElementById('turn-banner');
  const secretMsg = document.getElementById('secret-msg');

  if (humans.length <= 1) {
    turnBanner.style.display = 'none';
    secretMsg.style.display = 'none';
    return;
  }

  const current = humans[state.turnIndex];
  turnBanner.textContent = `Turno de ${current.name} — elige tu mano`;
  turnBanner.style.display = '';

  if (state.turnIndex > 0) {
    const prev = humans.slice(0, state.turnIndex).map(p => p.name).join(', ');
    secretMsg.textContent = `${prev} ya eligió${state.turnIndex > 1 ? 'eron' : ''} en secreto`;
    secretMsg.style.display = '';
  } else {
    secretMsg.style.display = 'none';
  }
}

document.querySelectorAll('.hand-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (state.roundDone) return;
    const choice = btn.dataset.pick;
    const humans = humanPlayers();

    if (humans.length <= 1) {
      state.picks[state.players[0].name] = choice;
      btn.classList.add('selected');
      setTimeout(resolveRound, 300);
      return;
    }

    const current = humans[state.turnIndex];
    state.picks[current.name] = choice;
    btn.classList.add('selected');
    document.querySelectorAll('.hand-btn').forEach(b => b.classList.add('locked'));

    setTimeout(() => {
      document.querySelectorAll('.hand-btn').forEach(b => b.classList.remove('locked', 'selected'));
      state.turnIndex++;
      if (state.turnIndex >= humans.length) {
        resolveRound();
      } else {
        renderTurn();
      }
    }, 600);
  });
});

function resolveRound() {
  state.roundDone = true;
  document.getElementById('turn-banner').style.display = 'none';
  document.getElementById('secret-msg').style.display = 'none';
  document.querySelectorAll('.hand-btn').forEach(b => b.classList.add('locked'));

  // AI picks
  state.players.filter(p => p.isAI).forEach(p => { state.picks[p.name] = aiPick(); });

  const { players, picks } = state;
  let winners = [];

  if (players.length === 2) {
    const r = beats(picks[players[0].name], picks[players[1].name]);
    if (r === 1) winners = [players[0]];
    else if (r === -1) winners = [players[1]];
  } else {
    const vals = players.map(p => picks[p.name]);
    const unique = [...new Set(vals)];
    if (unique.length !== 1 && unique.length !== 3) {
      const winning = unique.find(v => unique.some(u => beats(v, u) === 1));
      if (winning) winners = players.filter(p => picks[p.name] === winning);
    }
  }

  winners.forEach(p => { p.score++; });

  // Update scoreboard
  const sb = document.getElementById('scoreboard');
  sb.innerHTML = players.map(p =>
    `<div class="score-row"><span class="score-name">${p.name}</span><span class="score-pts ${winners.includes(p) ? 'pop' : ''}">${p.score}</span></div>`
  ).join('');

  // Reveal panel
  const revealHTML = players.map(p =>
    `<div class="reveal-item">
      <div class="reveal-emoji">${EMOJIS[picks[p.name]]}</div>
      <div class="reveal-name">${p.name}</div>
      <div class="reveal-choice">${picks[p.name].charAt(0).toUpperCase() + picks[p.name].slice(1)}</div>
    </div>`
  ).join('');

  const msgEl = document.getElementById('result-msg');
  let resultText, resultClass;
  if (winners.length) {
    resultText = '🏆 ' + winners.map(p => p.name).join(' & ') + ' gana' + (winners.length > 1 ? 'n' : '') + '!';
    resultClass = 'win';
  } else {
    resultText = '🤝 Empate';
    resultClass = 'draw';
  }
  msgEl.textContent = resultText;
  msgEl.className = 'result-msg ' + resultClass;
  document.getElementById('reveal-row').innerHTML = revealHTML;

  const nextBtn = document.getElementById('btn-next');
  if (state.currentRound < state.totalRounds) {
    nextBtn.textContent = 'Siguiente ronda →';
    nextBtn.onclick = nextRound;
  } else {
    nextBtn.textContent = 'Ver resultados finales →';
    nextBtn.onclick = endGame;
  }

  document.getElementById('result-panel').style.display = '';

  // History
  const histEl = document.getElementById('history-list');
  if (histEl.querySelector('.empty-hist')) histEl.innerHTML = '';
  const item = document.createElement('div');
  item.className = 'hist-item';
  const left = players.map(p => `${p.name} ${EMOJIS[picks[p.name]]}`).join(' vs ');
  item.innerHTML = `<span>${left}</span><span class="hist-res ${resultClass}">${resultText}</span>`;
  histEl.prepend(item);

  state.history.push({ round: state.currentRound, text: resultText, class: resultClass, picks });
}

function nextRound() {
  state.currentRound++;
  renderGame();
}

function endGame() {
  showScreen('s-end');

  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const tied = sorted.filter(p => p.score === top.score);

  document.getElementById('end-icon').textContent = tied.length > 1 ? '🤝' : '🏆';
  document.getElementById('champ-text').textContent = tied.length > 1
    ? `Empate entre ${tied.map(p => p.name).join(' y ')}`
    : `${top.name} es el campeón`;

  document.getElementById('final-scores').innerHTML = sorted.map((p, i) =>
    `<div class="final-row">
      <span class="final-medal">${MEDALLAS[i] || ''}</span>
      <span class="final-name">${p.name}</span>
      <span class="final-pts">${p.score} pts</span>
    </div>`
  ).join('');

  const endHist = document.getElementById('end-history');
  endHist.innerHTML = `<div class="history-title">Historial completo</div>` +
    state.history.map(h =>
      `<div class="hist-item">
        <span>Ronda ${h.round}</span>
        <span class="hist-res ${h.class}">${h.text}</span>
      </div>`
    ).join('');
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
