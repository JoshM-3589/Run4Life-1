

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const inputEl = document.getElementById('input');  
const PLAY_ASPECT = 16 / 9;     // width / height → portrait
const PLAY_MAX_HEIGHT = 0.9;    // 90% of window height
const PLAY_MAX_WIDTH = 0.6;  
const SLOWMO_DISTANCE = 250;    // how close an obstacle must be to trigger slow-mo
const SLOWMO_FACTOR = 0.35;     // 0.35 = 35% speed. Lower = slower
const JUMP_DURATION = 0.5;      // seconds in the air
const JUMP_HEIGHT = 80;         // peak pixels above the ground
const CHASER_JUMP_DELAY = 0.25; // chaser starts its jump later
const JUMP_TRIGGER_DISTANCE = 180;  // jump when obstacle is this far from runner
const JUMP_SAFE_MARGIN = 40;         // extra leeway — jump still works if closer
const CHASER_STOP_DISTANCE = 100;      // chaser never gets closer than this to a pending obstacle
const CHASER_JUMP_CUE = 40;           // when the obstacle is this close, jump
const CHASER_JUMP_DURATION = 0.6;

const CHASER_STAGGER_DURATION = 1.0; // how long the slowdown lasts
const CHASER_STAGGER_FACTOR = 0.1;   // 0.2 = chaser moves at 20% speed

const WORLD_SPEED = 150;

const ENTITY_WIDTH = 30;
const ENTITY_HEIGHT = 50; 

const FLOOR_HEIGHT = 100;      // how thick the floor band is
const FLOOR_OFFSET = 0;      // gap between entity feet and floor top

const SCORE_PER_PIXEL = 0.05;      // distance points per pixel scrolled
const SCORE_PER_WORD = 100;        // bonus for each typed word
const SCORE_LENGTH_BONUS = 10;     // extra per letter in the word


let floorScroll = 0;      

let chaserStaggerTime = 0;          // seconds remaining on the stagger

let lastTime = 0;
let spawnTimer = 0;
const spawnInterval = 2.5;
let rafId;

let targetedObstacle = null;
let currentTyped ='';
let nextObstacleId = 0; 
let score = 0;
let distanceScore = 0;      // accumulates over time (as a float)
let lastHudUpdate = 0;      // for throttling HUD redraws



// const runner = {
//   x: canvas.width / 2 - ENTITY_WIDTH / 2,
//   y: canvas.height / 2 - ENTITY_HEIGHT / 2,
//   width: ENTITY_WIDTH,
//   height: ENTITY_HEIGHT,
// };
const runner = {
  x: 0, y: 0,
  width: ENTITY_WIDTH,
  height: ENTITY_HEIGHT,
};
// const chaser = {
//   x: -ENTITY_WIDTH / 2,   // half off the left edge
//   y: canvas.height / 2 - ENTITY_HEIGHT / 2,
//   width: ENTITY_WIDTH,
//   height: ENTITY_HEIGHT,
// };
const chaser = {
  x: -ENTITY_WIDTH / 2,
  y: 0,
  width: ENTITY_WIDTH,
  height: ENTITY_HEIGHT,
};
const runnerJump = {
  active: false,
  time: 0,          // elapsed since jump started
  duration: JUMP_DURATION,
  height: JUMP_HEIGHT,
  yOffset: 0,       // current vertical offset from ground
};
const chaserJump = {
  active: false,
  time: 0,
  duration: JUMP_DURATION,
  height: JUMP_HEIGHT,
  yOffset: 0,
  targetId: null,
};

const words = ['fire', 'jump', 'duck', 'run', 'dash', 'leap'];
const obstacles = [];      

const scorePopups = [];



window.addEventListener('keydown', (e) => {
  // Only care about single-character keys (letters, numbers)
  if (e.key.length !== 1) return;

  // Prevent default for spacebar (it scrolls the page)
  if (e.key === ' ') e.preventDefault();

  currentTyped += e.key.toLowerCase();

  checkTypedMatch();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Backspace') {
    currentTyped = currentTyped.slice(0, -1);
    e.preventDefault();
  }
  if (e.key === 'Escape') {
    currentTyped = '';
  }
});

function getEntityY() {
  return getGroundY() - ENTITY_HEIGHT / 2;
}

function getFloorTop() {
  return getGroundY() + ENTITY_HEIGHT / 2 + FLOOR_OFFSET;
}

function getGroundY() {
  return canvas.height * 0.75;
}

