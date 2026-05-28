const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

const targetUI = document.getElementById("target");
const cellsUI = document.getElementById("cells");
const timerUI = document.getElementById("timer");
const timeBar = document.getElementById("timeBar");

/* ================= CONFIG ================= */

const CONFIG = {
    size: 6,
    minPoints: 7,
    maxPoints: 9
};

const TIMER = {
    min: 12,
    max: 20
};

/* ================= STATE ================= */

const game = {
    cell: 0,
    boardSize: 0,
    pixelRatio: 1,
    numbers: [],
    player: [],
    visited: new Set(),
    numberMap: new Map(),
    target: 1,
    drawing: false,
    timeLeft: 0,
    maxTime: 0,
    lastTime: 0,
    path: [],
    completed: false
};

/* ================= HELPERS ================= */

function key(x,y){
    return x + "," + y;
}

function rand(n){
    return Math.floor(Math.random() * n);
}

function shuffle(arr){
    for(let i = arr.length - 1; i > 0; i--){
        const j = rand(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    return arr;
}

function center(p){
    return [
        p.x * game.cell + game.cell / 2,
        p.y * game.cell + game.cell / 2
    ];
}

function totalCells(){
    return CONFIG.size * CONFIG.size;
}

function numbersComplete(){
    return game.target > game.numbers.length;
}

function gridComplete(){
    return game.visited.size === totalCells();
}

function inBounds(x,y){
    return (
        x >= 0 &&
        y >= 0 &&
        x < CONFIG.size &&
        y < CONFIG.size
    );
}

/* ================= AUDIO ================= */

let audioCtx = null;
let lastSoundTime = 0;

function ensureAudio(){
    if(!audioCtx){
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if(audioCtx.state === "suspended"){
        audioCtx.resume();
    }
}

function playTone(freq,duration = 0.045,type = "sine",volume = 0.045){
    if(!audioCtx) return;

    const now = audioCtx.currentTime;

    if(now - lastSoundTime < 0.025) return;
    lastSoundTime = now;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.01);
}

function playMoveSound(){
    playTone(460,0.04,"sine",0.032);
}

function playBackSound(){
    playTone(220,0.045,"triangle",0.032);
}

function playHitSound(){
    playTone(720,0.07,"sine",0.045);
}

function playCompleteSound(){
    playTone(880,0.08,"sine",0.05);
    setTimeout(() => playTone(1180,0.1,"sine",0.045), 80);
}

/* ================= HAPTICS ================= */

function vibrate(pattern){
    if(navigator.vibrate){
        navigator.vibrate(pattern);
    }
}

/* ================= RESIZE ================= */

function resizeCanvas(){
    const wrap = document.getElementById("gameWrap");
    const size = Math.floor(wrap.clientWidth);

    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    game.boardSize = size;
    game.pixelRatio = ratio;
    game.cell = size / CONFIG.size;

    canvas.style.width = size + "px";
    canvas.style.height = size + "px";

    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);

    ctx.setTransform(ratio,0,0,ratio,0,0);

    draw();
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", () => {
    setTimeout(resizeCanvas, 250);
});

/* ================= TIMER ================= */

function startTimer(){
    game.maxTime = TIMER.min + Math.random() * (TIMER.max - TIMER.min);
    game.timeLeft = game.maxTime;
    game.lastTime = 0;
}

function updateTimer(dt){
    if(game.completed) return;

    game.timeLeft -= dt;

    if(game.timeLeft <= 0){
        game.timeLeft = 0;
        timerUI.textContent = "Time: 0.0";
        timeBar.style.width = "0%";

        vibrate([30,20,30]);
        playTone(140,0.16,"triangle",0.04);

        restart();
        return;
    }

    timerUI.textContent = "Time: " + game.timeLeft.toFixed(1);
    timeBar.style.width = (game.timeLeft / game.maxTime * 100) + "%";
}

/* ================= SOLVABLE RANDOM PATH GENERATION ================= */

const DIRS = [
    [1,0],
    [-1,0],
    [0,1],
    [0,-1]
];

