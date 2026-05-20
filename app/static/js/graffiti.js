(function () {
    const canvas = document.getElementById('graffiti-canvas');
    const ctx = canvas.getContext('2d');
    const wrap = document.getElementById('canvas-wrap');

    const CANVAS_BG = '#f0f2e2';
    const DEFAULT_COLOR = '#111111';

    let size = 12;
    let drawing = false;
    let lastX = 0;
    let lastY = 0;
    let currentTool = 'marker';
    let currentColor = DEFAULT_COLOR;
    let ws = null;
    let applyingRemote = false;
    let flashTimer = null;
    let countdownInterval = null;
    let canvasLocked = false;
    const seenThresholds = new Set();
    const WARN_THRESHOLDS = [
        { pct: 0.50, msg: '50% full — download to save your work' },
        { pct: 0.75, msg: '75% full' },
        { pct: 0.90, msg: '90% full — wall clears soon!' },
    ];

    function flashWarning(msg) {
        const overlay = document.getElementById('wipe-overlay');
        clearTimeout(flashTimer);
        overlay.textContent = msg;
        overlay.classList.add('active', 'warning');
        flashTimer = setTimeout(() => overlay.classList.remove('active', 'warning'), 1200);
    }

    document.getElementById('pen-btn').addEventListener('click', () => currentTool = 'pen');
    document.getElementById('spray-btn').addEventListener('click', () => currentTool = 'spray');
    document.getElementById('marker-btn').addEventListener('click', () => currentTool = 'marker');
    document.getElementById('fill-btn').addEventListener('click', () => currentTool = 'fill');

    function getRandomOffset(radius) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * radius;
        return {
            x: Math.cos(angle) * distance,
            y: Math.sin(angle) * distance,
        };
    }

    function hexToRgba(hex) {
        const value = hex.slice(1);
        return [
            parseInt(value.slice(0, 2), 16),
            parseInt(value.slice(2, 4), 16),
            parseInt(value.slice(4, 6), 16),
            255,
        ];
    }

    function colorsMatch(data, index, color) {
        return (
            data[index] === color[0] &&
            data[index + 1] === color[1] &&
            data[index + 2] === color[2] &&
            data[index + 3] === color[3]
        );
    }

    function setColor(data, index, color) {
        data[index] = color[0];
        data[index + 1] = color[1];
        data[index + 2] = color[2];
        data[index + 3] = color[3];
    }

    function fillAt(x, y, color) {
        const fillColor = hexToRgba(color || currentColor);
        const startX = Math.floor(x);
        const startY = Math.floor(y);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { data, width, height } = image;
        const startIndex = (startY * width + startX) * 4;
        const targetColor = [
            data[startIndex],
            data[startIndex + 1],
            data[startIndex + 2],
            data[startIndex + 3],
        ];

        if (targetColor.every((value, index) => value === fillColor[index])) {
            return;
        }

        const stack = [[startX, startY]];

        while (stack.length) {
            const [px, py] = stack.pop();

            if (px < 0 || px >= width || py < 0 || py >= height) {
                continue;
            }

            const index = (py * width + px) * 4;
            if (!colorsMatch(data, index, targetColor)) {
                continue;
            }

            setColor(data, index, fillColor);
            stack.push([px + 1, py]);
            stack.push([px - 1, py]);
            stack.push([px, py + 1]);
            stack.push([px, py - 1]);
        }

        ctx.putImageData(image, 0, 0);
    }

    function applyStroke(tool, color, strokeSize, lx, ly, x, y, dots) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (tool === 'pen') {
            ctx.globalAlpha = 1.0;
            ctx.lineWidth = strokeSize;
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(x, y);
            ctx.stroke();
        } else if (tool === 'spray') {
            ctx.globalAlpha = 1.1;
            ctx.fillStyle = color;
            if (dots) {
                for (let i = 0; i < dots.length; i += 2) {
                    ctx.fillRect(x + dots[i] * canvas.width, y + dots[i + 1] * canvas.height, 1, 1);
                }
            } else {
                for (let i = 0; i < 40; i++) {
                    const offset = getRandomOffset(strokeSize * 1.33);
                    ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
                }
            }
        } else if (tool === 'marker') {
            ctx.globalAlpha = 0.36;
            ctx.lineWidth = strokeSize;
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    }

    function initCanvas() {
        const cs = window.getComputedStyle(wrap);
        const hPad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const w = Math.floor(wrap.clientWidth - hPad);
        const h = Math.floor(w * 0.625);
        canvas.width = w;
        canvas.height = h;
        ctx.fillStyle = CANVAS_BG;
        ctx.fillRect(0, 0, w, h);
    }

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const sx = canvas.width / rect.width;
        const sy = canvas.height / rect.height;
        const src = e.touches ? e.touches[0] : e;
        return [
            (src.clientX - rect.left) * sx,
            (src.clientY - rect.top) * sy,
        ];
    }

    function sendEvent(event) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(event));
        }
    }

    function applyRemoteEvent(msg) {
        applyingRemote = true;
        if (msg.type === 'stroke') {
            const x = msg.nx * canvas.width;
            const y = msg.ny * canvas.height;
            const lx = msg.nlx * canvas.width;
            const ly = msg.nly * canvas.height;
            const s = msg.ns * canvas.width;
            applyStroke(msg.tool, msg.color, s, lx, ly, x, y, msg.dots);
        } else if (msg.type === 'fill') {
            fillAt(msg.nx * canvas.width, msg.ny * canvas.height, msg.color);
        } else if (msg.type === 'reset') {
            seenThresholds.clear();
            clearTimeout(flashTimer);
            clearInterval(countdownInterval);
            if (msg.auto) {
                const overlay = document.getElementById('wipe-overlay');
                overlay.classList.remove('warning');
                canvasLocked = true;
                document.getElementById('reset-btn').disabled = true;
                overlay.classList.add('active', 'countdown');
                let secs = 10;
                overlay.textContent = `wall full — save now (${secs})`;
                countdownInterval = setInterval(() => {
                    secs--;
                    if (secs <= 0) {
                        clearInterval(countdownInterval);
                        canvasLocked = false;
                        document.getElementById('reset-btn').disabled = false;
                        overlay.textContent = 'wall cleared';
                        overlay.classList.remove('countdown');
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.globalAlpha = 1;
                        ctx.fillStyle = CANVAS_BG;
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        setTimeout(() => overlay.classList.remove('active'), 800);
                    } else {
                        overlay.textContent = `wall full — save now (${secs})`;
                    }
                }, 1000);
            } else {
                canvasLocked = false;
                const overlay = document.getElementById('wipe-overlay');
                overlay.classList.remove('active', 'warning', 'countdown');
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
                ctx.fillStyle = CANVAS_BG;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }
        applyingRemote = false;
    }

    function initWS() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${proto}://${location.host}/ws/graffiti`);

        ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.type === 'clients') {
                const el = document.getElementById('client-count');
                if (el) el.textContent = `${msg.count} online`;
                if (msg.maxEvents != null) {
                    const pct = msg.eventCount / msg.maxEvents;
                    const bar = document.getElementById('capacity-bar');
                    const label = document.getElementById('capacity-label');
                    if (bar) {
                        bar.style.width = `${Math.min(pct * 100, 100)}%`;
                        bar.classList.toggle('warn', pct >= 0.6 && pct < 0.85);
                        bar.classList.toggle('danger', pct >= 0.85);
                    }
                    if (label) label.textContent = `${msg.eventCount} / ${msg.maxEvents}`;
                    let toFlash = null;
                    for (const t of WARN_THRESHOLDS) {
                        if (pct >= t.pct && !seenThresholds.has(t.pct)) {
                            seenThresholds.add(t.pct);
                            toFlash = t;
                        }
                    }
                    if (toFlash) flashWarning(toFlash.msg);
                }
                return;
            }
            applyRemoteEvent(msg);
        };

        ws.onclose = () => setTimeout(initWS, 2000);
    }

    function startDraw(e) {
        if (canvasLocked) return;
        e.preventDefault();
        [lastX, lastY] = getPos(e);

        if (currentTool === 'fill') {
            fillAt(lastX, lastY, currentColor);
            if (!applyingRemote) {
                sendEvent({
                    type: 'fill',
                    color: currentColor,
                    nx: lastX / canvas.width,
                    ny: lastY / canvas.height,
                });
            }
            return;
        }

        drawing = true;
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
    }

    function draw(e) {
        if (!drawing || currentTool === 'fill' || canvasLocked) return;
        e.preventDefault();
        const [x, y] = getPos(e);

        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = currentColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        let sprayDots = null;

        if (currentTool === 'pen') {
            ctx.globalAlpha = 1.0;
            ctx.lineWidth = size;
            ctx.lineTo(x, y);
            ctx.stroke();
        } else if (currentTool === 'spray') {
            ctx.globalAlpha = 1.1;
            ctx.fillStyle = currentColor;
            sprayDots = [];
            for (let i = 0; i < 40; i++) {
                const offset = getRandomOffset(size * 1.33);
                ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
                sprayDots.push(offset.x / canvas.width, offset.y / canvas.height);
            }
        } else if (currentTool === 'marker') {
            ctx.globalAlpha = 0.36;
            ctx.lineWidth = size;
            ctx.lineTo(x, y);
            ctx.stroke();
        }

        if (!applyingRemote) {
            const event = {
                type: 'stroke',
                tool: currentTool,
                color: currentColor,
                ns: size / canvas.width,
                nlx: lastX / canvas.width,
                nly: lastY / canvas.height,
                nx: x / canvas.width,
                ny: y / canvas.height,
            };
            if (sprayDots) event.dots = sprayDots;
            sendEvent(event);
        }

        ctx.beginPath();
        ctx.moveTo(x, y);

        lastX = x;
        lastY = y;
    }

    function stopDraw() {
        drawing = false;
    }

    function resetCanvas() {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = CANVAS_BG;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (!applyingRemote) {
            sendEvent({ type: 'reset' });
        }
    }

    const sizeSlider = document.getElementById('size-slider');
    const sizeVal = document.getElementById('size-val');
    const swatches = document.querySelectorAll('.swatch');

    swatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            currentColor = swatch.dataset.color;
            swatches.forEach(item => item.classList.remove('active'));
            swatch.classList.add('active');
        });
    });

    sizeSlider.addEventListener('input', e => {
        size = parseInt(e.target.value, 10);
        sizeVal.textContent = size;
    });

    document.getElementById('reset-btn').addEventListener('click', resetCanvas);

    document.getElementById('save-btn').addEventListener('click', () => {
        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.download = 'graffiti.png';
            a.href = url;
            a.click();
            URL.revokeObjectURL(url);
        }, 'image/png');
    });

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDraw);

    initCanvas();
    initWS();
})();
