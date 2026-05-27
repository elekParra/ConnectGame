const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

const CONFIG = {
    size: 6,
    minPoints: 7,
    maxPoints: 9,
    minPathLength: 34
};

const DIRS = [
    [1,0],
    [-1,0],
    [0,1],
    [0,-1]
];

const game = {
    cell: 0,
    numbers: [],
    path: [],
    player: [],
    drawing: false,
    visited: new Set(),
    numberMap: new Map(),
    target: 1,
    pulse: null,
    invalidFlash: 0
};

function resizeCanvas(){
    const wrap = document.getElementById("gameWrap");
    const size = wrap.clientWidth;

    canvas.width = size;
    canvas.height = size;

    game.cell = canvas.width / CONFIG.size;

    draw();
}

window.addEventListener("resize", resizeCanvas);

function key(x,y){
    return `${x},${y}`;
}

function inBounds(x,y){
    return (
        x >= 0 &&
        y >= 0 &&
        x < CONFIG.size &&
        y < CONFIG.size
    );
}

function randomInt(n){
    return Math.floor(Math.random()*n);
}

function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        [arr[i],arr[j]] = [arr[j],arr[i]];
    }
    return arr;
}

function center(p){
    return [
        p.x * game.cell + game.cell/2,
        p.y * game.cell + game.cell/2
    ];
}

function generateLevel(){
    let attempts = 0;
    while(attempts < 200){
        attempts++;
        const result = buildPath();
        if(!result) continue;
        game.path = result;
        break;
    }

    buildNumbers();
    restart();
    draw();
}

function buildPath(){
    const path = [];

    let x = 2 + randomInt(CONFIG.size - 4);
    let y = 2 + randomInt(CONFIG.size - 4);

    path.push({x,y});

    const visited = new Set([key(x,y)]);
    let lastDir = null;

    while(path.length < CONFIG.minPathLength){
        let candidates = [];

        for(const [dx,dy] of shuffle([...DIRS])){
            const nx = x + dx;
            const ny = y + dy;

            if(!inBounds(nx,ny)) continue;

            const k = key(nx,ny);
            if(visited.has(k)) continue;

            let score = 0;

            if(lastDir &&
               lastDir[0] === dx &&
               lastDir[1] === dy){
                score -= 1.5;
            }

            const centerDist =
                Math.abs(nx - CONFIG.size/2) +
                Math.abs(ny - CONFIG.size/2);

            score -= centerDist * 0.08;

            let freeNeighbors = 0;

            for(const [adx,ady] of DIRS){
                const tx = nx + adx;
                const ty = ny + ady;

                if(
                    inBounds(tx,ty) &&
                    !visited.has(key(tx,ty))
                ){
                    freeNeighbors++;
                }
            }

            score += freeNeighbors;

            candidates.push({
                nx, ny, dx, dy, score
            });
        }

        if(!candidates.length) return null;

        candidates.sort((a,b)=>b.score-a.score);

        const pick =
            candidates[
                randomInt(
                    Math.min(3,candidates.length)
                )
            ];

        x = pick.nx;
        y = pick.ny;
        lastDir = [pick.dx,pick.dy];

        visited.add(key(x,y));
        path.push({x,y});
    }

    return path;
}

function buildNumbers(){
    game.numbers = [];
    game.numberMap.clear();

    const total =
        CONFIG.minPoints +
        randomInt(
            CONFIG.maxPoints -
            CONFIG.minPoints + 1
        );

    const spacing =
        Math.floor(
            game.path.length / total
        );

    for(let i=0;i<total;i++){
        let idx =
            i * spacing +
            randomInt(2);

        idx = Math.min(
            idx,
            game.path.length - 1
        );

        const p = game.path[idx];

        const obj = {
            x:p.x,
            y:p.y,
            num:i+1
        };

        game.numbers.push(obj);

        game.numberMap.set(
            key(p.x,p.y),
            obj
        );
    }
}

function restart(){
    game.player = [];
    game.visited.clear();
    game.target = 1;
}

function undo(){
    if(!game.player.length) return;

    game.player.pop();
    game.visited.clear();

    for(const p of game.player){
        game.visited.add(
            key(p.x,p.y)
        );
    }

    game.target = 1;

    for(const p of game.player){
        const n =
            game.numberMap.get(
                key(p.x,p.y)
            );

        if(n && n.num >= game.target){
            game.target = n.num + 1;
        }
    }

    draw();
}