function gameLoop(timestamp) {
  let delta = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  // Clamp delta to prevent tab-switch teleport
  if (delta > 0.1) delta = 0.1;

  // Apply slow-motion scaling
  const timeScale = getTimeScale();
  const scaledDelta = delta * timeScale;

  update(scaledDelta);
  draw();

  rafId = requestAnimationFrame(gameLoop);
}
function getTimeScale() {
  if (obstacles.length === 0) return 1;

  const runnerCenterX = runner.x + runner.width / 2;
  let minScale = 1;

  for (const o of obstacles) {
    if (o.cleared) continue; //Remove if prefer slow-mo after clearing obstacle
    const obstacleCenterX = o.x + o.width / 2;
    const distance = obstacleCenterX - runnerCenterX;

    if (distance > 0 && distance < SLOWMO_DISTANCE) {
      // Closer = slower
      const t = distance / SLOWMO_DISTANCE;         // 1 → 0 as it approaches
      const scale = SLOWMO_FACTOR + (1 - SLOWMO_FACTOR) * t;
      minScale = Math.min(minScale, scale);
    }
  }

  return minScale;
}
function pickTargetObstacle() {
  if (obstacles.length === 0) {
    targetedObstacle = null;
    currentTyped = '';
    return;
  }

  // Find the closest obstacle that hasn't been cleared yet
  let closest = null;
  for (const o of obstacles) {
    if (o.cleared) continue;
    if (!closest || o.x < closest.x) closest = o;
  }

  // No uncleared obstacles → clear target
  if (!closest) {
    targetedObstacle = null;
    currentTyped = '';
    return;
  }

  // If the target changed, reset typing
  if (targetedObstacle !== closest) {
    targetedObstacle = closest;
    currentTyped = '';
  }
}

function getTotalScore() {
  return Math.floor(score + distanceScore);
}

function drawScore() {
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('SCORE: ' + getTotalScore(), canvas.width - 20, 20);
}

function checkJumpTriggers() {
  if (runnerJump.active) return;

  const runnerCenterX = runner.x + runner.width / 2;

  for (const o of obstacles) {
    if (!o.awaitingJump) continue;

    const obstacleCenterX = o.x + o.width / 2;
    const distance = obstacleCenterX - runnerCenterX;

    // Ideal trigger
    if (distance <= JUMP_TRIGGER_DISTANCE) {
      triggerRunnerJump();
      o.awaitingJump = false;
      return;
    }
  }
}
function checkChaserJump() {
  if (chaserJump.active) return;

  const chaserCX = chaser.x + chaser.width / 2;

  for (const o of obstacles) {
    if (!o.chaserDelay) continue;         // only pause for player-typed obstacles
    if (o.chaserJumped) continue;         // already jumped this one

    const obstacleCenterX = o.x + o.width / 2;
    const gap = obstacleCenterX - chaserCX;

    // Jump cue reached → go
    if (gap > 0 && gap < CHASER_JUMP_CUE) {
      chaserJump.active = true;
      chaserJump.time = 0;
      chaserJump.duration = CHASER_JUMP_DURATION;
      chaserJump.targetId = o.id;      // remember which obstacle we jumped
      o.chaserJumped = true;           
      return;
    }
  }
}
function getJumpDurationForDistance() {
  if (obstacles.length === 0) return JUMP_DURATION;

  const runnerCenterX = runner.x + runner.width / 2;
  let minDist = Infinity;

  for (const o of obstacles) {
    if (!o.awaitingJump && !o.cleared) continue;
    const obstacleCenterX = o.x + o.width / 2;
    const d = obstacleCenterX - runnerCenterX;
    if (d > 0 && d < minDist) minDist = d;
  }

  if (minDist === Infinity) return JUMP_DURATION;

  // Time for the obstacle to reach and pass the runner
  const timeToReach = minDist / WORLD_SPEED;
  const timeToPass = (runner.width + 40) / WORLD_SPEED;   // obstacle width + buffer
  const airtime = timeToReach + timeToPass;

  return Math.max(0.4, Math.min(airtime, 1.5));   // clamp
}
function triggerRunnerJump() {
  runnerJump.active = true;
  runnerJump.time = 0;
  runnerJump.duration = getJumpDurationForDistance();
}
function checkTypedMatch() {
  if (!targetedObstacle) {
    currentTyped = '';
    return;
  }

  const word = targetedObstacle.word;

  // If typed text is not a prefix of the word, reset it
  if (!word.startsWith(currentTyped)) {
    currentTyped = '';
    return;
  }

  // Full match → destroy the obstacle
  if (currentTyped === word) {
    // Remove from obstacles
    const idx = obstacles.indexOf(targetedObstacle);
    targetedObstacle.cleared = true;
    targetedObstacle.awaitingJump = true;
    targetedObstacle.chaserDelay = true;

  // Score bonus
  const lengthBonus = word.length * SCORE_LENGTH_BONUS;
  score += SCORE_PER_WORD + lengthBonus;

  scorePopups.push({
  x: targetedObstacle.x + targetedObstacle.width / 2,
  y: targetedObstacle.y - 20,
  text: '+' + (SCORE_PER_WORD + lengthBonus),
  life: 0.8,
  maxLife: 0.8,
  });

    currentTyped = '';

    


    // Optional: award score here later
  }
}
function drawObstacleWord(o) {
  if(o.cleared) return;
  const isTarget = (o === targetedObstacle);
  const typed = isTarget ? currentTyped : '';
  const word = o.word;

  // Measure so we can center the whole thing
  ctx.font = '16px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const charWidth = ctx.measureText('M').width;
  const totalWidth = charWidth * word.length;

  // Starting x — centered above the obstacle
  let drawX = o.x + o.width / 2 - totalWidth / 2;
  const drawY = o.y - 15;

  // Draw each character
  for (let i = 0; i < word.length; i++) {
    const isTyped = i < typed.length;

    // Yellow for typed letters, white for the rest
    ctx.fillStyle = isTyped ? '#ffd400' : '#ffffff';

    // Optional: bold the typed ones
    ctx.font = (isTyped ? 'bold ' : '') + '16px monospace';

    ctx.fillText(word[i], drawX, drawY);
    drawX += charWidth;
  }
}
function updateJump(jump, delta) {
  if (!jump.active) return;

  jump.time += delta;

  if (jump.time >= jump.duration) {
    jump.active = false;
    jump.time = 0;
    jump.yOffset = 0;
    if (jump === chaserJump) jump.targetId = null; 
    return;
  }

  // Parabolic arc: peak at duration/2
  const t = jump.time / jump.duration;         // 0 → 1
  jump.yOffset = -4 * jump.height * t * (1 - t); // classic parabola
}