function availableNeighbors(x,y,visited){
    const result = [];

    for(const [dx,dy] of DIRS){
        const nx = x + dx;
        const ny = y + dy;

        if(inBounds(nx,ny) && !visited.has(key(nx,ny))){
            result.push({x:nx,y:ny});
        }
    }

    return result;
}

function onwardDegree(cell,visited){
    let count = 0;

    for(const [dx,dy] of DIRS){
        const nx = cell.x + dx;
        const ny = cell.y + dy;

        if(inBounds(nx,ny) && !visited.has(key(nx,ny))){
            count++;
        }
    }

    return count;
}

function connectedUnvisitedCount(visited){
    let start = null;

    for(let y = 0; y < CONFIG.size; y++){
        for(let x = 0; x < CONFIG.size; x++){
            if(!visited.has(key(x,y))){
                start = {x,y};
                break;
            }
        }

        if(start) break;
    }

    if(!start) return 0;

    const queue = [start];
    const seen = new Set([key(start.x,start.y)]);
    let count = 0;

    while(queue.length){
        const cell = queue.shift();
        count++;

        for(const [dx,dy] of DIRS){
            const nx = cell.x + dx;
            const ny = cell.y + dy;
            const k = key(nx,ny);

            if(
                inBounds(nx,ny) &&
                !visited.has(k) &&
                !seen.has(k)
            ){
                seen.add(k);
                queue.push({x:nx,y:ny});
            }
        }
    }

    return count;
}

function unvisitedIsConnected(visited){
    const remaining = totalCells() - visited.size;

    if(remaining <= 1) return true;

    return connectedUnvisitedCount(visited) === remaining;
}

function generateRandomHamiltonianPath(){
    const maxAttempts = 90;
    const maxSearchSteps = 12000;

    for(let attempt = 0; attempt < maxAttempts; attempt++){
        const start = {
            x: rand(CONFIG.size),
            y: rand(CONFIG.size)
        };

        const path = [start];
        const visited = new Set([key(start.x,start.y)]);
        let searchSteps = 0;

        function dfs(x,y){
            searchSteps++;

            if(searchSteps > maxSearchSteps){
                return false;
            }

            if(path.length === totalCells()){
                return true;
            }

            let options = availableNeighbors(x,y,visited);

            options = shuffle(options).sort((a,b) => {
                return onwardDegree(a,visited) - onwardDegree(b,visited);
            });

            for(const next of options){
                const k = key(next.x,next.y);

                visited.add(k);
                path.push(next);

                if(unvisitedIsConnected(visited) && dfs(next.x,next.y)){
                    return true;
                }

                path.pop();
                visited.delete(k);
            }

            return false;
        }

        if(dfs(start.x,start.y)){
            return path;
        }
    }

    return makeFallbackPath();
}

function makeFallbackPath(){
    let path = [];

    for(let y = 0; y < CONFIG.size; y++){
        if(y % 2 === 0){
            for(let x = 0; x < CONFIG.size; x++){
                path.push({x,y});
            }
        }else{
            for(let x = CONFIG.size - 1; x >= 0; x--){
                path.push({x,y});
            }
        }
    }

    const max = CONFIG.size - 1;
    const mode = rand(8);

    path = path.map(p => {
        const x = p.x;
        const y = p.y;

        if(mode === 1) return {x:max-x,y};
        if(mode === 2) return {x,y:max-y};
        if(mode === 3) return {x:max-x,y:max-y};
        if(mode === 4) return {x:y,y:x};
        if(mode === 5) return {x:max-y,y:x};
        if(mode === 6) return {x:y,y:max-x};
        if(mode === 7) return {x:max-y,y:max-x};

        return {x,y};
    });

    if(Math.random() < 0.5){
        path.reverse();
    }

    return path;
}

function scoreNumberSpread(path,total){
    const points = [];

    for(let i = 0; i < total; i++){
        const t = total === 1 ? 0 : i / (total - 1);
        const index = Math.round(t * (path.length - 1));
        points.push(path[index]);
    }

    let score = 0;

    for(let i = 1; i < points.length; i++){
        score +=
            Math.abs(points[i].x - points[i - 1].x) +
            Math.abs(points[i].y - points[i - 1].y);
    }

    return score;
}

