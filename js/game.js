const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const restartBtn = document.getElementById("restartBtn");
const startScreen = document.getElementById("startScreen");
const playerNameInput = document.getElementById("playerName");
const startBtn = document.getElementById("startBtn");

// Configuração do mundo e câmera
const WORLD = {
  width: 10000,  // Largura total do mundo do jogo
  height: 800,   // Altura total do mundo do jogo
  viewportX: 0,  // Posição X da câmera
  viewportY: 0,  // Posição Y da câmera
  followPlayer: true // Nova propriedade para controlar se a câmera segue o jogador
};

// Ajustar canvas para tela cheia
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let playerName = "";
let gameStarted = false;
const gravity = 0.3;
const jump = -6;
let score = 0;
let gameOver = false;
let frame = 0;
let pipes = [];
let socket = null;
let playerId = null;
let otherPlayers = {};
let gameState = null;  // Estado global do jogo recebido do servidor

const bird = {
  x: 50,
  y: 150,
  w: 20,
  h: 20,
  velocity: 0,
  worldX: 150, // Posição inicial fixa
  hasStarted: false,
  draw() {
    // Sempre desenhar o pássaro na mesma posição até o jogo começar
    const screenX = this.hasStarted ? (this.worldX - WORLD.viewportX) : 150;
    
    // Desenhar pássaro com gradiente
    const gradient = ctx.createRadialGradient(
      screenX + this.w/2, this.y + this.h/2, 0,
      screenX + this.w/2, this.y + this.h/2, this.w
    );
    gradient.addColorStop(0, "#ffd700");
    gradient.addColorStop(1, "#ffa500");
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(
      screenX + this.w/2,
      this.y + this.h/2,
      this.w/2,
      this.h/2,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    
    // Olho do pássaro
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(
      screenX + this.w * 0.7,
      this.y + this.h * 0.4,
      2,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Desenhar o nome do jogador
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(playerName, screenX + this.w/2, this.y - 10);

    // Desenhar mensagem de instrução se o jogo ainda não começou
    if (gameStarted && !this.hasStarted) {
      ctx.fillStyle = 'white';
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Clique para começar!', canvas.width / 2, canvas.height / 2);
    }
  },
  update() {
    if (gameStarted && !gameOver && this.hasStarted) {
      this.velocity += gravity;
      this.y += this.velocity;
      this.worldX += 2;
      
      // Atualizar a viewport para seguir o pássaro
      WORLD.viewportX = this.worldX - canvas.width / 3;
      
      if (this.y + this.h > canvas.height || this.y < 0) gameOver = true;
    }
  },
  flap() {
    if (gameStarted && !gameOver) {
      if (!this.hasStarted) {
        this.hasStarted = true;
      }
      this.velocity = jump;
    }
  },
  reset() {
    this.y = 150;
    this.worldX = 150; // Manter posição inicial consistente
    this.velocity = 0;
    this.hasStarted = false;
    WORLD.viewportX = 0;
  }
};

function drawPipes() {
  if (!gameStarted || !gameState) return;
  
  gameState.pipes.forEach(pipe => {
    // Não mover os canos até o jogo começar
    const screenX = bird.hasStarted ? pipe.x - WORLD.viewportX : pipe.x;
    
    // Só desenhar canos que estão visíveis na tela
    if (screenX > -pipe.width && screenX < canvas.width) {
      // Desenhar cano superior
      ctx.fillStyle = "#75c32c";
      ctx.fillRect(screenX, 0, pipe.width, pipe.top);
      
      // Borda do cano superior
      ctx.fillStyle = "#557821";
      ctx.fillRect(screenX - 2, pipe.top - 20, pipe.width + 4, 20);
      
      // Desenhar cano inferior
      ctx.fillStyle = "#75c32c";
      ctx.fillRect(screenX, pipe.top + pipe.gapHeight, pipe.width, canvas.height - (pipe.top + pipe.gapHeight));
      
      // Borda do cano inferior
      ctx.fillStyle = "#557821";
      ctx.fillRect(screenX - 2, pipe.top + pipe.gapHeight, pipe.width + 4, 20);

      // Se o cano já foi passado, desenhar uma pequena marca
      if (pipe.passed) {
        ctx.fillStyle = "#FFD700";
        ctx.fillRect(screenX + pipe.width - 5, pipe.top + pipe.gapHeight/2, 5, 5);
      }
    }
  });
}

function updatePipes() {
  // Não fazer nada até o jogo começar
  if (!gameStarted || gameOver || !bird.hasStarted) return;
  
  if (gameState && gameState.pipes) {
    gameState.pipes.forEach(pipe => {
      if (bird.hasStarted) {
        pipe.x -= 2; // Mover canos apenas quando o jogo começar
      }
      
      // Verificar colisão
      if (
        bird.worldX < pipe.x + pipe.width &&
        bird.worldX + bird.w > pipe.x &&
        (bird.y < pipe.top || bird.y + bird.h > pipe.top + pipe.gapHeight)
      ) {
        gameOver = true;
        // Enviar pontuação final
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'update',
            playerId,
            x: bird.worldX,
            y: bird.y,
            score: score,
            isDead: true
          }));
        }
        return;
      }
      
      // Verificar se passou completamente pelo cano
      if (!pipe.passed && bird.worldX > pipe.x + pipe.width) {
        pipe.passed = true;
        score = gameState.pipes.filter(p => p.passed).length; // Conta apenas canos passados
        
        // Enviar atualização para o servidor
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'update',
            playerId,
            x: bird.worldX,
            y: bird.y,
            score: score,
            isDead: gameOver
          }));
        }
      }
    });
  }
}

