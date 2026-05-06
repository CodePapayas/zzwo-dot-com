const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function hexToRgba(hex) {
    const value = hex.slice(1);
    return [
        parseInt(value.slice(0, 2), 16),
        parseInt(value.slice(2, 4), 16),
        parseInt(value.slice(4, 6), 16),
        255,
    ];
}

function makeElement(overrides = {}) {
    return {
        listeners: {},
        dataset: {},
        textContent: '',
        classList: {
            classes: new Set(),
            add(name) {
                this.classes.add(name);
            },
            remove(name) {
                this.classes.delete(name);
            },
            contains(name) {
                return this.classes.has(name);
            },
        },
        addEventListener(type, handler) {
            this.listeners[type] = handler;
        },
        dispatch(type, event = {}) {
            if (this.listeners[type]) {
                this.listeners[type](event);
            }
        },
        click() {
            this.dispatch('click', { preventDefault() {} });
        },
        ...overrides,
    };
}

function createContext() {
    let canvas = null;
    let canvasWidth = 0;
    let canvasHeight = 0;

    const ctx = {
        fillStyle: '#000000',
        strokeStyle: '#000000',
        globalAlpha: 1,
        lineWidth: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        imageData: new Uint8ClampedArray(0),
        strokeCalls: [],
        fillRectCalls: [],
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {
            this.strokeCalls.push({
                strokeStyle: this.strokeStyle,
                globalAlpha: this.globalAlpha,
                lineWidth: this.lineWidth,
            });
        },
        fillRect(x, y, width, height) {
            this.fillRectCalls.push({
                x,
                y,
                width,
                height,
                fillStyle: this.fillStyle,
                globalAlpha: this.globalAlpha,
            });
            const color = hexToRgba(this.fillStyle);
            const startX = Math.max(0, Math.floor(x));
            const startY = Math.max(0, Math.floor(y));
            const endX = Math.min(canvas.width, Math.ceil(x + width));
            const endY = Math.min(canvas.height, Math.ceil(y + height));

            for (let py = startY; py < endY; py += 1) {
                for (let px = startX; px < endX; px += 1) {
                    const index = (py * canvas.width + px) * 4;
                    this.imageData[index] = color[0];
                    this.imageData[index + 1] = color[1];
                    this.imageData[index + 2] = color[2];
                    this.imageData[index + 3] = color[3];
                }
            }
        },
        getImageData() {
            return {
                data: new Uint8ClampedArray(this.imageData),
                width: canvas.width,
                height: canvas.height,
            };
        },
        putImageData(image) {
            this.imageData = new Uint8ClampedArray(image.data);
        },
        clearLogs() {
            this.strokeCalls = [];
            this.fillRectCalls = [];
        },
    };

    const penBtn = makeElement();
    const markerBtn = makeElement();
    const sprayBtn = makeElement();
    const fillBtn = makeElement();
    const resetBtn = makeElement();
    const saveBtn = makeElement();
    const sizeSlider = makeElement({ value: '12' });
    const sizeVal = makeElement({ textContent: '12' });
    const wrap = makeElement({ clientWidth: 120 });

    const swatches = [
        makeElement({ dataset: { color: '#111111' } }),
        makeElement({ dataset: { color: '#333333' } }),
        makeElement({ dataset: { color: '#555555' } }),
        makeElement({ dataset: { color: '#777777' } }),
        makeElement({ dataset: { color: '#999999' } }),
        makeElement({ dataset: { color: '#bbbbbb' } }),
        makeElement({ dataset: { color: '#dddddd' } }),
        makeElement({ dataset: { color: '#d10f6f' } }),
    ];
    swatches[0].classList.add('active');

    canvas = makeElement({
        getContext() {
            return ctx;
        },
        getBoundingClientRect() {
            return {
                left: 0,
                top: 0,
                width: this.width,
                height: this.height,
            };
        },
        toBlob(callback) {
            callback({});
        },
    });

    Object.defineProperty(canvas, 'width', {
        get() {
            return canvasWidth;
        },
        set(value) {
            canvasWidth = value;
            ctx.imageData = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);
        },
    });

    Object.defineProperty(canvas, 'height', {
        get() {
            return canvasHeight;
        },
        set(value) {
            canvasHeight = value;
            ctx.imageData = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);
        },
    });

    const elements = {
        'graffiti-canvas': canvas,
        'canvas-wrap': wrap,
        'pen-btn': penBtn,
        'marker-btn': markerBtn,
        'spray-btn': sprayBtn,
        'fill-btn': fillBtn,
        'reset-btn': resetBtn,
        'save-btn': saveBtn,
        'size-slider': sizeSlider,
        'size-val': sizeVal,
    };

    const document = {
        getElementById(id) {
            return elements[id];
        },
        querySelectorAll(selector) {
            if (selector === '.swatch') {
                return swatches;
            }
            return [];
        },
        createElement() {
            return makeElement();
        },
    };

    const context = {
        document,
        window: {
            getComputedStyle() {
                return {
                    paddingLeft: '10',
                    paddingRight: '10',
                };
            },
        },
        URL: {
            createObjectURL() {
                return 'blob:test';
            },
            revokeObjectURL() {},
        },
        Math,
        Uint8ClampedArray,
        console,
    };

    return { context, canvas, ctx, swatches, resetBtn, sizeSlider, sizeVal };
}

