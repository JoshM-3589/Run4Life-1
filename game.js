
//CANVAS AND PLAY ASPECT RATIO
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const inputEl = document.getElementById('input');  
const PLAY_ASPECT = 16 / 9;     // width / height → portrait
const PLAY_MAX_HEIGHT = 0.9;    // 90% of window height
const PLAY_MAX_WIDTH = 0.6; 

const runnerSheet = new Image();
runnerSheet.src = 'sprites/runner.png';

const FRAME_W = 120;
const FRAME_H = 200;
const RUN_FRAMES = 10;

const runnerAnim = {
  frame: 0,
  timer: 0,
  fps: 10,
};



//SLOW MOTION, JUMPING AND SLIDING 
const SLOWMO_DISTANCE = 250;    // how close an obstacle must be to trigger slow-mo
const SLOWMO_FACTOR = 0.35;     // 0.35 = 35% speed. Lower = slower
const JUMP_DURATION = 0.5;      // seconds in the air
const JUMP_HEIGHT = 80;         // peak pixels above the ground
const CHASER_JUMP_DELAY = 0.25; // chaser starts its jump later
const JUMP_TRIGGER_DISTANCE = 180;  // jump when obstacle is this far from runner
const JUMP_SAFE_MARGIN = 40;         // extra leeway — jump still works if closer
const SLIDE_TRIGGER_DISTANCE = 180;   // start here; tune later
const SLIDE_DURATION = 0.5;           // how long the slide lasts
const SLIDE_HEIGHT = 20;
const SLIDE_WIDTH = 50;
const CHASER_STOP_DISTANCE = 100;      // chaser never gets closer than this to a pending obstacle
const CHASER_JUMP_CUE = 40;           // when the obstacle is this close, jump
const CHASER_JUMP_DURATION = 0.6;

//CHASER STAGGER
const CHASER_STAGGER_DURATION = 1.2; // how long the slowdown lasts
const CHASER_STAGGER_FACTOR = 0.1;   // 0.1 = chaser moves at 10% speed
const CHASER_BLOCK_DRIFT = 0.7;   // 0.6 = drifts at 60% of floor speed when blocked

//WORLD SPEED
const WORLD_SPEED = 150;

//DEFAULT ENTITY SIZE
const ENTITY_WIDTH = 30;
const ENTITY_HEIGHT = 50; 

//FLOOR 
const FLOOR_HEIGHT = 100;      // how thick the floor band is
const FLOOR_OFFSET = 0;      // gap between entity feet and floor top

//SCORING SYSTEM
const SCORE_PER_PIXEL = 0.05;      // distance points per pixel scrolled
const SCORE_PER_WORD = 100;        // bonus for each typed word
const SCORE_LENGTH_BONUS = 10;     // extra per letter in the word
const WORD_TIER_2_SCORE = 2000;
const WORD_TIER_3_SCORE = 3000;
const WORLD_SPEED_TIER_2 = 0.95;   // 5% slower at tier 2
const WORLD_SPEED_TIER_3 = 0.90;   // 10% slower at tier 3
const SPAWN_INTERVAL_TIER_2 = 3.0; // was 2.5
const SPAWN_INTERVAL_TIER_3 = 3.5; // even more space at tier 3

//SLIDE OBSTACLE
const SLIDE_OBSTACLE_WIDTH = 50;
const SLIDE_OBSTACLE_HEIGHT = 120;
const SLIDE_OBSTACLE_GAP = 30;   // clearance between floor and block bottom
const SLIDE_UNLOCK_SCORE = 1000;
const SLIDE_CHANCE_AFTER_UNLOCK = 0.5; 


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
const runnerSlide = {
  active: false,
  time: 0,
  duration: SLIDE_DURATION,
  height: ENTITY_HEIGHT,
  width: ENTITY_WIDTH,
};

const chaserSlide = {
  active: false,
  time: 0,
  duration: SLIDE_DURATION,
  height: ENTITY_HEIGHT,
  width: ENTITY_WIDTH,
  targetId: null,
};

const WORD_POOLS = {
  easy: [
    'run', 'jump', 'duck', 'fire', 'dash', 'leap', 'dodge', 'slide',
    'hide', 'fast', 'move', 'stop', 'left', 'flip', 'spin', 'roll',
    'kirk', 'speed', 'cisco', 'ball', 'data', 'sort'
  ],
  medium: [
    'running', 'jumping', 'ducking', 'firefly', 'dashing', 'leaping',
    'dodging', 'sliding', 'hiding', 'faster', 'moving', 'stopping',
    'lifting', 'flipping', 'spinning', 'rolling', 'sigma', 'awesome',
    'knowledge'
  ],
  hard: [
    'sprinting', 'stumbling', 'dangerous', 'escalated', 'mysteries',
    'overboard', 'trembling', 'frightened', 'accelerate', 'overcoming',
    'synchronize', 'bewildered', 'complicated', 'transcended', 'unshaken',
    'relentless', 'illuminated', 'disasterous', 'uncovering', 'persistent',
    'networking', 'algorithm'
  ],
};

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

