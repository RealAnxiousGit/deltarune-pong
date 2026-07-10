const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const PADDLE_WIDTH = 12;
const SOUL_SIZE = 20;
const BASE_SPEED = 4;
const SPEED_MULTIPLIER = 1.08;
const WIN_SCORE = 7;
const WIN_RETURN_DELAY = 4000;

const PADDLE_MAX_SPEED = 13;
const PADDLE_ACCEL = 2.2;
const PADDLE_FRICTION = 0.94;

const SCREENS = { MENU: "menu", PLAYING: "playing", SETTINGS: "settings" };

const STAGE_SIZES = {
  stretch: { id: "stretch", name: "Stretch", className: "stage-stretch" },
  fit: { id: "fit", name: "Fit", className: "stage-fit" }
};

const keys = {};

const defaultSettings = {
  sfxVolume: 0.7,
  musicVolume: 0.5,
  stageSize: "fit",
  sensitivity: 65,
  difficulty: "normal",
  mobileSupport: false,
};

let settings = { ...defaultSettings };
try {
  const saved = localStorage.getItem("deltarunePongSettings");
  if (saved) settings = { ...settings, ...JSON.parse(saved) };
} catch (e) {}

function saveSettings() {
  localStorage.setItem("deltarunePongSettings", JSON.stringify(settings));
}

let screenBeforeSettings = SCREENS.MENU;

const assets = {
  soul: new Image(),
  soulProcessed: null,
  loaded: 0,
  total: 1,
};

assets.soul.src = "SOUL.png";

function processSoulImage(img) {
  const off = document.createElement("canvas");
  off.width = img.width;
  off.height = img.height;
  const offCtx = off.getContext("2d");
  offCtx.drawImage(img, 0, 0);
  const imageData = offCtx.getImageData(0, 0, off.width, off.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 40 && data[i + 1] < 40 && data[i + 2] < 40) {
      data[i + 3] = 0;
    }
  }
  offCtx.putImageData(imageData, 0, 0);
  return off;
}

assets.soul.onload = () => {
  assets.loaded++;
  if (assets.loaded >= assets.total) {
    assets.soulProcessed = processSoulImage(assets.soul);
  }
};

const state = {
  screen: SCREENS.MENU,
  mode: null,
  player1: { y: HEIGHT / 2 - 45, vy: 0, score: 0, height: 90 },
  player2: { y: HEIGHT / 2 - 45, vy: 0, score: 0, height: 90 },
  ball: { x: WIDTH / 2, y: HEIGHT / 2, vx: BASE_SPEED, vy: BASE_SPEED * 0.75, speed: BASE_SPEED },
  paused: false,
  gameOverPlayed: false,
  winnerText: "",
  winTimeout: null,
};

const DB_NAME = "DeltarunePongAudioDB";
const STORE_NAME = "customAudio";

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject();
  });
}

async function saveCustomAudio(file) {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(file, "musicFile");
  } catch (e) {}
}