function update(delta) {
    // --- Chaser movement ---
  const runnerCX = runner.x + runner.width / 2;
  const runnerCY = runner.y + runner.height / 2;
  const chaserCX = chaser.x + chaser.width / 2;
  const chaserCY = chaser.y + chaser.height / 2;

  const dx = runnerCX - chaserCX;
  const dy = runnerCY - chaserCY;
  const dist = Math.hypot(dx, dy);


  let blockedByObstacle = false;
  for (const o of obstacles) {
    if (!o.chaserDelay) continue;      // only paused for player-typed obstacles
    if (o.chaserJumped) continue;      // already jumped → no longer blocks

    const obstacleCenterX = o.x + o.width / 2;
    const gap = obstacleCenterX - chaserCX;

    if (gap > 0 && gap < CHASER_STOP_DISTANCE) {
      // Only block if the chaser hasn't jumped this one yet
      if (!chaserJump.targetId || chaserJump.targetId !== o.id) {
        blockedByObstacle = true;
        break;
      }
    }
  }

let chaserSpeed = 60;
if (chaserStaggerTime > 0) {
  chaserSpeed *= CHASER_STAGGER_FACTOR;
}

if (blockedByObstacle) {
  // Slide with the floor — appears stationary relative to the ground
  chaser.x -= WORLD_SPEED * delta * 0.6;
} else if (dist > 1) {
  chaser.x += (dx / dist) * chaserSpeed * delta;
  chaser.y += (dy / dist) * chaserSpeed * delta;
}


  // --- Floor scroll ---
  floorScroll -= WORLD_SPEED * delta;
  if (floorScroll <= -80) floorScroll = 0;

  // --- Distance score ---
  distanceScore += WORLD_SPEED * delta * SCORE_PER_PIXEL;

  for (let i = scorePopups.length - 1; i >= 0; i--) {
  scorePopups[i].life -= delta;
  scorePopups[i].y -= 40 * delta;   // drift upward
  if (scorePopups[i].life <= 0) scorePopups.splice(i, 1);
  }

  // --- Move obstacles ---
  obstacles.forEach(o => o.x -= WORLD_SPEED * delta);

  // --- Remove off-screen obstacles ---
  for (let i = obstacles.length - 1; i >= 0; i--) {
    if (obstacles[i].x + obstacles[i].width < 0) obstacles.splice(i, 1);
  }

  // --- Choose typing target ---
  pickTargetObstacle();

  // --- Spawn timer ---
  spawnTimer += delta;
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    spawnObstacle();
  }
  checkJumpTriggers();
  checkChaserJump();
  updateJump(runnerJump, delta);

  // Handle the chaser's delayed jump
  const chaserJumpDelta = chaserStaggerTime > 0
  ? delta * CHASER_STAGGER_FACTOR
  : delta;
  updateJump(chaserJump, chaserJumpDelta);

  // --- Collisions ---
  if (!runnerJump.active) {
  for (const o of obstacles) {
    if (rectsOverlap(o, runner)) {
      gameOver('An obstacle hit you!');
      return;
    }
  }
}

  if (rectsOverlap(runner, chaser)) {
    gameOver('The chaser caught you!');
  }
}