function getWorldSpeed() {
  const total = getTotalScore();
  if (total >= WORD_TIER_3_SCORE) return WORLD_SPEED * WORLD_SPEED_TIER_3;
  if (total >= WORD_TIER_2_SCORE) return WORLD_SPEED * WORLD_SPEED_TIER_2;
  return WORLD_SPEED;
}

function getSpawnInterval() {
  const total = getTotalScore();
  if (total >= WORD_TIER_3_SCORE) return SPAWN_INTERVAL_TIER_3;
  if (total >= WORD_TIER_2_SCORE) return SPAWN_INTERVAL_TIER_2;
  return spawnInterval;
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
function getRunnerBounds() {
  if (runnerSlide.active) {
    const h = runnerSlide.height;
    const w = runnerSlide.width;
    return {
      x: runner.x - (w - runner.width) / 2,
      y: runner.y + (runner.height - h),
      width: w,
      height: h,
    };
  }
  if (runnerJump.active) {
    return {
      x: runner.x,
      y: runner.y + runnerJump.yOffset,
      width: runner.width,
      height: runner.height,
    };
  }
  return {
    x: runner.x,
    y: runner.y,
    width: runner.width,
    height: runner.height,
  };
}

function getChaserBounds() {
  if (chaserSlide.active) {
    const h = chaserSlide.height;
    const w = chaserSlide.width;
    return {
      x: chaser.x - (w - chaser.width) / 2,
      y: chaser.y + (chaser.height - h),
      width: w,
      height: h,
    };
  }
  if (chaserJump.active) {
    return {
      x: chaser.x,
      y: chaser.y + chaserJump.yOffset,
      width: chaser.width,
      height: chaser.height,
    };
  }
  return {
    x: chaser.x,
    y: chaser.y,
    width: chaser.width,
    height: chaser.height,
  };
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

function getCurrentWordPool() {
  const total = getTotalScore();
  if (total >= WORD_TIER_3_SCORE) return WORD_POOLS.hard;
  if (total >= WORD_TIER_2_SCORE) return WORD_POOLS.medium;
  return WORD_POOLS.easy;
}

function drawScore() {
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('SCORE: ' + getTotalScore(), canvas.width - 20, 20);
}
function getSlideDurationForDistance() {
  if (obstacles.length === 0) return SLIDE_DURATION;

  const runnerCenterX = runner.x + runner.width / 2;
  let minDist = Infinity;
  let closest = null;

  for (const o of obstacles) {
    if (!o.awaitingSlide && !o.cleared) continue;
    const obstacleCenterX = o.x + o.width / 2;
    const d = obstacleCenterX - runnerCenterX;
    if (d > 0 && d < minDist) {
      minDist = d;
      closest = o;
    }
  }

  if (!closest) return SLIDE_DURATION;

  const speed = getWorldSpeed();                    // ← define once
  const timeToReach = minDist / speed;
  const timeToPass = (closest.width + runner.width) / speed;   // ← use `speed`
  const airtime = timeToReach + timeToPass;

  return Math.max(0.5, Math.min(airtime, 1.8));
}

function checkActionTriggers() {
  if (runnerJump.active || runnerSlide.active) return;

  const runnerCenterX = runner.x + runner.width / 2;

  for (const o of obstacles) {
    const obstacleCenterX = o.x + o.width / 2;
    const distance = obstacleCenterX - runnerCenterX;

    // Jump trigger
    if (o.awaitingJump && distance <= JUMP_TRIGGER_DISTANCE) {
      triggerRunnerJump();
      o.awaitingJump = false;
      return;
    }

    // Slide trigger
    if (o.awaitingSlide && distance <= SLIDE_TRIGGER_DISTANCE) {
      triggerRunnerSlide();
      o.awaitingSlide = false;
      return;
    }
  }
}
function checkChaserAction() {
  if (chaserJump.active || chaserSlide.active) return;

  const chaserCX = chaser.x + chaser.width / 2;

  for (const o of obstacles) {
    if (!o.chaserDelay) continue;
    if (o.chaserJumped || o.chaserSlid) continue;

    const obstacleCenterX = o.x + o.width / 2;
    const gap = obstacleCenterX - chaserCX;

    if (gap > 0 && gap < CHASER_JUMP_CUE) {
      if (o.type === 'slide') {
        chaserSlide.active = true;
        chaserSlide.time = 0;
        chaserSlide.duration = CHASER_JUMP_DURATION;
        chaserSlide.targetId = o.id;
        o.chaserSlid = true;
      } else {
        chaserJump.active = true;
        chaserJump.time = 0;
        chaserJump.duration = CHASER_JUMP_DURATION;
        chaserJump.targetId = o.id;
        o.chaserJumped = true;
      }
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
  const speed = getWorldSpeed();
  const timeToReach = minDist / speed;
  const timeToPass = (runner.width + 40) / speed;
  const airtime = timeToReach + timeToPass;

  return Math.max(0.4, Math.min(airtime, 1.5));   // clamp
}
function triggerRunnerJump() {
  runnerJump.active = true;
  runnerJump.time = 0;
  runnerJump.duration = getJumpDurationForDistance();
}
function triggerRunnerSlide() {
  runnerSlide.active = true;
  runnerSlide.time = 0;
  runnerSlide.duration = getSlideDurationForDistance();
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

  // Full match → resolve the obstacle
  if (currentTyped === word) {
    targetedObstacle.cleared = true;
    targetedObstacle.chaserDelay = true;

    // Choose action based on obstacle type
    if (targetedObstacle.type === 'slide') {
      targetedObstacle.awaitingSlide = true;
    } else {
      targetedObstacle.awaitingJump = true;
    }

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
function updateSlide(slide, entity, delta) {
  if (!slide.active) return;

  slide.time += delta;

  if (slide.time >= slide.duration) {
    slide.active = false;
    slide.time = 0;
    slide.height = entity.height;
    slide.width = entity.width;
    if (slide === chaserSlide) slide.targetId = null;
    return;
  }

  const t = slide.time / slide.duration;
  const easeIn = Math.min(t * 5, 1);
  const easeOut = Math.min((1 - t) * 5, 1);
  const phase = Math.min(easeIn, easeOut);

  slide.height = entity.height + (SLIDE_HEIGHT - entity.height) * phase;
  slide.width = entity.width + (SLIDE_WIDTH - entity.width) * phase;
}

function update(delta) {
  console.log('score:', getTotalScore(), '| worldSpeed:', getWorldSpeed());
  const worldSpeed = getWorldSpeed();   // compute once per frame

  runnerAnim.timer += delta;
  if (runnerAnim.timer >= 1 / runnerAnim.fps) {
    runnerAnim.timer = 0;
    runnerAnim.frame = (runnerAnim.frame + 1) % RUN_FRAMES;
  }
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
  chaser.x -= worldSpeed * delta * CHASER_BLOCK_DRIFT;
} else if (dist > 1) {
  chaser.x += (dx / dist) * chaserSpeed * delta;
  chaser.y += (dy / dist) * chaserSpeed * delta;
}


  // --- Floor scroll ---
  floorScroll -= getWorldSpeed() * delta;
  if (floorScroll <= -80) floorScroll = 0;

  // --- Distance score ---
  distanceScore += worldSpeed * delta * SCORE_PER_PIXEL;

  for (let i = scorePopups.length - 1; i >= 0; i--) {
  scorePopups[i].life -= delta;
  scorePopups[i].y -= 40 * delta;   // drift upward
  if (scorePopups[i].life <= 0) scorePopups.splice(i, 1);
  }

  // --- Move obstacles ---

  obstacles.forEach(o => o.x -= worldSpeed * delta);

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
  checkActionTriggers();
  checkChaserAction();
  updateJump(runnerJump, delta);
  updateSlide(runnerSlide, runner, delta);
  

  // Handle the chaser's delayed jump
  const chaserJumpDelta = chaserStaggerTime > 0
  ? delta * CHASER_STAGGER_FACTOR
  : delta;
  updateJump(chaserJump, chaserJumpDelta);
  updateSlide(chaserSlide, chaser, chaserJumpDelta);

    // --- Collisions ---
  // --- Runner collision (uses visual bounds) ---
  const runnerBounds = getRunnerBounds();
  for (const o of obstacles) {
    if (rectsOverlap(o, runnerBounds)) {
    gameOver('An obstacle hit you!');
    return;
    }
  }

  // --- Chaser catches runner ---
  const chaserBounds = getChaserBounds();
  if (rectsOverlap(runnerBounds, chaserBounds)) {
    gameOver('The chaser caught you!');
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
const runnerH = runnerSlide.active ? runnerSlide.height : runner.height;
const runnerW = runnerSlide.active ? runnerSlide.width : runner.width;
const runnerX = runner.x - (runnerW - runner.width) / 2;
const runnerY = runner.y + (runner.height - runnerH) + runnerJump.yOffset;

// Debug reference rectangle (behind) — remove after tuning
ctx.fillStyle = '#4f4';
ctx.fillRect(runnerX, runnerY, runnerW, runnerH);

ctx.strokeStyle = '#2a2';
ctx.lineWidth = 2;
ctx.strokeRect(runnerX, runnerY, runnerW, runnerH);

// Sprite on top — scaled up, anchored to feet
if (runnerSheet.complete && runnerSheet.naturalWidth > 0) {
  const SPRITE_SCALE = 1.9;   // tune this

  const spriteW = runnerW * SPRITE_SCALE;
  const spriteH = runnerH * SPRITE_SCALE;
  const spriteX = runnerX + (runnerW - spriteW) / 2;   // center horizontally
  const spriteY = runnerY + (runnerH - spriteH);       // anchor bottom to feet

  const sx = runnerAnim.frame * FRAME_W;

  ctx.drawImage(
    runnerSheet,
    sx, 0, FRAME_W, FRAME_H,
    spriteX, spriteY, spriteW, spriteH
  );
}

// Chaser
const chaserH = chaserSlide.active ? chaserSlide.height : chaser.height;
const chaserW = chaserSlide.active ? chaserSlide.width : chaser.width;
const chaserX = chaser.x - (chaserW - chaser.width) / 2;
const chaserY = chaser.y + (chaser.height - chaserH);

ctx.fillStyle = chaserStaggerTime > 0 ? '#a55' : '#f44';
ctx.fillRect(
  chaserX,
  chaserY + chaserJump.yOffset,
  chaserW,
  chaserH
);
ctx.strokeStyle = chaserStaggerTime > 0 ? '#622' : '#a22';
ctx.strokeRect(
  chaserX,
  chaserY + chaserJump.yOffset,
  chaserW,
  chaserH
);

  
obstacles.forEach(o => {
  if (o.type === 'slide') {
    // Floating block placeholder
    ctx.fillStyle = o.cleared ? '#7a3d00' : '#f80';
    ctx.fillRect(o.x, o.y, o.width, o.height);

    // Support legs (simple, dark)
    const legTop = o.y + o.height;
    const legBottom = getFloorTop();
    ctx.fillStyle = '#000';

      // Two legs
    ctx.fillRect(o.x + 5, legTop, 6, legBottom - legTop);
    ctx.fillRect(o.x + o.width - 11, legTop, 6, legBottom - legTop);

      // Cross-brace between legs
    ctx.fillRect(o.x + 5, legTop + (legBottom - legTop) / 2, o.width - 10, 4);

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x, o.y, o.width, o.height);
  } else {
    // Ground square
    ctx.fillStyle = o.cleared ? '#7a3d00' : '#f80';
    ctx.fillRect(o.x, o.y, o.width, o.height);
  }

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
  const pool = getCurrentWordPool();
  const word = pool[Math.floor(Math.random() * pool.length)];

  // Decide type
  let type = 'jump';
  if (getTotalScore() >= SLIDE_UNLOCK_SCORE) {
    type = Math.random() < SLIDE_CHANCE_AFTER_UNLOCK ? 'slide' : 'jump';
  }

  if (type === 'slide') {
    const floorTop = getFloorTop();
    const obstacleH = SLIDE_OBSTACLE_HEIGHT;
    const obstacleW = SLIDE_OBSTACLE_WIDTH;
    const blockBottom = floorTop - SLIDE_OBSTACLE_GAP;

    obstacles.push({
      id: nextObstacleId++,
      x: canvas.width + 30,
      y: blockBottom - obstacleH,   // top of the block
      width: obstacleW,
      height: obstacleH,
      word: word,
      type: 'slide',
      cleared: false,
      awaitingJump: false,
      awaitingSlide: false,
      chaserDelay: false,
      chaserJumped: false,
      chaserSlid: false,
    });
  } else {
    const obstacleSize = 40;
    obstacles.push({
      id: nextObstacleId++,
      x: canvas.width + 30,
      y: getFloorTop() - obstacleSize,
      width: obstacleSize,
      height: obstacleSize,
      word: word,
      type: 'jump',
      cleared: false,
      awaitingJump: false,
      awaitingSlide: false,
      chaserDelay: false,
      chaserJumped: false,
      chaserSlid: false,
    });
  }
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

  runnerSlide.active = false;
  runnerSlide.time = 0;
  runnerSlide.height = ENTITY_HEIGHT;
  runnerSlide.width = ENTITY_WIDTH;

  chaserSlide.active = false;
  chaserSlide.time = 0;
  chaserSlide.height = ENTITY_HEIGHT;
  chaserSlide.width = ENTITY_WIDTH;
  chaserSlide.targetId = null;

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

  ctx.imageSmoothingEnabled = false;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

requestAnimationFrame(gameLoop);