async function loadCustomAudio() {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get("musicFile");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

async function clearCustomAudio() {
  try {
    const db = await initDB();
    db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete("musicFile");
  } catch (e) {}
}

const audio = {
  muted: false,
  music: new Audio("battle.mp3"),
  bump: new Audio("snd_bump.wav"),
  bell: new Audio("snd_bell.wav"),
  won: new Audio("snd_won.wav"),
  menuMove: new Audio("snd_menumove.wav"),
  select: new Audio("snd_select.wav"),
  intro: new Audio("AUDIO_INTRONOISE.ogg"),
  customUrl: null,

  init() {
    this.music.loop = true;
    this.updateVolumes();
    this.loadPersistedMusic();
  },
  
  async loadPersistedMusic() {
    const file = await loadCustomAudio();
    if (file) {
      this.setCustomMusic(file);
    }
  },

  setCustomMusic(file) {
    if (this.customUrl) URL.revokeObjectURL(this.customUrl);
    this.customUrl = URL.createObjectURL(file);
    
    const wasPlaying = !this.music.paused;
    this.music.src = this.customUrl;
    this.music.loop = true;
    
    if (wasPlaying && !this.muted) {
      this.music.play().catch(()=>{});
    }
  },

  resetToDefaultMusic() {
    if (this.customUrl) {
      URL.revokeObjectURL(this.customUrl);
      this.customUrl = null;
    }
    const wasPlaying = !this.music.paused;
    this.music.src = "battle.mp3";
    clearCustomAudio();
    
    if (wasPlaying && !this.muted) {
      this.music.play().catch(()=>{});
    }
  },

  setupInteractionFallback() {
    const onFirstInteraction = () => {
      if (!this.muted && this.music.paused) {
        try { 
          const p = this.music.play(); 
          if (p !== undefined) p.catch(() => {});
        } catch(err) {}
      }
      document.removeEventListener('click', onFirstInteraction);
      document.removeEventListener('keydown', onFirstInteraction);
      document.removeEventListener('pointerdown', onFirstInteraction);
    };
    document.addEventListener('click', onFirstInteraction);
    document.addEventListener('keydown', onFirstInteraction);
    document.addEventListener('pointerdown', onFirstInteraction);
  },

  attemptAutoPlay() {
    if (!this.muted && this.music.paused) {
      try {
        const promise = this.music.play();
        if (promise !== undefined) {
          promise.catch(e => {
            this.setupInteractionFallback();
          });
        }
      } catch (e) {
        this.setupInteractionFallback();
      }
    }
  },

  updateVolumes() {
    this.music.volume = settings.musicVolume;
    this.bump.volume = settings.sfxVolume;
    this.bell.volume = settings.sfxVolume;
    this.won.volume = settings.sfxVolume;
    this.menuMove.volume = settings.sfxVolume;
    this.select.volume = settings.sfxVolume;
    this.intro.volume = settings.sfxVolume;
  },

  playSfx(sound) {
    if (this.muted) return;
    try {
      sound.currentTime = 0;
      const promise = sound.play();
      if (promise !== undefined) promise.catch(() => {});
    } catch (e) {}
  },

  startMusic() {
    if (this.muted) return;
    try {
      const promise = this.music.play();
      if (promise !== undefined) promise.catch(() => {});
    } catch (e) {}
  },

  bounce() { this.playSfx(this.bump); },
  score() { this.playSfx(this.bell); },
  gameOver() { this.playSfx(this.won); },

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) this.music.pause();
    else this.startMusic();
    triggerMuteToast();
  },
};

let muteToastTimeout;
function triggerMuteToast() {
  const toast = $("mute-toast");
  toast.textContent = audio.muted ? "🔇" : "🔊";
  toast.classList.remove("hidden");
  toast.style.opacity = 1;
  
  clearTimeout(muteToastTimeout);
  muteToastTimeout = setTimeout(() => {
    toast.style.opacity = 0;
    setTimeout(() => {
      if(toast.style.opacity == 0) toast.classList.add("hidden");
    }, 300); // Wait for CSS transition
  }, 1500);
}

function $(id) { return document.getElementById(id); }

function applyStageSize(stageId) {
  settings.stageSize = stageId;
  const stage = STAGE_SIZES[stageId];
  $("app").className = `app ${stage.className}`;
  document.querySelectorAll(".option-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.stage === stageId);
  });
  saveSettings();
}

function buildStageSizeButtons() {
  const grid = $("stage-size-grid");
  grid.innerHTML = "";
  Object.values(STAGE_SIZES).forEach((stage) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.dataset.stage = stage.id;
    btn.textContent = stage.name;
    btn.addEventListener("click", () => applyStageSize(stage.id));
    grid.appendChild(btn);
  });
  applyStageSize(settings.stageSize);
}

function showScreen(screen) {
  state.screen = screen;
  $("menu-overlay").classList.toggle("hidden", screen !== SCREENS.MENU);
  $("settings-overlay").classList.toggle("hidden", screen !== SCREENS.SETTINGS);
  $("hud").classList.toggle("hidden", screen !== SCREENS.PLAYING);
  
  if (screen !== SCREENS.PLAYING) {
    $("pause-overlay").classList.add("hidden");
  } else if (state.paused && !state.winnerText) {
    $("pause-overlay").classList.remove("hidden");
  }
}

function togglePause() {
  if (state.winnerText) return; 
  state.paused = !state.paused;
  $("pause-overlay").classList.toggle("hidden", !state.paused);
}