function buildPathForLevel(total){
    let bestPath = null;
    let bestScore = -Infinity;

    const candidates = 5;

    for(let i = 0; i < candidates; i++){
        const candidate = generateRandomHamiltonianPath();
        const score = scoreNumberSpread(candidate,total);

        if(score > bestScore){
            bestScore = score;
            bestPath = candidate;
        }
    }

    return bestPath || makeFallbackPath();
}

function buildNumbers(){
    game.numbers = [];
    game.numberMap.clear();

    const total =
        CONFIG.minPoints +
        rand(CONFIG.maxPoints - CONFIG.minPoints + 1);

    game.path = buildPathForLevel(total);

    for(let i = 0; i < total; i++){
        const t = total === 1 ? 0 : i / (total - 1);
        const index = Math.round(t * (game.path.length - 1));
        const p = game.path[index];

        const obj = {
            x: p.x,
            y: p.y,
            num: i + 1
        };

        game.numbers.push(obj);
        game.numberMap.set(key(p.x,p.y), obj);
    }
}

/* ================= GAME FLOW ================= */

function restart(){
    game.player = [];
    game.visited.clear();
    game.target = 1;
    game.completed = false;

    startTimer();
    updateUI();
}

function generateLevel(){
    buildNumbers();
    restart();
}

function recomputeTarget(){
    game.target = 1;

    for(const p of game.player){
        const n = game.numberMap.get(key(p.x,p.y));

        if(n && n.num === game.target){
            game.target++;
        }
    }
}

function undo(){
    if(!game.player.length || game.completed) return;

    const last = game.player.pop();
    game.visited.delete(key(last.x,last.y));

    recomputeTarget();

    vibrate(8);
    playBackSound();

    updateUI();
}

function checkCompletion(){
    if(game.completed) return;

    if(numbersComplete() && gridComplete()){
        game.completed = true;

        updateUI();

        vibrate([40,30,40]);
        playCompleteSound();

        setTimeout(() => {
            generateLevel();
        }, 250);
    }
}

/* ================= DRAWING ================= */

function roundedRect(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawGrid(){
    ctx.clearRect(0,0,game.boardSize,game.boardSize);

    const radius = Math.max(18, game.cell * 0.16);

    ctx.save();

    roundedRect(0,0,game.boardSize,game.boardSize,radius);
    ctx.clip();

    const bg = ctx.createLinearGradient(0,0,game.boardSize,game.boardSize);
    bg.addColorStop(0,"#171717");
    bg.addColorStop(0.55,"#131313");
    bg.addColorStop(1,"#101010");

    ctx.fillStyle = bg;
    ctx.fillRect(0,0,game.boardSize,game.boardSize);

    for(let y = 0; y < CONFIG.size; y++){
        for(let x = 0; x < CONFIG.size; x++){
            const cellGrad = ctx.createLinearGradient(
                x * game.cell,
                y * game.cell,
                (x + 1) * game.cell,
                (y + 1) * game.cell
            );

            if((x + y) % 2 === 0){
                cellGrad.addColorStop(0,"rgba(255,255,255,0.045)");
                cellGrad.addColorStop(1,"rgba(255,255,255,0.022)");
            }else{
                cellGrad.addColorStop(0,"rgba(255,255,255,0.018)");
                cellGrad.addColorStop(1,"rgba(255,255,255,0.008)");
            }

            ctx.fillStyle = cellGrad;
            ctx.fillRect(
                x * game.cell,
                y * game.cell,
                game.cell,
                game.cell
            );
        }
    }

    ctx.strokeStyle = "rgba(255,255,255,0.095)";
    ctx.lineWidth = 1;

    for(let x = 0; x <= CONFIG.size; x++){
        const px = Math.round(x * game.cell) + 0.5;
        ctx.beginPath();
        ctx.moveTo(px,0);
        ctx.lineTo(px,game.boardSize);
        ctx.stroke();
    }

    for(let y = 0; y <= CONFIG.size; y++){
        const py = Math.round(y * game.cell) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0,py);
        ctx.lineTo(game.boardSize,py);
        ctx.stroke();
    }

    ctx.restore();
}

