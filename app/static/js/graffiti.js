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

    function applyStroke(tool, color, strokeSize, lx, ly, x, y) {
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
            for (let i = 0; i < 40; i++) {
                const offset = getRandomOffset(strokeSize * 1.33);
                ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
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
            applyStroke(msg.tool, msg.color, s, lx, ly, x, y);
        } else if (msg.type === 'fill') {
            fillAt(msg.nx * canvas.width, msg.ny * canvas.height, msg.color);
        } else if (msg.type === 'reset') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            ctx.fillStyle = CANVAS_BG;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        applyingRemote = false;
    }

    function initWS() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${proto}://${location.host}/ws/graffiti`);
        ws.binaryType = 'arraybuffer';

        ws.onmessage = (e) => {
            if (e.data instanceof ArrayBuffer) {
                const blob = new Blob([e.data], { type: 'image/png' });
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                    ctx.globalAlpha = 1;
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    URL.revokeObjectURL(url);
                };
                img.src = url;
                return;
            }
            const msg = JSON.parse(e.data);
            if (msg.type === 'req_state') {
                canvas.toBlob(blob => {
                    blob.arrayBuffer().then(buf => ws.send(buf));
                }, 'image/png');
                return;
            }
            applyRemoteEvent(msg);
        };

        ws.onclose = () => setTimeout(initWS, 2000);
    }

    function startDraw(e) {
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
        if (!drawing || currentTool === 'fill') return;
        e.preventDefault();
        const [x, y] = getPos(e);

        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = currentColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (currentTool === 'pen') {
            ctx.globalAlpha = 1.0;
            ctx.lineWidth = size;
            ctx.lineTo(x, y);
            ctx.stroke();
        } else if (currentTool === 'spray') {
            ctx.globalAlpha = 1.1;
            ctx.fillStyle = currentColor;
            const density = 40;
            for (let i = 0; i < density; i++) {
                const offset = getRandomOffset(size * 1.33);
                ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
            }
        } else if (currentTool === 'marker') {
            ctx.globalAlpha = 0.36;
            ctx.lineWidth = size;
            ctx.lineTo(x, y);
            ctx.stroke();
        }

        if (!applyingRemote) {
            sendEvent({
                type: 'stroke',
                tool: currentTool,
                color: currentColor,
                ns: size / canvas.width,
                nlx: lastX / canvas.width,
                nly: lastY / canvas.height,
                nx: x / canvas.width,
                ny: y / canvas.height,
            });
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