function updateLabels() {
  if (state.mode === "1p") {
    $("player1-label").textContent = "You";
    $("player2-label").textContent = "CPU";
  } else {
    $("player1-label").textContent = "Player 1";
    $("player2-label").textContent = "Player 2";
  }
}

function clearWinTimeout() {
  if (state.winTimeout) {
    clearTimeout(state.winTimeout);
    state.winTimeout = null;
  }
}

function getWinnerText() {
  if (state.mode === "1p") return state.player1.score >= WIN_SCORE ? "You win!" : "CPU wins!";
  return state.player1.score >= WIN_SCORE ? "Player 1 wins!" : "Player 2 wins!";
}

function configurePaddlesForMode() {
  if (state.mode === "1p") {
    if (settings.difficulty === "easy") {
      state.player1.height = 120;
      state.player2.height = 120;
    } else if (settings.difficulty === "hard") {
      state.player1.height = 60;
      state.player2.height = 60;
    } else {
      state.player1.height = 90;
      state.player2.height = 90;
    }
  } else {
    state.player1.height = 90;
    state.player2.height = 90;
  }
}

function startGame(mode) {
  clearWinTimeout();
  state.mode = mode;
  state.paused = false;
  $("pause-overlay").classList.add("hidden");
  state.gameOverPlayed = false;
  state.winnerText = "";
  configurePaddlesForMode();
  resetScores();
  updateLabels();
  showScreen(SCREENS.PLAYING);
}

function resetBall(direction = Math.random() < 0.5 ? 1 : -1) {
  state.ball.x = WIDTH / 2;
  state.ball.y = HEIGHT / 2;
  state.ball.speed = BASE_SPEED;
  const angle = (Math.random() * 0.6 - 0.3) * Math.PI;
  state.ball.vx = Math.cos(angle) * BASE_SPEED * direction;
  state.ball.vy = Math.sin(angle) * BASE_SPEED;
}

function increaseSpeed() {
  state.ball.speed *= SPEED_MULTIPLIER;
  const currentSpeed = Math.hypot(state.ball.vx, state.ball.vy);
  const scale = state.ball.speed / currentSpeed;
  state.ball.vx *= scale;
  state.ball.vy *= scale;
}

function clampPaddle(paddle) {
  const prevY = paddle.y;
  paddle.y = Math.max(0, Math.min(HEIGHT - paddle.height, paddle.y));
  if (paddle.y !== prevY) paddle.vy = 0;
}

function updatePaddlePhysics(paddle, moveUp, moveDown) {
  const sensitivityMultiplier = settings.sensitivity / 65; 
  const adjustedAccel = PADDLE_ACCEL * sensitivityMultiplier;
  const adjustedMaxSpeed = PADDLE_MAX_SPEED * sensitivityMultiplier;

  if (moveUp) paddle.vy -= adjustedAccel;
  if (moveDown) paddle.vy += adjustedAccel;

  if (!moveUp && !moveDown) paddle.vy *= PADDLE_FRICTION;

  if (Math.abs(paddle.vy) < 0.05) paddle.vy = 0;
  paddle.vy = Math.max(-adjustedMaxSpeed, Math.min(adjustedMaxSpeed, paddle.vy));
  paddle.y += paddle.vy;
  clampPaddle(paddle);
}

function updatePlayerPaddles() {
  updatePaddlePhysics(state.player1, keys["w"] || keys["W"], keys["s"] || keys["S"]);
  if (state.mode === "2p") {
    updatePaddlePhysics(state.player2, keys["ArrowUp"], keys["ArrowDown"]);
  }
}