function drawScore() {
  if (!gameStarted) return;
  
  // Desenhar pontuação atual
  ctx.fillStyle = "white";
  ctx.font = "bold 36px Arial"; // Fonte maior e mais destacada
  ctx.textAlign = "center";
  ctx.fillText(score.toString(), canvas.width/2, 50); // Pontuação centralizada no topo

  // Desenhar ranking (top 3)
  if (gameState && gameState.topPlayers) {
    ctx.font = "16px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Top 3:", 10, 30);
    
    gameState.topPlayers.forEach((player, index) => {
      const rankColor = index === 0 ? "#FFD700" : // Ouro
                       index === 1 ? "#C0C0C0" : // Prata
                       "#CD7F32";                 // Bronze
      
      ctx.fillStyle = rankColor;
      ctx.fillText(`${index + 1}. ${player.name}: ${player.score}`, 10, 55 + (index * 25));
    });
  }
}

function drawOtherPlayers() {
  if (!gameStarted || !socket) return;
  
  for (const id in otherPlayers) {
    if (id !== playerId) {
      const player = otherPlayers[id];
      // Só desenhar jogadores que estão vivos
      if (player && player.worldX !== undefined && player.y !== undefined && !player.isDead) {
        // Converter coordenada do mundo para coordenada da tela
        const screenX = bird.hasStarted ? player.worldX - WORLD.viewportX : player.worldX;
        
        // Só desenhar jogadores visíveis na tela
        if (screenX > -20 && screenX < canvas.width) {
          // Desenhar pássaro do outro jogador
          const gradient = ctx.createRadialGradient(
            screenX + bird.w/2, player.y + bird.h/2, 0,
            screenX + bird.w/2, player.y + bird.h/2, bird.w
          );
          gradient.addColorStop(0, "#4169E1"); // Azul royal
          gradient.addColorStop(1, "#1E90FF"); // Azul dodger
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.ellipse(
            screenX + bird.w/2,
            player.y + bird.h/2,
            bird.w/2,
            bird.h/2,
            0,
            0,
            Math.PI * 2
          );
          ctx.fill();
          
          // Olho do pássaro
          ctx.fillStyle = "black";
          ctx.beginPath();
          ctx.arc(
            screenX + bird.w * 0.7,
            player.y + bird.h * 0.4,
            2,
            0,
            Math.PI * 2
          );
          ctx.fill();
          
          // Desenhar nome do jogador
          if (player.name) {
            ctx.fillStyle = 'white';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(player.name, screenX + bird.w / 2, player.y - 10);
          }
        }
      }
    }
  }
}

function sendPlayerUpdate() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'update',
      playerId,
      x: bird.worldX,
      y: bird.y,
      score: score,
      name: playerName,
      isDead: gameOver
    }));
  }
}

function startGame() {
  const name = playerNameInput.value.trim();
  if (!name) {
    alert("Por favor, insira um nome para começar o jogo.");
    return;
  }

  playerName = name;
  gameStarted = true;
  gameOver = false;
  score = 0; // Resetar pontuação
  startScreen.style.display = "none";
  canvas.style.display = "block";
  bird.worldX = 150;
  WORLD.viewportX = 0;

  // Usar a URL do WebSocket do ambiente ou fallback para localhost
  const url = window.location.hostname;
  const wsUrl = `ws://${url}:8080`;
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('Conectado ao servidor');
    socket.send(JSON.stringify({
      type: 'init',
      name: playerName,
      x: bird.worldX,
      y: bird.y,
      score: score,
      isDead: gameOver
    }));
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'init') {
      playerId = data.playerId;
      otherPlayers = data.players;
      gameState = data.gameState;
    } else if (data.type === 'state') {
      otherPlayers = data.players;
      gameState = data.gameState;
    }
  };

  loop();
}

function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (gameOver) {
    ctx.fillStyle = 'red';
    ctx.font = '30px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2);
    
    // Mostrar pontuação final
    ctx.font = '20px Arial';
    ctx.fillText(`Pontuação: ${score}`, canvas.width / 2, canvas.height / 2 + 40);
    
    restartBtn.style.display = 'inline-block';
    return;
  }

  bird.update();
  bird.draw();
  updatePipes();
  drawPipes();
  drawScore();
  drawOtherPlayers();
  
  if (gameStarted && socket && playerId) {
    sendPlayerUpdate();
  }

  frame++;
  requestAnimationFrame(loop);
}

function handleInput() {
  bird.flap();
}

function restartGame() {
  score = 0; // Resetar pontuação
  gameOver = false;
  frame = 0;
  pipes = [];
  bird.reset();
  restartBtn.style.display = "none";
  
  // Resetar estado dos canos
  if (gameState && gameState.pipes) {
    gameState.pipes.forEach(pipe => {
      pipe.passed = false;
    });
  }
  
  loop();
}

document.addEventListener("keydown", (e) => {
  if (e.code === "Space") handleInput();
});

canvas.addEventListener("click", handleInput);