const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const CHOICES = ['piedra', 'papel', 'tijera'];
const TURN_SECONDS = 15;

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function beats(a, b) {
  if (a === b) return 0;
  if (
    (a === 'piedra' && b === 'tijera') ||
    (a === 'tijera' && b === 'papel') ||
    (a === 'papel'  && b === 'piedra')
  ) return 1;
  return -1;
}

// FIX: lógica correcta para 3+ jugadores
// Si todos eligieron lo mismo → empate total (0 ganadores)
// Si los 3 valores distintos están presentes → empate total
// Si sólo 2 valores distintos → el que le gana al otro es el ganador
function resolveRound(room) {
  const players = room.players;
  const picks = room.picks;
  let winners = [];

  const vals = players.map(p => picks[p.id]);
  const unique = [...new Set(vals)];

  if (unique.length === 1) {
    // Todos igual → empate
    winners = [];
  } else if (unique.length === 3) {
    // Los 3 valores presentes → empate caótico
    winners = [];
  } else {
    // Exactamente 2 valores → uno gana al otro
    const [a, b] = unique;
    const winner = beats(a, b) === 1 ? a : b;
    winners = players.filter(p => picks[p.id] === winner);
  }

  winners.forEach(p => { p.score++; });
  room.currentRound++;
  room.picks = {};
  room.roundDone = true;

  // Cancelar temporizador si aún corre
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }

  return {
    picks: Object.fromEntries(players.map(p => [p.id, picks[p.id]])),
    winners: winners.map(p => p.id),
    scores: Object.fromEntries(players.map(p => [p.id, p.score])),
    finished: room.currentRound > room.totalRounds
  };
}

function startRoundTimer(code) {
  const room = rooms[code];
  if (!room) return;

  // Limpiar timer anterior si existe
  if (room.timer) clearTimeout(room.timer);

  // Avisar a los clientes cuántos segundos tienen
  io.to(code).emit('timer_start', { seconds: TURN_SECONDS });

  room.timer = setTimeout(() => {
    if (!rooms[code]) return;
    // Auto-pick aleatorio para quienes no eligieron
    room.players.forEach(p => {
      if (!room.picks[p.id]) {
        room.picks[p.id] = CHOICES[Math.floor(Math.random() * 3)];
      }
    });
    const result = resolveRound(room);
    io.to(code).emit('round_result', {
      ...result,
      currentRound: room.currentRound - 1,
      nextRound: room.currentRound,
      totalRounds: room.totalRounds,
      players: room.players,
      timedOut: true
    });
    if (!result.finished) {
      room.roundDone = false;
    } else {
      io.to(code).emit('game_over', { players: room.players });
      delete rooms[code];
    }
  }, TURN_SECONDS * 1000);
}

io.on('connection', (socket) => {

  // Crear sala
  socket.on('create_room', ({ name, totalRounds, maxPlayers }) => {
    const code = generateCode();
    rooms[code] = {
      code,
      totalRounds: totalRounds || 5,
      maxPlayers: maxPlayers || 2,
      currentRound: 1,
      players: [],
      picks: {},
      roundDone: false,
      started: false,
      timer: null
    };
    socket.join(code);
    rooms[code].players.push({ id: socket.id, name, score: 0 });
    socket.emit('room_created', { code, playerId: socket.id });
    socket.emit('room_update', { players: rooms[code].players, started: false });
  });

  // Unirse a sala
  socket.on('join_room', ({ code, name }) => {
    const room = rooms[code.toUpperCase()];
    if (!room) return socket.emit('error', 'Sala no encontrada.');
    if (room.started) return socket.emit('error', 'La partida ya comenzó.');
    if (room.players.length >= room.maxPlayers) return socket.emit('error', 'Sala llena.');

    socket.join(room.code);
    room.players.push({ id: socket.id, name, score: 0 });
    socket.emit('room_joined', { code: room.code, playerId: socket.id });
    io.to(room.code).emit('room_update', { players: room.players, started: false });

    if (room.players.length === room.maxPlayers) {
      room.started = true;
      io.to(room.code).emit('game_start', {
        players: room.players,
        totalRounds: room.totalRounds,
        currentRound: room.currentRound
      });
      startRoundTimer(room.code);
    }
  });

  // Jugador elige mano
  socket.on('pick', ({ code, choice }) => {
    const room = rooms[code];
    if (!room || room.roundDone) return;
    if (room.picks[socket.id]) return;
    if (!CHOICES.includes(choice)) return;

    room.picks[socket.id] = choice;

    io.to(code).emit('pick_update', {
      pickedCount: Object.keys(room.picks).length,
      totalPlayers: room.players.length
    });

    if (Object.keys(room.picks).length === room.players.length) {
      const result = resolveRound(room);
      io.to(code).emit('round_result', {
        ...result,
        currentRound: room.currentRound - 1,
        nextRound: room.currentRound,
        totalRounds: room.totalRounds,
        players: room.players,
        timedOut: false
      });

      if (!result.finished) {
        room.roundDone = false;
      } else {
        io.to(code).emit('game_over', { players: room.players });
        delete rooms[code];
      }
    }
  });

  // Siguiente ronda
  socket.on('ready_next', ({ code }) => {
    const room = rooms[code];
    if (!room) return;
    // Solo empezar timer cuando el primer jugador confirma avanzar
    if (room.roundDone) {
      room.roundDone = false;
      startRoundTimer(code);
    }
  });

  // Desconexión
  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        if (room.timer) clearTimeout(room.timer);
        room.players.splice(idx, 1);
        if (room.players.length === 0) {
          delete rooms[code];
        } else {
          io.to(code).emit('player_left', { players: room.players });
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