function updateAI() {
  if (state.mode !== "1p") return;

  const diffSettings = {
    easy: { maxSpeed: PADDLE_MAX_SPEED * 0.5, accel: 0.9, reactThreshold: WIDTH * 0.75 },
    normal: { maxSpeed: PADDLE_MAX_SPEED * 0.85, accel: 1.6, reactThreshold: WIDTH * 0.5 },
    hard: { maxSpeed: PADDLE_MAX_SPEED * 1.3, accel: 3.5, reactThreshold: WIDTH * 0.25 },
  };
  
  const conf = diffSettings[settings.difficulty] || diffSettings.normal;
  const paddle = state.player2;
  const center = paddle.y + paddle.height / 2;
  const target = state.ball.y;
  const diff = target - center;

  if (state.ball.vx > 0 && state.ball.x > conf.reactThreshold) {
    if (Math.abs(diff) > 6) {
      if (diff < 0) paddle.vy -= conf.accel;
      else paddle.vy += conf.accel;
    } else {
      paddle.vy *= PADDLE_FRICTION;
    }
  } else {
    paddle.vy *= PADDLE_FRICTION;
  }

  paddle.vy = Math.max(-conf.maxSpeed, Math.min(conf.maxSpeed, paddle.vy));
  paddle.y += paddle.vy;
  clampPaddle(paddle);
}

function handlePaddleCollision(paddle, paddleX) {
  const ball = state.ball;
  const paddleTop = paddle.y;
  const paddleBottom = paddle.y + paddle.height;
  const paddleCenter = paddle.y + paddle.height / 2;

  if (
    ball.y + SOUL_SIZE / 2 >= paddleTop &&
    ball.y - SOUL_SIZE / 2 <= paddleBottom &&
    Math.abs(ball.x - paddleX) <= PADDLE_WIDTH / 2 + SOUL_SIZE / 2
  ) {
    const relativeIntersect = (ball.y - paddleCenter) / (paddle.height / 2);
    const bounceAngle = relativeIntersect * (Math.PI / 3);
    const direction = paddleX < WIDTH / 2 ? 1 : -1;

    ball.vx = Math.cos(bounceAngle) * ball.speed * direction;
    ball.vy = Math.sin(bounceAngle) * ball.speed + paddle.vy * 0.15;

    if (paddleX < WIDTH / 2) ball.x = paddleX + PADDLE_WIDTH / 2 + SOUL_SIZE / 2;
    else ball.x = paddleX - PADDLE_WIDTH / 2 - SOUL_SIZE / 2;

    increaseSpeed();
    audio.bounce();
    return true;
  }
  return false;
}

function updateBall() {
  const ball = state.ball;
  ball.x += ball.vx;
  ball.y += ball.vy;

  if (ball.y - SOUL_SIZE / 2 <= 0) {
    ball.y = SOUL_SIZE / 2;
    ball.vy *= -1;
    increaseSpeed();
    audio.bounce();
  } else if (ball.y + SOUL_SIZE / 2 >= HEIGHT) {
    ball.y = HEIGHT - SOUL_SIZE / 2;
    ball.vy *= -1;
    increaseSpeed();
    audio.bounce();
  }

  if (!handlePaddleCollision(state.player1, PADDLE_WIDTH / 2)) {
    handlePaddleCollision(state.player2, WIDTH - PADDLE_WIDTH / 2);
  }

  if (ball.x < 0) {
    state.player2.score++;
    onScore();
    resetBall(1);
  } else if (ball.x > WIDTH) {
    state.player1.score++;
    onScore();
    resetBall(-1);
  }
}

function updateScoreboard() {
  $("player1-score").textContent = state.player1.score;
  $("player2-score").textContent = state.player2.score;
}

function onScore() {
  updateScoreboard();
  audio.score();
  checkWin();
}

function checkWin() {
  if (state.player1.score >= WIN_SCORE || state.player2.score >= WIN_SCORE) {
    state.paused = true;
    state.winnerText = getWinnerText();

    if (!state.gameOverPlayed) {
      audio.gameOver();
      state.gameOverPlayed = true;
      clearWinTimeout();
      state.winTimeout = setTimeout(() => {
        resetScores();
        returnToMenu();
      }, WIN_RETURN_DELAY);
    }
  }
}

function resetScores() {
  clearWinTimeout();
  state.player1.score = 0;
  state.player2.score = 0;
  state.player1.y = HEIGHT / 2 - state.player1.height / 2;
  state.player2.y = HEIGHT / 2 - state.player2.height / 2;
  state.player1.vy = 0;
  state.player2.vy = 0;
  state.paused = false;
  state.gameOverPlayed = false;
  state.winnerText = "";
  $("pause-overlay").classList.add("hidden");
  updateScoreboard();
  resetBall();
}

