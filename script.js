const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d", { alpha: false });

const targetUI = document.getElementById("target");
const timerBar = document.getElementById("timerBar");

/* ✅ TIMER CONFIG */
let TIME_MIN = 7;
let TIME_MAX = 12;

let timeStart = 0;
let timeLimit = 8000;

function startTimer() {
  timeLimit = (TIME_MIN + Math.random() * (TIME_MAX - TIME_MIN)) * 1000;
  timeStart = performance.now();
}

function updateTimer() {
  const t = (performance.now() - timeStart) / timeLimit;
  const p = Math.max(0, 1 - t);

  timerBar.style.transform = `scaleX(${p})`;

  if (p <= 0) {
    restart();
    startTimer();
  }
}

/* ✅ AUDIO */
let audioCtx;
function tone(freq) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();

  o.frequency.value = freq;
  g.gain.value = 0.05;

  o.connect(g);
  g.connect(audioCtx.destination);

  o.start();
  o.stop(audioCtx.currentTime + 0.05);
}

/* CONFIG */
const CONFIG = {
  size: 6,
  minPoints: 9,
  maxPoints: 11,
  minPathLength: 34,
};

const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];

const game = {
  cell: 0,
  numbers: [],
  path: [],
  player: [],
  drawing: false,
  visited: new Set(),
  numberMap: new Map(),
  target: 1,
  pulse: null
};

/* ✅ CANVAS */
function resizeCanvas() {
  const wrap = document.getElementById("gameWrap").clientWidth;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = wrap * dpr;
  canvas.height = wrap * dpr;
  canvas.style.width = wrap + "px";
  canvas.style.height = wrap + "px";

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  game.cell = wrap / CONFIG.size;
}
window.addEventListener("resize", resizeCanvas);

/* utils */
function key(x,y){return `${x},${y}`;}
function inBounds(x,y){return x>=0&&y>=0&&x<CONFIG.size&&y<CONFIG.size;}
function randomInt(n){return Math.floor(Math.random()*n);}
function center(p){
  return [p.x*game.cell + game.cell/2, p.y*game.cell + game.cell/2];
}

/* ✅ PATH */
function buildPath(){
  const path=[];
  let x=2+randomInt(CONFIG.size-4);
  let y=2+randomInt(CONFIG.size-4);

  path.push({x,y});
  const visited=new Set([key(x,y)]);
  let lastDir=null;

  while(path.length<CONFIG.minPathLength){
    let candidates=[];

    for(const [dx,dy] of DIRS){
      const nx=x+dx, ny=y+dy;
      if(!inBounds(nx,ny)) continue;
      if(visited.has(key(nx,ny))) continue;

      let free=0;
      for(const [adx,ady] of DIRS){
        const tx=nx+adx, ty=ny+ady;
        if(inBounds(tx,ty)&&!visited.has(key(tx,ty))) free++;
      }

      candidates.push({nx,ny,dx,dy,score:free});
    }

    if(!candidates.length) return null;

    const pick=candidates[randomInt(candidates.length)];

    x=pick.nx;
    y=pick.ny;
    lastDir=[pick.dx,pick.dy];

    visited.add(key(x,y));
    path.push({x,y});
  }

  return path;
}

/* ✅ NUMBERS */
function buildNumbers(){
  game.numbers=[];
  game.numberMap.clear();

  const total = CONFIG.minPoints + randomInt(CONFIG.maxPoints - CONFIG.minPoints + 1);
  const spacing = Math.floor(game.path.length / total);

  for(let i=0;i<total;i++){
    const idx=Math.min(i*spacing,game.path.length-1);
    const p=game.path[idx];

    const obj={x:p.x,y:p.y,num:i+1};
    game.numbers.push(obj);
    game.numberMap.set(key(p.x,p.y), obj);
  }
}

function generateLevel(){
  let attempts=0;

  while(attempts<200){
    const p=buildPath();
    if(p){ game.path=p; break; }
    attempts++;
  }

  buildNumbers();
  restart();
  startTimer();
}

