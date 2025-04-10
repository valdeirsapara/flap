const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8080 });

// Configurações do jogo
const GAME_CONFIG = {
  PIPE_SPACING: 200, // Reduzido de 300 para 200 para canos mais próximos
  PIPE_WIDTH: 50,    // Largura dos canos
  GAP_HEIGHT: 150,   // Altura do espaço entre os canos
  MIN_PIPE_HEIGHT: 50, // Altura mínima do cano
  WORLD_SPEED: 2,    // Velocidade do mundo
  INITIAL_PIPES: 10,  // Número inicial de canos
  MAX_PIPE_HEIGHT: 400, // Altura máxima do cano
  DIFFICULTY_INCREASE: 0.1, // Aumento de dificuldade por cano
  MIN_GAP_HEIGHT: 100, // Altura mínima do espaço entre canos
  MAX_GAP_HEIGHT: 200  // Altura máxima do espaço entre canos
};

let players = {};
let gameState = {
  pipes: [],
  lastPipeX: 300 // Posição X do último cano - mais próximo do início
};

// Gerar canos iniciais
function generateInitialPipes() {
  gameState.pipes = []; // Limpar canos existentes
  gameState.lastPipeX = 300; // Resetar posição inicial
  
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
  
  // Aumentar dificuldade com base no número de canos gerados
  const difficulty = Math.min(1, gameState.pipes.length * GAME_CONFIG.DIFFICULTY_INCREASE);
  
  // Calcular altura do gap com base na dificuldade
  const gapHeight = Math.max(
    GAME_CONFIG.MIN_GAP_HEIGHT,
    GAME_CONFIG.MAX_GAP_HEIGHT - (difficulty * (GAME_CONFIG.MAX_GAP_HEIGHT - GAME_CONFIG.MIN_GAP_HEIGHT))
  );
  
  // Calcular altura do cano superior com base na dificuldade
  const maxTop = GAME_CONFIG.MAX_PIPE_HEIGHT - gapHeight - GAME_CONFIG.MIN_PIPE_HEIGHT;
  const pipeTop = Math.floor(
    Math.random() * (maxTop - GAME_CONFIG.MIN_PIPE_HEIGHT) + GAME_CONFIG.MIN_PIPE_HEIGHT
  );
  
  gameState.pipes.push({
    x: pipeX,
    top: pipeTop,
    width: GAME_CONFIG.PIPE_WIDTH,
    gapHeight: gapHeight,
    passed: false,
    difficulty: difficulty // Adicionar informação de dificuldade para efeitos visuais
  });
  
  gameState.lastPipeX = pipeX;
}

// Atualizar estado do jogo
function updateGameState() {
  // Não fazer nada - os canos serão atualizados pelo cliente
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