function returnToMenu() {
  clearWinTimeout();
  showScreen(SCREENS.MENU);
  state.paused = false;
  state.winnerText = "";
  $("pause-overlay").classList.add("hidden");
}

function drawBackground() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.setLineDash([8, 12]);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2, 0);
  ctx.lineTo(WIDTH / 2, HEIGHT);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPaddle(x, y, vy, height, color) {
  const blurSteps = Math.min(6, Math.ceil(Math.abs(vy) * 0.6));
  for (let i = blurSteps; i > 0; i--) {
    ctx.globalAlpha = 0.12 + (i / blurSteps) * 0.18;
    ctx.fillStyle = color;
    ctx.fillRect(x, y - vy * i * 1.1, PADDLE_WIDTH, height);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, PADDLE_WIDTH, height);
}

function drawSoul(x, y) {
  const soulImg = assets.soulProcessed || assets.soul;
  if (!soulImg.complete && !assets.soulProcessed) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, SOUL_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.imageSmoothingEnabled = false;

  const currentSpeed = Math.hypot(state.ball.vx, state.ball.vy);
  if (currentSpeed > BASE_SPEED * 1.2) {
    const blurSteps = Math.min(6, Math.floor(currentSpeed / 1.5));
    for (let i = blurSteps; i > 0; i--) {
      ctx.globalAlpha = 0.12 + (i / blurSteps) * 0.15;
      const pastX = x - (state.ball.vx * i * 0.4);
      const pastY = y - (state.ball.vy * i * 0.4);
      ctx.drawImage(soulImg, pastX - SOUL_SIZE / 2, pastY - SOUL_SIZE / 2, SOUL_SIZE, SOUL_SIZE);
    }
  }

  ctx.globalAlpha = 1;
  ctx.drawImage(soulImg, x - SOUL_SIZE / 2, y - SOUL_SIZE / 2, SOUL_SIZE, SOUL_SIZE);
}

function drawWinnerOverlay() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 38px 'Determination', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.winnerText, WIDTH / 2, HEIGHT / 2 - 10);

  ctx.font = "18px 'Determination', sans-serif";
  ctx.fillStyle = "yellow";
  ctx.globalAlpha = 0.85;
  ctx.fillText("Returning to menu...", WIDTH / 2, HEIGHT / 2 + 32);
  ctx.globalAlpha = 1;
}

function draw() {
  drawBackground();

  if (state.screen === SCREENS.MENU || state.screen === SCREENS.SETTINGS) {
    drawPaddle(0, HEIGHT / 2 - 45, 0, 90, "white");
    drawPaddle(WIDTH - PADDLE_WIDTH, HEIGHT / 2 - 45, 0, 90, "white");
    drawSoul(WIDTH / 2, HEIGHT / 2);
    return;
  }

  drawPaddle(0, state.player1.y, state.player1.vy, state.player1.height, "white");
  drawPaddle(WIDTH - PADDLE_WIDTH, state.player2.y, state.player2.vy, state.player2.height, "white");
  drawSoul(state.ball.x, state.ball.y);

  if (state.paused && state.winnerText) drawWinnerOverlay();
}

function gameLoop() {
  if (state.screen === SCREENS.PLAYING && !state.paused) {
    updatePlayerPaddles();
    updateAI();
    updateBall();
  }
  draw();
  requestAnimationFrame(gameLoop);
}

// Map Unified Pointer Events for Mouse + Touch Dragging
let isDragging = false;

function handlePointerDown(e) {
  if (!settings.mobileSupport || state.screen !== SCREENS.PLAYING || state.paused) return;
  isDragging = true;
  handlePointerMove(e); 
}

function handlePointerUp() {
  isDragging = false;
}

function handlePointerMove(e) {
  if (!isDragging || !settings.mobileSupport || state.screen !== SCREENS.PLAYING || state.paused) return;
  e.preventDefault(); 
  
  const rect = canvas.getBoundingClientRect();
  const scaleY = canvas.height / rect.height;
  const scaleX = canvas.width / rect.width;

  const y = (e.clientY - rect.top) * scaleY;
  const x = (e.clientX - rect.left) * scaleX;
  
  if (x < WIDTH / 2) {
    state.player1.y = y - state.player1.height / 2;
    state.player1.vy = 0; 
    clampPaddle(state.player1);
  } else if (state.mode === "2p") {
    state.player2.y = y - state.player2.height / 2;
    state.player2.vy = 0; 
    clampPaddle(state.player2);
  }
}

