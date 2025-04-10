const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8080 });

// Configurações do jogo
const GAME_CONFIG = {
  PIPE_SPACING: 300, // Espaço entre os canos
  PIPE_WIDTH: 50,    // Largura dos canos
  GAP_HEIGHT: 150,   // Altura do espaço entre os canos
  MIN_PIPE_HEIGHT: 50, // Altura mínima do cano
  WORLD_SPEED: 2,    // Velocidade do mundo
  INITIAL_PIPES: 10  // Número inicial de canos
};

let players = {};
let gameState = {
  pipes: [],
  lastPipeX: 800 // Posição X do último cano
};

// Gerar canos iniciais
function generateInitialPipes() {
  for (let i = 0; i < GAME_CONFIG.INITIAL_PIPES; i++) {
    const pipeX = gameState.lastPipeX + GAME_CONFIG.PIPE_SPACING;
    const pipeTop = Math.floor(Math.random() * (400 - GAME_CONFIG.MIN_PIPE_HEIGHT * 2 - GAME_CONFIG.GAP_HEIGHT) + GAME_CONFIG.MIN_PIPE_HEIGHT);
    
    gameState.pipes.push({
      x: pipeX,
      top: pipeTop,
      width: GAME_CONFIG.PIPE_WIDTH,
      gapHeight: GAME_CONFIG.GAP_HEIGHT,
      passed: false
    });
    
    gameState.lastPipeX = pipeX;
  }
}

// Gerar um novo cano
function generateNewPipe() {
  const pipeX = gameState.lastPipeX + GAME_CONFIG.PIPE_SPACING;
  const pipeTop = Math.floor(Math.random() * (400 - GAME_CONFIG.MIN_PIPE_HEIGHT * 2 - GAME_CONFIG.GAP_HEIGHT) + GAME_CONFIG.MIN_PIPE_HEIGHT);
  
  gameState.pipes.push({
    x: pipeX,
    top: pipeTop,
    width: GAME_CONFIG.PIPE_WIDTH,
    gapHeight: GAME_CONFIG.GAP_HEIGHT,
    passed: false
  });
  
  gameState.lastPipeX = pipeX;
}

// Atualizar estado do jogo
function updateGameState() {
  // Mover canos
  gameState.pipes.forEach(pipe => {
    pipe.x -= GAME_CONFIG.WORLD_SPEED;
  });
  
  // Remover canos que já passaram
  gameState.pipes = gameState.pipes.filter(pipe => pipe.x > -GAME_CONFIG.PIPE_WIDTH);
  
  // Adicionar novos canos se necessário
  if (gameState.pipes.length < GAME_CONFIG.INITIAL_PIPES) {
    generateNewPipe();
  }
}

// Gerar canos iniciais
generateInitialPipes();

// Atualizar estado do jogo a cada 16ms (aproximadamente 60 FPS)
setInterval(updateGameState, 16);

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
        score: data.score,
        isDead: data.isDead || false
      };

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

        // Se o jogador morreu, atualizar seu estado
        if (data.isDead) {
          players[playerId].isDead = true;
        }
      }

      broadcast(
        JSON.stringify({
          type: 'state',
          players,
          gameState
        })
      );
    }
  });

  socket.on('close', () => {
    console.log(`Jogador ${playerId} desconectado.`);
    delete players[playerId];

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