const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8080 });

// Configurações do jogo
const GAME_CONFIG = {
  PIPE_SPACING: 200,    // Espaço entre os canos
  PIPE_WIDTH: 50,       // Largura dos canos
  GAP_HEIGHT: 150,      // Altura do espaço entre os canos
  MIN_PIPE_HEIGHT: 50,  // Altura mínima do cano
  WORLD_SPEED: 2,       // Velocidade do mundo
  INITIAL_PIPES: 5,     // Número inicial de canos
  MAX_PIPE_HEIGHT: 400, // Altura máxima do cano
  MIN_GAP_HEIGHT: 100,  // Altura mínima do espaço entre canos
  MAX_GAP_HEIGHT: 200,  // Altura máxima do espaço entre canos
  RENDER_DISTANCE: 1000, // Distância de renderização à frente do jogador
  UPDATE_RATE: 30       // Taxa de atualização do servidor (ms)
};

let players = {};
let gameState = {
  pipes: [],
  lastPipeX: 300,
  maxPipeId: 0
};

// Cache para armazenar o último estado enviado para cada jogador
const playerStates = new Map();

// Sistema de ranking
const MAX_TOP_PLAYERS = 10;
let topPlayers = [];

function updateTopPlayers(playerId, score, name) {
  // Remover jogador se já existir no ranking
  topPlayers = topPlayers.filter(p => p.id !== playerId);
  
  // Adicionar nova pontuação
  topPlayers.push({
    id: playerId,
    name: name,
    score: score,
    timestamp: Date.now()
  });
  
  // Ordenar por pontuação (maior primeiro) e limitar ao máximo
  topPlayers.sort((a, b) => b.score - a.score);
  topPlayers = topPlayers.slice(0, MAX_TOP_PLAYERS);
}

// Função para limpar jogadores inativos
function cleanupInactivePlayers() {
  const now = Date.now();
  Object.keys(players).forEach(id => {
    const lastUpdate = playerStates.get(id)?.lastUpdate || 0;
    if (now - lastUpdate > 10000) { // 10 segundos sem atualização
      console.log(`Removendo jogador inativo: ${id}`);
      delete players[id];
      playerStates.delete(id);
    }
  });
}

// Limpar jogadores inativos a cada 30 segundos
setInterval(cleanupInactivePlayers, 30000);

// Função otimizada para broadcast
function broadcast(message, excludeId = null) {
  const data = JSON.stringify(message);
  server.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.playerId !== excludeId) {
      client.send(data);
    }
  });
}

// Gerar um novo cano
function generateNewPipe() {
  const pipeX = gameState.lastPipeX + GAME_CONFIG.PIPE_SPACING;
  const pipeTop = Math.floor(Math.random() * (400 - GAME_CONFIG.MIN_PIPE_HEIGHT * 2 - GAME_CONFIG.GAP_HEIGHT) + GAME_CONFIG.MIN_PIPE_HEIGHT);
  
  gameState.pipes.push({
    id: gameState.maxPipeId++,
    x: pipeX,
    top: pipeTop,
    width: GAME_CONFIG.PIPE_WIDTH,
    gapHeight: GAME_CONFIG.GAP_HEIGHT,
    passed: false
  });
  
  gameState.lastPipeX = pipeX;
}

// Gerar canos iniciais
function generateInitialPipes() {
  gameState.pipes = [];
  gameState.lastPipeX = 300;
  gameState.maxPipeId = 0;
  
  for (let i = 0; i < GAME_CONFIG.INITIAL_PIPES; i++) {
    generateNewPipe();
  }
}

// Atualizar estado do jogo
function updateGameState() {
  // Remover canos que já passaram
  const minX = Math.min(...Object.values(players).map(p => p.worldX)) - 1000;
  gameState.pipes = gameState.pipes.filter(pipe => pipe.x > minX);
}

// Gerar canos iniciais
generateInitialPipes();

// Função para criar estado otimizado para envio
function createOptimizedState(playerId) {
  const player = players[playerId];
  if (!player) return null;

  // Filtrar apenas os canos próximos ao jogador
  const relevantPipes = gameState.pipes.filter(pipe => 
    Math.abs(pipe.x - player.worldX) < GAME_CONFIG.RENDER_DISTANCE
  );

  // Filtrar apenas jogadores próximos
  const nearbyPlayers = {};
  Object.entries(players).forEach(([id, p]) => {
    if (id !== playerId && Math.abs(p.worldX - player.worldX) < GAME_CONFIG.RENDER_DISTANCE) {
      nearbyPlayers[id] = p;
    }
  });

  return {
    type: 'state',
    players: nearbyPlayers,
    gameState: {
      ...gameState,
      pipes: relevantPipes
    },
    topPlayers
  };
}

server.on('connection', (socket) => {
  console.log('Novo jogador conectado.');
  let playerId = null;

  socket.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'init') {
        playerId = `player_${Math.random().toString(36).substr(2, 9)}`;
        socket.playerId = playerId; // Armazenar ID no socket
        players[playerId] = {
          name: data.name,
          worldX: data.x,
          y: data.y,
          score: 0,
          isDead: false
        };

        playerStates.set(playerId, {
          lastUpdate: Date.now()
        });

        socket.send(JSON.stringify({
          type: 'init',
          playerId,
          players,
          gameState
        }));

      } else if (data.type === 'update' && playerId && players[playerId]) {
        players[playerId].worldX = data.x;
        players[playerId].y = data.y;
        players[playerId].score = data.score;
        players[playerId].isDead = data.isDead;

        playerStates.set(playerId, {
          lastUpdate: Date.now()
        });

        // Gerar novos canos se necessário
        if (data.x > gameState.lastPipeX - GAME_CONFIG.RENDER_DISTANCE) {
          generateNewPipe();
        }

        updateGameState();

        // Atualizar ranking quando houver mudança na pontuação
        if (data.score !== undefined) {
          updateTopPlayers(playerId, data.score, players[playerId].name);
        }

        // Enviar estado otimizado para cada jogador
        const optimizedState = createOptimizedState(playerId);
        if (optimizedState) {
          broadcast(optimizedState, playerId);
        }
      }
    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
    }
  });

  socket.on('close', () => {
    if (playerId) {
      console.log(`Jogador ${playerId} desconectado.`);
      delete players[playerId];
      playerStates.delete(playerId);
      broadcast({ type: 'state', players, gameState });
    }
  });

  socket.on('error', (error) => {
    console.error('Erro no WebSocket:', error);
  });
});

// Enviar atualizações em intervalos regulares
setInterval(() => {
  Object.keys(players).forEach(playerId => {
    const optimizedState = createOptimizedState(playerId);
    if (optimizedState) {
      const client = Array.from(server.clients).find(c => c.playerId === playerId);
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(optimizedState));
      }
    }
  });
}, GAME_CONFIG.UPDATE_RATE);

console.log('Servidor WebSocket rodando na porta 8080.');