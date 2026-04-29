(function () {
    const canvas = document.getElementById('graffiti-canvas');
    const ctx = canvas.getContext('2d');
    const wrap = document.getElementById('canvas-wrap');

    const CANVAS_BG = '#f0f2e2';
    const PEN_COLOR = '#1a1a1a';

    let size = 12;
    let drawing = false;
    let lastX = 0;
    let lastY = 0;

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

    function startDraw(e) {
        e.preventDefault();
        drawing = true;
        [lastX, lastY] = getPos(e);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
    }

    function draw(e) {
        if (!drawing) return;
        e.preventDefault();
        const [x, y] = getPos(e);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.strokeStyle = PEN_COLOR;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = size;
        ctx.lineTo(x, y);
        ctx.stroke();
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
    }

    const sizeSlider = document.getElementById('size-slider');
    const sizeVal = document.getElementById('size-val');
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
})();