/* GAME */
function restart(){
  game.player=[];
  game.visited.clear();
  game.target=1;
  updateUI();
}

function undo(){
  if(!game.player.length) return;

  game.player.pop();

  game.visited.clear();
  for(const p of game.player)
    game.visited.add(key(p.x,p.y));

  game.target=1;
  for(const p of game.player){
    const n=game.numberMap.get(key(p.x,p.y));
    if(n && n.num>=game.target)
      game.target=n.num+1;
  }

  updateUI();
}

/* RENDER */
function drawGrid(){
  for(let x=0;x<CONFIG.size;x++){
    for(let y=0;y<CONFIG.size;y++){
      ctx.fillStyle = (x+y)%2 ? "#1b1b1b" : "#191919";
      ctx.fillRect(x*game.cell, y*game.cell, game.cell, game.cell);
    }
  }
}

function drawPlayer(){
  if(game.player.length<2) return;

  ctx.lineCap="round";
  ctx.lineJoin="round";
  ctx.lineWidth=game.cell*0.5;

  const pts=game.player.map(center);

  ctx.beginPath();
  ctx.moveTo(...pts[0]);

  for(let i=1;i<pts.length;i++){
    const mx=(pts[i-1][0]+pts[i][0])/2;
    const my=(pts[i-1][1]+pts[i][1])/2;
    ctx.quadraticCurveTo(pts[i-1][0],pts[i-1][1],mx,my);
  }

  ctx.lineTo(...pts.at(-1));

  const grad=ctx.createLinearGradient(...pts[0],...pts.at(-1));
  grad.addColorStop(0,"#4facfe");
  grad.addColorStop(1,"#f6d365");

  ctx.strokeStyle=grad;
  ctx.stroke();
}

function drawNumbers(){
  for(const n of game.numbers){
    const [cx,cy]=center(n);

    ctx.beginPath();
    ctx.arc(cx,cy,game.cell*0.28,0,Math.PI*2);
    ctx.fillStyle=`hsl(${(n.num/game.numbers.length)*120},70%,60%)`;
    ctx.fill();

    ctx.fillStyle="#000";
    ctx.font=`bold ${game.cell*0.42}px Arial`;
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.fillText(n.num,cx,cy);
  }
}

function draw(){
  ctx.fillStyle="#181818";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  drawGrid();
  drawPlayer();
  drawNumbers();
}

/* INPUT */
function getCell(e){
  const r=canvas.getBoundingClientRect();
  return {
    x:Math.floor((e.clientX-r.left)/game.cell),
    y:Math.floor((e.clientY-r.top)/game.cell)
  };
}

canvas.addEventListener("pointerdown",e=>{
  game.drawing=true;
  handleMove(e);
});

canvas.addEventListener("pointermove",e=>{
  if(game.drawing) handleMove(e);
});

window.addEventListener("pointerup",()=>game.drawing=false);

function handleMove(e){
  const {x,y}=getCell(e);

  if(!inBounds(x,y)) return;

  if(!game.player.length){
    const start=game.numbers[0];
    if(x===start.x && y===start.y){
      game.player.push({x,y});
      game.visited.add(key(x,y));
      game.target=2;
      tone(500);
      updateUI();
    }
    return;
  }

  const last=game.player.at(-1);
  const dist=Math.abs(last.x-x)+Math.abs(last.y-y);
  if(dist!==1) return;

  const k=key(x,y);
  if(game.visited.has(k)) return;

  const hit=game.numberMap.get(k);
  if(hit && hit.num!==game.target) return;

  game.player.push({x,y});
  game.visited.add(k);

  tone(300+game.target*40);

  if(hit){
    game.target++;
  }

  updateUI();

  if(game.target>game.numbers.length){
    tone(900);
    setTimeout(()=>{
      alert("✅ Nivel completado");
      generateLevel();
    },120);
  }
}

function updateUI(){
  targetUI.textContent="Next: "+game.target;
}

/* LOOP */
function loop(){
  draw();
  updateTimer();
  requestAnimationFrame(loop);
}

/* INIT */
resizeCanvas();
generateLevel();
loop();