canvas.addEventListener('pointerdown', handlePointerDown);
canvas.addEventListener('pointermove', handlePointerMove);
window.addEventListener('pointerup', handlePointerUp); // Attached to window so it catches releases outside the canvas

function bindUI() {
  $("difficulty-select").value = settings.difficulty;
  $("mobile-support").checked = settings.mobileSupport;
  $("sfx-volume").value = settings.sfxVolume * 100;
  $("sfx-volume-value").textContent = `${settings.sfxVolume * 100}%`;
  $("music-volume").value = settings.musicVolume * 100;
  $("music-volume-value").textContent = `${settings.musicVolume * 100}%`;
  $("sensitivity").value = settings.sensitivity;
  $("sensitivity-value").textContent = `${settings.sensitivity}%`;

  $("btn-1p").addEventListener("click", () => startGame("1p"));
  $("btn-2p").addEventListener("click", () => startGame("2p"));
  
  $("btn-settings").addEventListener("click", () => {
    screenBeforeSettings = SCREENS.MENU;
    showScreen(SCREENS.SETTINGS);
  });
  $("btn-pause-settings").addEventListener("click", () => {
    screenBeforeSettings = SCREENS.PLAYING;
    showScreen(SCREENS.SETTINGS);
  });

  $("btn-settings-back").addEventListener("click", () => showScreen(screenBeforeSettings));
  $("btn-resume").addEventListener("click", () => togglePause());
  $("btn-pause-menu").addEventListener("click", () => { resetScores(); returnToMenu(); });
  
  $("btn-test-sound").addEventListener("click", () => {
    audio.bounce(); setTimeout(() => audio.score(), 200);
  });
  
  // Easter Egg Hook
  $("title-logo").addEventListener("click", () => {
    audio.playSfx(audio.intro);
  });

  document.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('mouseenter', () => audio.playSfx(audio.menuMove));
    btn.addEventListener('click', () => audio.playSfx(audio.select));
  });

  $("difficulty-select").addEventListener("change", (e) => {
    settings.difficulty = e.target.value;
    saveSettings();
  });

  $("mobile-support").addEventListener("change", (e) => {
    settings.mobileSupport = e.target.checked;
    saveSettings();
  });

  $("custom-music-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
      await saveCustomAudio(file);
      audio.setCustomMusic(file);
    }
  });

  $("btn-default-music").addEventListener("click", () => {
    $("custom-music-input").value = ""; 
    audio.resetToDefaultMusic();
  });

  $("sfx-volume").addEventListener("input", (e) => {
    settings.sfxVolume = Number(e.target.value) / 100;
    $("sfx-volume-value").textContent = `${e.target.value}%`;
    audio.updateVolumes();
    saveSettings();
  });

  $("music-volume").addEventListener("input", (e) => {
    settings.musicVolume = Number(e.target.value) / 100;
    $("music-volume-value").textContent = `${e.target.value}%`;
    audio.updateVolumes();
    saveSettings();
  });
  
  $("sensitivity").addEventListener("input", (e) => {
    settings.sensitivity = Number(e.target.value);
    $("sensitivity-value").textContent = `${e.target.value}%`;
    saveSettings();
  });
}

document.addEventListener("keydown", (e) => {
  keys[e.key] = true;
  if (e.key === "m" || e.key === "M") audio.toggleMute();
  if (e.key === "Escape") {
    if (state.screen === SCREENS.PLAYING) togglePause();
    else if (state.screen === SCREENS.SETTINGS) showScreen(screenBeforeSettings);
  }
});

document.addEventListener("keyup", (e) => { keys[e.key] = false; });
window.addEventListener("resize", () => applyStageSize(settings.stageSize));

try {
  audio.init();
  audio.attemptAutoPlay();
  buildStageSizeButtons();
  bindUI();
  showScreen(SCREENS.MENU);
  gameLoop();
} catch (error) {
  console.error("Initialization error:", error);
}