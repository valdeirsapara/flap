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
  RENDER_DISTANCE: 1000 // Distância de renderização à frente do jogador
};

let players = {};
let gameState = {
  pipes: [],
  lastPipeX: 300,
  maxPipeId: 0,
  topPlayers: [] // Array para armazenar top jogadores
};

// Função para atualizar o ranking
function updateTopPlayers() {
  const playerArray = Object.entries(players).map(([id, player]) => ({
    id,
    name: player.name,
    score: player.score
  }));

  // Ordenar por pontuação (maior para menor)
  playerArray.sort((a, b) => b.score - a.score);

  // Pegar os top 3
  gameState.topPlayers = playerArray.slice(0, 3);
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
  gameState.pipes = gameState.pipes.filter(pipe => pipe.x > -GAME_CONFIG.PIPE_WIDTH);
}

// Gerar canos iniciais
generateInitialPipes();

server.on('connection', (socket) => {
  console.log('Novo jogador conectado.');
  let playerId = null;

  socket.on('message', (message) => {
    const data = JSON.parse(message);

    if (data.type === 'init') {
      playerId = `player_${Math.random().toString(36).substr(2, 9)}`;
      players[playerId] = {
        name: data.name,
        worldX: data.x,
        y: data.y,
        score: 0,
        isDead: data.isDead || false,
        bestScore: 0 // Adicionar melhor pontuação
      };

      updateTopPlayers();

      socket.send(
        JSON.stringify({
          type: 'init',
          playerId,
          players,
          gameState
        })
      );

      broadcast(
        JSON.stringify({
          type: 'state',
          players,
          gameState
        })
      );
    } else if (data.type === 'update') {
      if (players[playerId]) {
        players[playerId].worldX = data.x;
        players[playerId].y = data.y;
        players[playerId].score = data.score;
        players[playerId].isDead = data.isDead;

        // Atualizar melhor pontuação se necessário
        if (data.score > players[playerId].bestScore) {
          players[playerId].bestScore = data.score;
        }

        // Gerar novos canos se necessário
        const playerX = data.x;
        const lastPipeX = gameState.lastPipeX;
        
        if (playerX > lastPipeX - GAME_CONFIG.RENDER_DISTANCE) {
          generateNewPipe();
        }

        updateGameState();
        updateTopPlayers();

        broadcast(
          JSON.stringify({
            type: 'state',
            players,
            gameState
          })
        );
      }
    }
  });

  socket.on('close', () => {
    console.log(`Jogador ${playerId} desconectado.`);
    delete players[playerId];
    updateTopPlayers();

    broadcast(
      JSON.stringify({
        type: 'state',
        players,
        gameState
      })
    );
  });
});

function broadcast(message) {
  server.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

console.log('Servidor WebSocket rodando na porta 8080.');