function gameOver(reason) {
  cancelAnimationFrame(rafId);
  const finalScore = getTotalScore();
  alert('Game Over: ' + reason + '\n\nFinal Score: ' + finalScore);
  resetGame();
  lastTime = performance.now();
  rafId = requestAnimationFrame(gameLoop);
}
function drawFloor() {
  const floorTop = getFloorTop();
  const floorH = FLOOR_HEIGHT;
   // Solid floor band
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, floorTop, canvas.width, floorH);

  // Top edge highlight (a lighter line)
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(0, floorTop, canvas.width, 3);

  // Scrolling tick marks to convey motion
  ctx.fillStyle = '#3a3a3a';
  const spacing = 80;
  for (let x = floorScroll; x < canvas.width; x += spacing) {
    ctx.fillRect(x, floorTop + 10, 40, 4);   // a short dash
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawFloor();

  // Runner
ctx.fillStyle = '#4f4';
ctx.fillRect(
  runner.x,
  runner.y + runnerJump.yOffset,   // ← apply jump offset
  runner.width,
  runner.height
);
ctx.strokeStyle = '#2a2';
ctx.lineWidth = 2;
ctx.strokeRect(
  runner.x,
  runner.y + runnerJump.yOffset,
  runner.width,
  runner.height
);

// Chaser
ctx.fillStyle = chaserStaggerTime > 0 ? '#a55' : '#f44';
ctx.fillRect(
  chaser.x,
  chaser.y + chaserJump.yOffset,   // ← apply jump offset
  chaser.width,
  chaser.height
);
ctx.strokeStyle = chaserStaggerTime > 0 ? '#622' : '#a22';
ctx.strokeRect(
  chaser.x,
  chaser.y + chaserJump.yOffset,
  chaser.width,
  chaser.height
);

  
  obstacles.forEach(o => {
  // Square placeholder
  ctx.fillStyle = '#f80';
  ctx.fillRect(o.x, o.y, o.width, o.height);
  drawObstacleWord(o);
  });

  drawScore(); 

  scorePopups.forEach(p => {
  const alpha = p.life / p.maxLife;
  ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(p.text, p.x, p.y);
  });

  const timeScale = getTimeScale();
  if (timeScale < 1) {
    // Fade the intensity based on how slow it is
    const intensity = (1 - timeScale) / (1 - SLOWMO_FACTOR); // 0 → 1
    ctx.fillStyle = `rgba(255, 215, 0, ${intensity * 0.08})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}


function spawnObstacle() {
  const word = words[Math.floor(Math.random() * words.length)];
  const obstacleSize = 40;

  const lineY = canvas.height * 3 / 4;   // ← changed

  obstacles.push({
    id: nextObstacleId++,
    x: canvas.width + 30,
    y: getFloorTop() - obstacleSize,
    width: obstacleSize,
    height: obstacleSize,
    word: word,
    cleared: false,
    awaitingJump: false, 
    chaserDelay: false, 
    chaserJumped: false,
  });
}
function resetGame() {
  obstacles.length = 0;
  targetedObstacle = null;
  currentTyped = '';

  chaser.x = -ENTITY_WIDTH / 2;
  chaser.y = getEntityY();

  runner.x = canvas.width * 0.6 - runner.width / 2;
  runner.y = getEntityY();

  spawnTimer = 0;
  lastTime = 0;
  chaserStaggerTime = 0;
  score = 0;
  distanceScore = 0;
  runnerJump.active = false;
  runnerJump.time = 0;
  runnerJump.yOffset = 0;

  chaserJump.active = false;
  chaserJump.pending = false;
  chaserJump.pendingTime = 0;
  chaserJump.time = 0;
  chaserJump.yOffset = 0;
  chaserJump.targetId = null;

}

function resizeCanvas() {
  let w = window.innerWidth * PLAY_MAX_WIDTH;
  let h = w / PLAY_ASPECT;

  const maxH = window.innerHeight * PLAY_MAX_HEIGHT;
  if (h > maxH) {
    h = maxH;
    w = h * PLAY_ASPECT;
  }

  canvas.width = Math.floor(w);
  canvas.height = Math.floor(h);

  const lineY = canvas.height * 3 / 4 - ENTITY_HEIGHT / 2;   // ← changed

  if (typeof runner !== 'undefined') {
    runner.x = canvas.width * 0.6 - runner.width / 2;
    runner.y = lineY;
  }

  if (typeof chaser !== 'undefined') {
    chaser.y = lineY;
  }
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

requestAnimationFrame(gameLoop);