function loadGraffiti() {
    const script = fs.readFileSync(
        path.join(__dirname, '..', 'app', 'static', 'js', 'graffiti.js'),
        'utf8',
    );
    const env = createContext();
    vm.runInNewContext(script, env.context);
    env.ctx.clearLogs();
    return env;
}

function mouseEvent(canvas, x, y) {
    return {
        clientX: x,
        clientY: y,
        preventDefault() {},
        touches: null,
        target: canvas,
    };
}

test('pen draws solid stroke', () => {
    const { canvas, ctx, context } = loadGraffiti();

    context.document.getElementById('pen-btn').click();
    canvas.dispatch('mousedown', mouseEvent(canvas, 10, 10));
    canvas.dispatch('mousemove', mouseEvent(canvas, 30, 30));

    assert.equal(ctx.strokeCalls.length, 1);
    assert.deepEqual(ctx.strokeCalls[0], {
        strokeStyle: '#111111',
        globalAlpha: 1,
        lineWidth: 12,
    });
});

test('marker draws translucent stroke', () => {
    const { canvas, ctx, context } = loadGraffiti();

    context.document.getElementById('marker-btn').click();
    canvas.dispatch('mousedown', mouseEvent(canvas, 10, 10));
    canvas.dispatch('mousemove', mouseEvent(canvas, 30, 30));

    assert.equal(ctx.strokeCalls.length, 1);
    assert.equal(ctx.strokeCalls[0].globalAlpha, 0.36);
});

test('spray places dots', () => {
    const { canvas, ctx, context } = loadGraffiti();

    context.document.getElementById('spray-btn').click();
    canvas.dispatch('mousedown', mouseEvent(canvas, 10, 10));
    canvas.dispatch('mousemove', mouseEvent(canvas, 30, 30));

    assert.equal(ctx.fillRectCalls.length, 40);
    assert.equal(ctx.fillRectCalls[0].fillStyle, '#111111');
});

test('fill paints with selected swatch color', () => {
    const { canvas, ctx, context, swatches } = loadGraffiti();
    const dark = hexToRgba('#111111');

    ctx.imageData.set(dark, 0);
    ctx.imageData.set(dark, 8);
    ctx.imageData.set(dark, canvas.width * 4);
    ctx.imageData.set(dark, canvas.width * 4 + 8);

    swatches[7].click();
    context.document.getElementById('fill-btn').click();
    canvas.dispatch('mousedown', mouseEvent(canvas, 1, 0));

    const pixel = Array.from(ctx.imageData.slice(4, 8));
    assert.deepEqual(pixel, hexToRgba('#d10f6f'));
});

test('reset restores canvas background', () => {
    const { ctx, resetBtn } = loadGraffiti();

    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, 5, 5);
    resetBtn.click();

    const pixel = Array.from(ctx.imageData.slice(0, 4));
    assert.deepEqual(pixel, hexToRgba('#f0f2e2'));
});