function drawGrid(){
    for(let y=0;y<CONFIG.size;y++){
        for(let x=0;x<CONFIG.size;x++){
            ctx.strokeStyle =
                "rgba(255,255,255,.08)";

            ctx.strokeRect(
                x*game.cell,
                y*game.cell,
                game.cell,
                game.cell
            );
        }
    }
}

function drawPlayer(){
    if(game.player.length < 2) return;

    ctx.beginPath();
    const start = center(game.player[0]);
    ctx.moveTo(...start);

    for(let i=1;i<game.player.length;i++){
        const p = center(game.player[i]);
        ctx.lineTo(...p);
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = game.cell * 0.70;
    ctx.strokeStyle = "rgba(255,255,255,.22)";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(...start);

    for(let i=1;i<game.player.length;i++){
        const p = center(game.player[i]);
        ctx.lineTo(...p);
    }

    ctx.lineWidth = game.cell * 0.42;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
}

function drawNumbers(){
    const now = performance.now();

    for(const n of game.numbers){
        const [cx,cy] = center(n);

        const pulse =
            game.pulse === n.num
            ? Math.sin(now * 0.015) * 4
            : 0;

        const r = game.cell * 0.32 + pulse;

        ctx.beginPath();
        ctx.fillStyle = "rgba(0,0,0,.22)";
        ctx.arc(cx,cy,r+6,0,Math.PI*2);
        ctx.fill();

        const grad =
            ctx.createRadialGradient(
                cx-r*0.3,
                cy-r*0.3,
                2,
                cx,
                cy,
                r
            );

        grad.addColorStop(0,"#fff");
        grad.addColorStop(1,"#9f9f9f");

        ctx.beginPath();
        ctx.fillStyle = grad;
        ctx.arc(cx,cy,r,0,Math.PI*2);
        ctx.fill();

        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255,255,255,.8)";
        ctx.stroke();

        ctx.fillStyle = "#222";
        ctx.font = `bold ${game.cell*0.4}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillText(n.num,cx,cy);
    }
}

function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);

    if(game.invalidFlash > 0){
        ctx.save();
        ctx.translate(
            Math.sin(performance.now()*0.01)*2,
            0
        );
    }

    drawGrid();
    drawPlayer();
    drawNumbers();

    if(game.invalidFlash > 0){
        ctx.restore();
        game.invalidFlash--;
    }
}

function pulse(num){
    game.pulse = num;

    if(navigator.vibrate)
        navigator.vibrate(20);

    setTimeout(()=>{
        if(game.pulse === num)
            game.pulse = null;
    },220);
}

function invalidMove(){
    game.invalidFlash = 10;
    draw();
}

function getCell(e){
    const rect = canvas.getBoundingClientRect();

    return {
        x: Math.floor(
            (e.clientX - rect.left) / game.cell
        ),
        y: Math.floor(
            (e.clientY - rect.top) / game.cell
        )
    };
}

canvas.addEventListener(
    "pointerdown",
    e=>{
        game.drawing = true;
        handleMove(e);
    }
);

canvas.addEventListener(
    "pointermove",
    e=>{
        if(!game.drawing) return;
        handleMove(e);
    }
);

window.addEventListener(
    "pointerup",
    ()=>{
        game.drawing = false;
    }
);

function handleMove(e){
    const {x,y} = getCell(e);

    if(!inBounds(x,y)) return;

    if(!game.player.length){
        const start = game.numbers[0];

        if(
            x === start.x &&
            y === start.y
        ){
            game.player.push({x,y});
            game.visited.add(key(x,y));
            game.target = 2;

            pulse(1);
            draw();
        }
        return;
    }

    const last =
        game.player[
            game.player.length - 1
        ];

    const dist =
        Math.abs(last.x-x) +
        Math.abs(last.y-y);

    if(dist !== 1){
        invalidMove();
        return;
    }

    const k = key(x,y);

    if(game.visited.has(k)){
        invalidMove();
        return;
    }

    const hit = game.numberMap.get(k);

    if(hit && hit.num !== game.target){
        invalidMove();
        return;
    }

    game.player.push({x,y});
    game.visited.add(k);

    if(hit){
        pulse(hit.num);
        game.target++;
    }

    draw();

    if(game.target > game.numbers.length){
        setTimeout(()=>{
            alert("✅ Nivel completado");
            generateLevel();
        },120);
    }
}

function animationLoop(){
    draw();
    requestAnimationFrame(animationLoop);
}

resizeCanvas();
generateLevel();
animationLoop();