function drawPlayer(){
    if(game.player.length < 2) return;

    const start = center(game.player[0]);
    const end = center(game.player[game.player.length - 1]);

    const grad = ctx.createLinearGradient(...start,...end);
    grad.addColorStop(0,"#58b7ff");
    grad.addColorStop(1,"#f6d365");

    ctx.save();

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(...start);

    for(let i = 1; i < game.player.length; i++){
        ctx.lineTo(...center(game.player[i]));
    }

    ctx.shadowColor = "rgba(255,255,255,.82)";
    ctx.shadowBlur = 14;
    ctx.lineWidth = game.cell * 0.52;
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.stroke();

    ctx.shadowBlur = 8;
    ctx.lineWidth = game.cell * 0.42;
    ctx.strokeStyle = grad;
    ctx.stroke();

    ctx.shadowBlur = 0;

    const headGlow = ctx.createRadialGradient(
        end[0],
        end[1],
        0,
        end[0],
        end[1],
        game.cell * 0.22
    );

    headGlow.addColorStop(0,"rgba(255,255,255,.25)");
    headGlow.addColorStop(1,"rgba(255,255,255,0)");

    ctx.beginPath();
    ctx.fillStyle = headGlow;
    ctx.arc(end[0],end[1],game.cell * 0.22,0,Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawNumbers(){
    const now = performance.now();

    for(const n of game.numbers){
        const [cx,cy] = center(n);
        const radius = game.cell * 0.305;

        const isNext = n.num === game.target;
        const reached = n.num < game.target;

        const pulse = isNext
            ? Math.sin(now * 0.008) * game.cell * 0.012
            : 0;

        const r = radius + pulse;

        ctx.save();

        const ambient = ctx.createRadialGradient(
            cx,
            cy,
            r * 0.45,
            cx,
            cy,
            r * 1.55
        );

        ambient.addColorStop(0, isNext
            ? "rgba(255,178,107,.35)"
            : "rgba(255,138,61,.18)"
        );
        ambient.addColorStop(1,"rgba(255,138,61,0)");

        ctx.fillStyle = ambient;
        ctx.beginPath();
        ctx.arc(cx,cy,r * 1.55,0,Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = "rgba(0,0,0,.42)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 5;

        const body = ctx.createRadialGradient(
            cx - r * 0.42,
            cy - r * 0.42,
            r * 0.08,
            cx,
            cy,
            r
        );

        body.addColorStop(0,"#FFE0B5");
        body.addColorStop(0.32,"#FFBE78");
        body.addColorStop(0.72,"#FF9448");
        body.addColorStop(1,"#EF7432");

        ctx.beginPath();
        ctx.fillStyle = body;
        ctx.arc(cx,cy,r,0,Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        ctx.lineWidth = Math.max(1.5, game.cell * 0.018);
        ctx.strokeStyle = "rgba(255,255,255,.34)";
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx,cy,r * 0.86,0,Math.PI * 2);
        ctx.lineWidth = Math.max(1, game.cell * 0.012);
        ctx.strokeStyle = "rgba(120,45,0,.12)";
        ctx.stroke();

        const gloss = ctx.createRadialGradient(
            cx - r * 0.34,
            cy - r * 0.42,
            0,
            cx - r * 0.34,
            cy - r * 0.42,
            r * 0.58
        );

        gloss.addColorStop(0,"rgba(255,255,255,.32)");
        gloss.addColorStop(0.55,"rgba(255,255,255,.10)");
        gloss.addColorStop(1,"rgba(255,255,255,0)");

        ctx.beginPath();
        ctx.fillStyle = gloss;
        ctx.arc(
            cx - r * 0.18,
            cy - r * 0.22,
            r * 0.55,
            0,
            Math.PI * 2
        );
        ctx.fill();

        if(reached){
            ctx.beginPath();
            ctx.arc(cx,cy,r * 1.05,0,Math.PI * 2);
            ctx.lineWidth = Math.max(2, game.cell * 0.018);
            ctx.strokeStyle = "rgba(255,209,153,.34)";
            ctx.stroke();
        }

        ctx.font = `900 ${game.cell * 0.365}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.shadowColor = "rgba(255,236,210,.35)";
        ctx.shadowBlur = 2;
        ctx.fillStyle = "#2b1608";

        ctx.fillText(n.num,cx,cy + game.cell * 0.008);

        ctx.restore();
    }
}

function draw(){
    if(!game.boardSize) return;

    drawGrid();
    drawPlayer();
    drawNumbers();
}

/* ================= INPUT ================= */

function getCell(e){
    const rect = canvas.getBoundingClientRect();

    return {
        x: Math.floor((e.clientX - rect.left) / game.cell),
        y: Math.floor((e.clientY - rect.top) / game.cell)
    };
}

canvas.addEventListener("pointerdown", e => {
    e.preventDefault();

    ensureAudio();

    if(canvas.setPointerCapture){
        canvas.setPointerCapture(e.pointerId);
    }

    game.drawing = true;
    handleMove(e);
});

canvas.addEventListener("pointermove", e => {
    if(game.drawing){
        e.preventDefault();
        handleMove(e);
    }
});

canvas.addEventListener("pointercancel", e => {
    if(canvas.releasePointerCapture){
        try{
            canvas.releasePointerCapture(e.pointerId);
        }catch(err){}
    }

    game.drawing = false;
});

window.addEventListener("pointerup", e => {
    if(canvas.releasePointerCapture){
        try{
            canvas.releasePointerCapture(e.pointerId);
        }catch(err){}
    }

    game.drawing = false;
});

function handleMove(e){
    if(game.completed) return;

    const {x,y} = getCell(e);

    if(x < 0 || y < 0 || x >= CONFIG.size || y >= CONFIG.size) return;

    if(!game.player.length){
        const start = game.numbers[0];

        if(x === start.x && y === start.y){
            game.player.push({x,y});
            game.visited.add(key(x,y));
            game.target = 2;

            vibrate(10);
            playMoveSound();
            updateUI();
            checkCompletion();
        }

        return;
    }

    const last = game.player[game.player.length - 1];
    const prev = game.player[game.player.length - 2];

    const dist =
        Math.abs(last.x - x) +
        Math.abs(last.y - y);

    if(dist !== 1) return;

    const k = key(x,y);

    if(prev && x === prev.x && y === prev.y){
        game.player.pop();
        game.visited.delete(key(last.x,last.y));

        recomputeTarget();

        vibrate(8);
        playBackSound();

        updateUI();
        return;
    }

    if(game.visited.has(k)) return;

    const hit = game.numberMap.get(k);

    if(hit && hit.num !== game.target) return;

    game.player.push({x,y});
    game.visited.add(k);

    vibrate(10);
    playMoveSound();

    if(hit && hit.num === game.target){
        game.target++;
        vibrate([15,20,15]);
        playHitSound();
    }

    updateUI();
    checkCompletion();
}

/* ================= UI ================= */

function updateUI(){
    if(numbersComplete() && !gridComplete()){
        targetUI.textContent = "Fill grid";
    }else if(game.completed){
        targetUI.textContent = "Complete!";
    }else{
        targetUI.textContent = "Next: " + game.target;
    }

    cellsUI.textContent =
        `Cells: ${game.visited.size} / ${totalCells()}`;
}

/* ================= LOOP ================= */

function loop(t){
    if(!game.lastTime){
        game.lastTime = t;
    }

    const dt = (t - game.lastTime) / 1000;
    game.lastTime = t;

    updateTimer(dt);
    draw();

    requestAnimationFrame(loop);
}

/* ================= START ================= */

resizeCanvas();
generateLevel();
requestAnimationFrame(loop);