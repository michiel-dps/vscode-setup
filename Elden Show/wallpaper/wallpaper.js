'use strict'

// Living wallpaper, version 3 (18 Nov 2026: sharp picture, real mist).
// Layer 1 (WebGL): the real picture, read once per pixel so it stays sharp.
//   Its clouds and mist slowly change shape, drifting mist is drawn on top,
//   the wheat leans in gusts, the light changes, ghosts shimmer.
// Layer 2 (2D): leaves cut from the picture falling, gold dots, sparkles,
//   light rays, glows and birds.
// The scenes rotate with a slow crossfade.
// Positions are fractions of the full two-screen picture:
// x 0 = left edge of the left screen, x 1 = right edge of the right screen.
// JavaScript here is written without semicolons. The shader code (GLSL)
// needs them, there is no way around that in that language.

const glCanvas = document.getElementById('picture')
const fxCanvas = document.getElementById('effects')
const fadeCanvas = document.getElementById('fade')
const fx = fxCanvas.getContext('2d')

let W = 0
let H = 0
let S = 1
let gl = null
let program = null
let scene = null
let sceneId = ''
let things = []
let sprite = null
let textures = {}
let startTime = 0

const settings = {
  scene: 'rotate',
  minutes: 10,
  order: ['shadow']
}

// ---------- small helpers

function range(n) {
  return Array.from({ length: n }, (_, i) => i)
}

function between(lo, hi) {
  return lo + Math.random() * (hi - lo)
}

function rgba(c, alpha) {
  return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${alpha})`
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}

function softBlob(g, x, y, rx, ry, color, alpha) {
  g.save()
  g.translate(x, y)
  g.scale(1, ry / rx)
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx)
  grad.addColorStop(0, rgba(color, alpha))
  grad.addColorStop(1, rgba(color, 0))
  g.fillStyle = grad
  g.fillRect(-rx, -rx, rx * 2, rx * 2)
  g.restore()
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
}

function makeSprite() {
  const c = makeCanvas(32, 32)
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)')
  grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.6)')
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 32, 32)
  return c
}

const tinted = {}
function tintedSprite(color, dark) {
  const key = color.join(',') + (dark ? 'd' : '')
  if (!tinted[key]) {
    const c = makeCanvas(32, 32)
    const g = c.getContext('2d')
    g.drawImage(sprite, 0, 0)
    g.globalCompositeOperation = 'source-atop'
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
    grad.addColorStop(0, dark ? rgba(color, 1) : 'rgb(255, 250, 235)')
    grad.addColorStop(0.3, rgba(color, 1))
    grad.addColorStop(1, rgba(color, 1))
    g.fillStyle = grad
    g.fillRect(0, 0, 32, 32)
    tinted[key] = c
  }
  return tinted[key]
}

// ---------- layer 1: the picture on the GPU

const vertexCode = `
attribute vec2 corner;
varying vec2 uv;
void main() {
  uv = vec2(corner.x * 0.5 + 0.5, 0.5 - corner.y * 0.5);
  gl_Position = vec4(corner, 0.0, 1.0);
}
`

// The picture is read once per pixel, so it stays as sharp as the file.
// Nothing is blended from two shifted copies any more (that made the mist
// blurry). What moves:
//   - clouds and mist slowly change shape (a small, slow bend of the picture)
//   - real drifting mist is drawn on top, lit with the picture's own colours
//   - the wheat leans in gusts that travel over the field
//   - the light slowly brightens and dims, as under moving clouds
//   - the viewer drifts a few pixels, near things more than far ones
const fragmentCode = `
precision highp float;
varying vec2 uv;
uniform sampler2D picture;
uniform sampler2D haze;
uniform sampler2D noiseMap;
uniform sampler2D maskA;
uniform sampler2D maskB;
uniform float time;
uniform float sway;
uniform float warp;
uniform float mistAmount;
uniform float mistFloor;
uniform float wisps;
uniform float camera;
uniform float light;
uniform float grain;
uniform float pulseStrength;
uniform float wobble;
uniform vec2 size;
uniform vec2 frameShift;

void main() {
  // maskA: r = may change shape, g = mist, b = grass, a = how near
  // maskB: r = calm (no edges), g = ghosts, b = how much edges are guarded
  vec4 a = texture2D(maskA, uv);
  vec4 b = texture2D(maskB, uv);
  float close = a.a;
  vec2 world = vec2(uv.x * size.x / size.y, uv.y);

  // the viewer: a very slow, tiny drift
  vec2 drift = vec2(sin(time * 0.19) + 0.6 * sin(time * 0.113 + 1.7), 0.3 * sin(time * 0.157 + 0.6));
  vec2 p = uv + drift * camera * close / size;

  // clouds and mist slowly change shape
  float loose = a.r * mix(1.0, b.r, b.b);
  vec2 w1 = texture2D(noiseMap, world * 0.33 + vec2(time * 0.0075, time * 0.0026)).rg - 0.5;
  vec2 w2 = texture2D(noiseMap, world * 0.83 + vec2(-time * 0.0054, time * 0.0043)).gb - 0.5;
  p += (w1 + 0.45 * w2) * warp * loose / size;

  // every patch of the picture has its own moment (0 to 1, it never moves).
  // The trembling and the glow below use it, so no straight wave runs through
  // the picture: each patch rocks by itself (19 Nov 2026).
  float own = texture2D(noiseMap, world * 1.3 + 0.37).b;

  // shimmer on the ghosts: an uneven, slow quiver
  float ghost = b.g;
  vec2 quiver = texture2D(noiseMap, world * 2.6 + vec2(time * 0.021, -time * 0.016)).rg - 0.5;
  p += quiver * 2.0 * wobble * ghost / size;

  // grass: gusts travel over the field, the stalks lean and tremble with them
  float lean = a.b;
  float gust = smoothstep(0.38, 0.72, texture2D(noiseMap, world * vec2(0.42, 0.8) - vec2(time * 0.03, 0.0)).b);
  float tremble = sin(time * 1.5 + own * 10.0) * 0.6 + sin(time * 2.6 + own * 19.0) * 0.4;
  p.x += (tremble * (0.3 + 0.9 * gust) - 1.2 * gust) * sway * lean / size.x;

  vec3 colour = texture2D(picture, p).rgb;

  // drifting fog: flat banks, much wider than high. Two sheets, each with one
  // steady speed: a small slow one far away and a big one nearby. (Before
  // 19 Nov 2026 it was one sheet whose speed changed with the distance: that
  // pulled the fog into slanted stripes, more the longer the show ran.)
  vec3 soft = texture2D(haze, p).rgb;
  vec2 farAt = vec2(world.x * 1.1, uv.y * 5.0) - vec2(time * 0.0016, 0.0);
  vec2 nearAt = vec2(world.x * 0.42, uv.y * 1.5) - vec2(time * 0.0026, 0.0);
  vec2 curl = texture2D(noiseMap, nearAt * 0.5 + vec2(0.0, time * 0.0009)).gb - 0.5;
  float farBody = texture2D(noiseMap, farAt + curl * 0.06).r * 0.65
    + texture2D(noiseMap, farAt * 2.1 + curl * 0.10 - vec2(time * 0.0022, 0.0)).g * 0.35;
  float nearBody = texture2D(noiseMap, nearAt + curl * 0.10).g * 0.65
    + texture2D(noiseMap, nearAt * 2.3 + curl * 0.14 - vec2(time * 0.0040, 0.0)).r * 0.35;
  float body = mix(farBody, nearBody, smoothstep(0.15, 0.75, close));
  // soft edges: the fog is a haze that is a bit thicker in the banks
  float thick = mix(mistFloor, 1.0, smoothstep(0.30, 0.80, body));
  float veil = a.g * mistAmount;
  // ruins and other things with edges keep most of their contrast
  float open = mix(0.3, 1.0, b.r);
  colour = mix(colour, soft * 1.05, thick * veil * open);
  // the banks are a little brighter, the gaps a little darker
  colour *= 1.0 + (body - 0.5) * wisps * a.g;

  // the light under moving clouds
  float cloud = texture2D(noiseMap, world * 0.2 - vec2(time * 0.0035, time * 0.0008)).b;
  colour *= 1.0 + (cloud - 0.5) * light;

  float beat = 0.5 + 0.5 * sin(time * 0.9 + own * 12.0);
  colour += colour * ghost * pulseStrength * beat;

  // fine grain: smooth dark areas get no visible steps (banding)
  colour += (texture2D(noiseMap, gl_FragCoord.xy / 512.0 + frameShift).a - 0.5) * grain;
  gl_FragColor = vec4(colour, 1.0);
}
`

function setupGl() {
  gl = glCanvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false })
  if (!gl) return false
  const compile = (type, code) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, code)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
    return s
  }
  program = gl.createProgram()
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexCode))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentCode))
  gl.linkProgram(program)
  gl.useProgram(program)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const corner = gl.getAttribLocation(program, 'corner')
  gl.enableVertexAttribArray(corner)
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0)
  return true
}

function makeTexture(unit, source) {
  const t = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source)
  return t
}

// a texture from plain numbers (4 per pixel: red, green, blue, alpha)
function makeDataTexture(unit, w, h, data, repeat) {
  const t = gl.createTexture()
  const edge = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, edge)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, edge)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
  return t
}

// The noise picture (512 x 512, repeats without a border) that the mist,
// the gusts and the light are made from. Red and green: cloud shapes with
// fine detail. Blue: big soft shapes. Alpha: fine grain.
const NOISE = 512
function makeNoise() {
  let seed = 20261118
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  // one layer of smooth noise that repeats after 'cells' cells
  function layer(cells) {
    const gx = new Float32Array(cells * cells)
    const gy = new Float32Array(cells * cells)
    for (const i of range(cells * cells)) {
      const angle = rand() * Math.PI * 2
      gx[i] = Math.cos(angle)
      gy[i] = Math.sin(angle)
    }
    const out = new Float32Array(NOISE * NOISE)
    const step = cells / NOISE
    const ease = t => t * t * t * (t * (t * 6 - 15) + 10)
    for (const y of range(NOISE)) {
      const fy = y * step
      const y0 = Math.floor(fy)
      const y1 = (y0 + 1) % cells
      const ty = fy - y0
      const sy = ease(ty)
      for (const x of range(NOISE)) {
        const fx = x * step
        const x0 = Math.floor(fx)
        const x1 = (x0 + 1) % cells
        const tx = fx - x0
        const sx = ease(tx)
        const d00 = gx[y0 * cells + x0] * tx + gy[y0 * cells + x0] * ty
        const d10 = gx[y0 * cells + x1] * (tx - 1) + gy[y0 * cells + x1] * ty
        const d01 = gx[y1 * cells + x0] * tx + gy[y1 * cells + x0] * (ty - 1)
        const d11 = gx[y1 * cells + x1] * (tx - 1) + gy[y1 * cells + x1] * (ty - 1)
        const top = d00 + (d10 - d00) * sx
        const bottom = d01 + (d11 - d01) * sx
        out[y * NOISE + x] = top + (bottom - top) * sy
      }
    }
    return out
  }
  // several layers on top of each other, each finer and weaker, scaled to 0..255
  function cloud(layers) {
    const sum = new Float32Array(NOISE * NOISE)
    let cells = 4
    let weight = 1
    for (const o of range(layers)) {
      const one = layer(cells)
      for (const i of range(sum.length)) {
        sum[i] = sum[i] + one[i] * weight
      }
      cells = cells * 2
      weight = weight * 0.5
    }
    let lo = Infinity
    let hi = -Infinity
    for (const v of sum) {
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
    return sum.map(v => ((v - lo) / (hi - lo)) * 255)
  }
  const red = cloud(5)
  const green = cloud(5)
  const blue = cloud(3)
  const data = new Uint8Array(NOISE * NOISE * 4)
  for (const i of range(NOISE * NOISE)) {
    data[i * 4] = red[i]
    data[i * 4 + 1] = green[i]
    data[i * 4 + 2] = blue[i]
    data[i * 4 + 3] = rand() * 256
  }
  return data
}

// The masks are small pictures (960 x 270) that say per place what may
// happen there. paintZones gives one such mask: 'base' everywhere, and
// inside each zone the number that valueOf gives (0 to 1), soft at the edges.
const MASK_W = 960
const MASK_H = 270
function paintZones(zones, valueOf, base, blur) {
  const c = makeCanvas(MASK_W, MASK_H)
  const g = c.getContext('2d', { willReadFrequently: true })
  const grey = v => {
    const n = Math.round(255 * v)
    return `rgb(${n}, ${n}, ${n})`
  }
  g.fillStyle = grey(base)
  g.fillRect(0, 0, MASK_W, MASK_H)
  g.filter = `blur(${blur}px)`
  for (const z of zones) {
    const v = valueOf(z)
    if (Array.isArray(v)) {
      // from v[0] at the top of the zone to v[1] at its bottom
      const ys = z.poly.map(p => p[1])
      const grad = g.createLinearGradient(0, Math.min(...ys) * MASK_H, 0, Math.max(...ys) * MASK_H)
      grad.addColorStop(0, grey(v[0]))
      grad.addColorStop(1, grey(v[1]))
      g.fillStyle = grad
    } else {
      g.fillStyle = grey(v)
    }
    g.beginPath()
    for (const p of z.poly) {
      g.lineTo(p[0] * MASK_W, p[1] * MASK_H)
    }
    g.closePath()
    g.fill()
  }
  return g.getImageData(0, 0, MASK_W, MASK_H).data
}

// a mask from a picture (the calm mask, the ghosts), or all 'empty' without one
function paintImage(image, empty) {
  const c = makeCanvas(MASK_W, MASK_H)
  const g = c.getContext('2d', { willReadFrequently: true })
  g.fillStyle = `rgb(${empty}, ${empty}, ${empty})`
  g.fillRect(0, 0, MASK_W, MASK_H)
  if (image) g.drawImage(image, 0, 0, MASK_W, MASK_H)
  return g.getImageData(0, 0, MASK_W, MASK_H).data
}

// four masks in one texture: one per colour channel
function packMasks(r, g, b, a) {
  const data = new Uint8Array(MASK_W * MASK_H * 4)
  for (const i of range(MASK_W * MASK_H)) {
    data[i * 4] = r[i * 4]
    data[i * 4 + 1] = g[i * 4]
    data[i * 4 + 2] = b[i * 4]
    data[i * 4 + 3] = a ? a[i * 4] : 255
  }
  return data
}

// a small, strongly blurred copy of the picture: the colour of the mist at
// every place, so the drifting mist is lit like the picture itself
const HAZE_W = 480
const HAZE_H = 135
function makeHaze(image) {
  const c = makeCanvas(HAZE_W, HAZE_H)
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(image, 0, 0, HAZE_W, HAZE_H)
  const px = g.getImageData(0, 0, HAZE_W, HAZE_H).data
  const data = new Uint8Array(HAZE_W * HAZE_H * 4).fill(255)
  const reach = 5
  for (const channel of range(3)) {
    let now = new Float32Array(HAZE_W * HAZE_H)
    for (const i of range(now.length)) {
      now[i] = px[i * 4 + channel]
    }
    for (const pass of range(3)) {
      const across = new Float32Array(now.length)
      for (const y of range(HAZE_H)) {
        for (const x of range(HAZE_W)) {
          let sum = 0
          for (const k of range(reach * 2 + 1)) {
            sum = sum + now[y * HAZE_W + Math.min(HAZE_W - 1, Math.max(0, x + k - reach))]
          }
          across[y * HAZE_W + x] = sum / (reach * 2 + 1)
        }
      }
      const down = new Float32Array(now.length)
      for (const y of range(HAZE_H)) {
        for (const x of range(HAZE_W)) {
          let sum = 0
          for (const k of range(reach * 2 + 1)) {
            sum = sum + across[Math.min(HAZE_H - 1, Math.max(0, y + k - reach)) * HAZE_W + x]
          }
          down[y * HAZE_W + x] = sum / (reach * 2 + 1)
        }
      }
      now = down
    }
    for (const i of range(now.length)) {
      data[i * 4 + channel] = now[i]
    }
  }
  return data
}

async function loadPictures(s) {
  const p = window.PICTURES[s.id]
  const out = {}
  out.picture = await loadImage(p.picture)
  out.calm = await loadImage(p.calm)
  out.pulse = p.pulse ? await loadImage(p.pulse) : null
  out.leaves = p.leaves ? await loadImage(p.leaves) : null
  out.debris = p.debris ? await loadImage(p.debris) : null
  return out
}

let noiseData = null
let timeAt = null
let frameShiftAt = null

function useScenePictures(images) {
  for (const t of Object.values(textures)) {
    gl.deleteTexture(t)
  }
  noiseData = noiseData || makeNoise()
  const shape = scene.flow || []
  const guardFallback = scene.protect === undefined ? 0.8 : scene.protect
  const maskA = packMasks(
    paintZones(shape, z => (z.strength === undefined ? 1 : z.strength), 0, 10),
    paintZones(scene.mist || [], z => (z.amount === undefined ? 1 : z.amount), 0, 12),
    paintZones(scene.sway || [], z => (z.amount === undefined ? 1 : z.amount), 0, 8),
    paintZones(scene.near || [], z => z.near, 0, 6)
  )
  const maskB = packMasks(
    paintImage(images.calm, 255),
    paintImage(images.pulse, 0),
    paintZones(shape, z => (z.protect === undefined ? guardFallback : z.protect), 1, 10),
    null
  )
  textures = {
    picture: makeTexture(0, images.picture),
    haze: makeDataTexture(1, HAZE_W, HAZE_H, makeHaze(images.picture), false),
    noiseMap: makeDataTexture(2, NOISE, NOISE, noiseData, true),
    maskA: makeDataTexture(3, MASK_W, MASK_H, maskA, false),
    maskB: makeDataTexture(4, MASK_W, MASK_H, maskB, false)
  }
  const u = name => gl.getUniformLocation(program, name)
  gl.uniform1i(u('picture'), 0)
  gl.uniform1i(u('haze'), 1)
  gl.uniform1i(u('noiseMap'), 2)
  gl.uniform1i(u('maskA'), 3)
  gl.uniform1i(u('maskB'), 4)
  gl.uniform1f(u('sway'), scene.swayPixels || 0)
  gl.uniform1f(u('warp'), scene.warpPixels || 0)
  gl.uniform1f(u('mistAmount'), scene.mistAmount || 0)
  gl.uniform1f(u('mistFloor'), scene.mistFloor || 0)
  gl.uniform1f(u('wisps'), scene.wisps || 0)
  gl.uniform1f(u('camera'), scene.cameraPixels || 0)
  gl.uniform1f(u('light'), scene.light || 0)
  gl.uniform1f(u('grain'), (scene.grain === undefined ? 2.4 : scene.grain) / 255)
  gl.uniform1f(u('pulseStrength'), scene.pulseStrength || 0)
  gl.uniform1f(u('wobble'), scene.wobble || 0)
  gl.uniform2f(u('size'), 3840, 1080)
  timeAt = u('time')
  frameShiftAt = u('frameShift')
}

function drawPicture(t) {
  gl.viewport(0, 0, W, H)
  gl.uniform1f(timeAt, t)
  // the grain sits at another place every frame
  const shiftX = Math.floor(Math.random() * NOISE) / NOISE
  const shiftY = Math.floor(Math.random() * NOISE) / NOISE
  gl.uniform2f(frameShiftAt, shiftX, shiftY)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

// ---------- layer 2: effects

function glowEffect(e) {
  return {
    draw(t) {
      const pulse = 0.65 + 0.35 * Math.sin(t * (e.speed || 0.5))
      fx.globalCompositeOperation = 'lighter'
      softBlob(fx, e.x * W, e.y * H, e.r * H, e.r * H * (e.squash || 1), e.color, e.alpha * pulse)
      fx.globalCompositeOperation = 'source-over'
    }
  }
}

function raysEffect(e) {
  const beams = range(e.count || 7).map(() => ({
    angle: between(e.from, e.to),
    width: between(0.015, 0.045),
    speed: between(0.05, 0.15),
    phase: Math.random() * 10
  }))
  return {
    draw(t) {
      const x = e.x * W
      const y = e.y * H
      const length = e.length * H
      fx.globalCompositeOperation = 'lighter'
      for (const b of beams) {
        const a = b.angle + Math.sin(t * b.speed + b.phase) * 0.03
        const strength = e.alpha * (0.5 + 0.5 * Math.sin(t * b.speed * 2 + b.phase))
        const grad = fx.createLinearGradient(x, y, x + Math.cos(a) * length, y + Math.sin(a) * length)
        grad.addColorStop(0, rgba(e.color, strength))
        grad.addColorStop(1, rgba(e.color, 0))
        fx.fillStyle = grad
        fx.beginPath()
        fx.moveTo(x, y)
        fx.lineTo(x + Math.cos(a - b.width) * length, y + Math.sin(a - b.width) * length)
        fx.lineTo(x + Math.cos(a + b.width) * length, y + Math.sin(a + b.width) * length)
        fx.closePath()
        fx.fill()
      }
      fx.globalCompositeOperation = 'source-over'
    }
  }
}

function particlesEffect(e) {
  function spawn(start) {
    return {
      x: between(e.x0 === undefined ? 0 : e.x0, e.x1 === undefined ? 1 : e.x1) * W,
      y: start ? between(e.top, e.bottom) * H : (e.fall ? e.top : e.bottom) * H,
      vy: (e.fall ? 1 : -1) * between(e.speed * 0.4, e.speed) * S,
      vx: between(-1, 1) * (e.drift || 6) * S + (e.wind || 0) * S,
      size: between(e.size[0], e.size[1]) * S,
      alpha: between(0.3, 1),
      wobble: between(0.4, 1.4),
      phase: Math.random() * 10,
      life: between(e.life[0], e.life[1]),
      age: start ? Math.random() * e.life[0] : 0
    }
  }
  const list = range(Math.round(e.count * (W / 3840))).map(() => spawn(true))
  const image = tintedSprite(e.color, e.dark)
  return {
    draw(t, dt) {
      fx.globalCompositeOperation = e.dark ? 'source-over' : 'lighter'
      for (const i of range(list.length)) {
        const p = list[i]
        p.age = p.age + dt
        p.y = p.y + p.vy * dt
        // wander: how far a dot weaves left and right (8 = the usual, 0 = straight)
        const wander = e.wander === undefined ? 8 : e.wander
        p.x = p.x + (p.vx + Math.sin(p.age * p.wobble + p.phase) * wander * S) * dt
        const gone = p.age > p.life || p.y < -20 || p.y > H + 20 || p.x < -20 || p.x > W + 20
        if (gone) {
          list[i] = spawn(false)
          continue
        }
        const fade = Math.max(0, Math.min(1, p.age / 1.5, (p.life - p.age) / 2))
        fx.globalAlpha = p.alpha * fade * (e.alpha || 1)
        fx.drawImage(image, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
      }
      fx.globalAlpha = 1
      fx.globalCompositeOperation = 'source-over'
    }
  }
}

// bright points found in the picture that softly twinkle
function twinkleEffect(e) {
  const points = e.points.map(p => ({
    x: p[0],
    y: p[1],
    speed: between(0.3, 1.2),
    phase: Math.random() * 10,
    size: between(e.size[0], e.size[1])
  }))
  const image = tintedSprite(e.color)
  return {
    draw(t) {
      fx.globalCompositeOperation = 'lighter'
      for (const s of points) {
        const a = Math.max(0, Math.sin(t * s.speed + s.phase)) ** 4
        if (a < 0.03) continue
        const size = s.size * S * (0.6 + a * 0.6)
        fx.globalAlpha = a * e.alpha
        fx.drawImage(image, s.x * W - size / 2, s.y * H - size / 2, size, size)
      }
      fx.globalAlpha = 1
      fx.globalCompositeOperation = 'source-over'
    }
  }
}

// leaves cut out of the picture: they start where they were and tumble
// down, new ones come from the tree
function leavesEffect(e, images) {
  const atlas = images.leaves
  const shapes = window.CUTS[e.cuts].map(c => ({ x: c[0], y: c[1], w: c[2], h: c[3], ax: c[4], ay: c[5] }))
  function newLeaf(fromShape) {
    const shape = fromShape || shapes[Math.floor(Math.random() * shapes.length)]
    const leaf = {
      shape: shape,
      x: fromShape ? (shape.x + shape.w / 2) / 3840 : between(e.x0, e.x1),
      y: fromShape ? (shape.y + shape.h / 2) / 1080 : between(e.top, e.bottom),
      scale: fromShape ? 1 : between(e.scale[0], e.scale[1]),
      fall: between(e.fall[0], e.fall[1]),
      wind: between(e.wind[0], e.wind[1]),
      spin: between(0.4, 1.3) * (Math.random() < 0.5 ? 1 : -1),
      flip: between(0.6, 1.6),
      phase: Math.random() * 10,
      age: 0,
      fadeIn: fromShape ? 0 : 2.5
    }
    return leaf
  }
  const list = shapes.map(s => newLeaf(s))
  for (const i of range(Math.max(0, e.count - shapes.length))) {
    const leaf = newLeaf(null)
    leaf.age = 3
    list.push(leaf)
  }
  return {
    draw(t, dt) {
      for (const i of range(list.length)) {
        const L = list[i]
        L.age = L.age + dt
        // start slowly so the first second looks like the still picture
        const ease = Math.min(1, L.age / 4)
        L.y = L.y + (L.fall * S * dt * ease) / H
        L.x = L.x + ((L.wind + Math.sin(L.age * 0.8 + L.phase) * 10) * S * dt * ease) / W
        if (L.y > 1.05 || L.x < -0.05 || L.x > 1.05) {
          list[i] = newLeaf(null)
          continue
        }
        const s = L.shape
        const fade = L.fadeIn > 0 ? Math.min(1, L.age / L.fadeIn) : 1
        fx.save()
        fx.translate(L.x * W, L.y * H)
        // turn: how much the leaves tumble (1 = lively, lower = calmer)
        const turn = e.turn === undefined ? 1 : e.turn
        const flip = 1 - ease * turn * (1 - Math.cos(L.age * L.flip * turn + L.phase))
        fx.rotate(Math.sin(L.age * L.spin * turn + L.phase) * 0.9 * turn * ease)
        fx.scale(L.scale * S * flip, L.scale * S)
        fx.globalAlpha = fade * (e.alpha === undefined ? 1 : e.alpha)
        fx.drawImage(atlas, s.ax, s.ay, s.w, s.h, -s.w / 2, -s.h / 2, s.w, s.h)
        fx.restore()
      }
      fx.globalAlpha = 1
    }
  }
}

// debris cut out of the picture: every piece keeps falling past the place
// where it was in the picture, fading in above it and out below it
function debrisEffect(e, images) {
  const atlas = images.debris
  // share: which part of the pieces moves, the rest stays where the picture had it
  const share = e.share === undefined ? 1 : e.share
  const pieces = window.CUTS[e.cuts].map(c => ({
    c: c,
    still: Math.random() > share,
    offset: Math.random(),
    speed: between(0.6, 1.4),
    spin: between(-0.4, 0.4) * (e.turn === undefined ? 1 : e.turn),
    phase: Math.random() * 10
  }))
  const loop = e.loop * 1080
  const strength = e.alpha === undefined ? 1 : e.alpha
  return {
    draw(t) {
      const k = W / 3840
      for (const p of pieces) {
        const along = p.still ? 0.5 : (t * e.speed * p.speed / loop + p.offset) % 1
        const travel = (along - 0.5) * loop
        const alpha = p.still ? 1 : Math.min(1, along / 0.2, (1 - along) / 0.2) * strength
        const drift = p.still ? 0 : Math.sin(t * 0.7 + p.phase) * 2
        const x = p.c[0] + p.c[2] / 2 + travel * (e.slant || 0) + drift
        const y = p.c[1] + p.c[3] / 2 + travel
        fx.save()
        fx.translate(x * k, y * k)
        fx.rotate(p.still ? 0 : p.spin * t)
        fx.scale(k, k)
        fx.globalAlpha = alpha
        fx.drawImage(atlas, p.c[4], p.c[5], p.c[2], p.c[3], -p.c[2] / 2, -p.c[3] / 2, p.c[2], p.c[3])
        fx.restore()
      }
      fx.globalAlpha = 1
    }
  }
}

function drawBird(g, s, p) {
  const flap = Math.sin(p) * 0.8
  g.lineWidth = Math.max(1, s * 0.12)
  g.beginPath()
  g.moveTo(-s, -flap * s * 0.8)
  g.quadraticCurveTo(-s * 0.4, -s * 0.2, 0, 0)
  g.quadraticCurveTo(s * 0.4, -s * 0.2, s, -flap * s * 0.8)
  g.stroke()
}

function birdsEffect(e) {
  let next = between(e.first || 2, (e.first || 2) + 6)
  const alive = []
  function launch() {
    const dir = Math.random() < 0.5 ? 1 : -1
    const count = Math.round(between(e.group[0], e.group[1]))
    const lane = between(e.top, e.bottom)
    const size = between(e.size[0], e.size[1])
    const speed = between(e.speed[0], e.speed[1])
    for (const i of range(count)) {
      alive.push({
        x: dir > 0 ? -0.03 - i * between(0.01, 0.04) : 1.03 + i * between(0.01, 0.04),
        y: lane + between(-0.04, 0.04),
        dir: dir,
        size: size * between(0.8, 1.2),
        speed: speed * between(0.95, 1.05),
        phase: Math.random() * 10,
        flapRate: between(10, 14)
      })
    }
  }
  return {
    draw(t, dt) {
      if (t > next) {
        launch()
        next = t + between(e.every[0], e.every[1])
      }
      fx.strokeStyle = rgba(e.color || [20, 20, 25], 0.85)
      fx.lineCap = 'round'
      for (const b of alive) {
        b.x = b.x + (b.dir * b.speed * S * dt) / W
        b.phase = b.phase + b.flapRate * dt
        const glide = Math.sin(b.phase * 0.13) > 0.6
        const y = b.y * H + Math.sin(b.x * 9 + b.phase * 0.05) * 0.01 * H
        fx.save()
        fx.translate(b.x * W, y)
        fx.scale(b.dir, 1)
        drawBird(fx, b.size * H, glide ? 0.4 : b.phase)
        fx.restore()
      }
      for (const i of range(alive.length).reverse()) {
        if (alive[i].x < -0.2 || alive[i].x > 1.2) alive.splice(i, 1)
      }
    }
  }
}

function vignetteEffect(e) {
  const layer = makeCanvas(W, H)
  const g = layer.getContext('2d')
  g.translate(W / 2, H / 2)
  g.scale(W / H / 1.6, 1)
  const grad = g.createRadialGradient(0, 0, H * 0.45, 0, 0, H * 1.1)
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)')
  grad.addColorStop(1, `rgba(0, 0, 0, ${e.alpha || 0.35})`)
  g.fillStyle = grad
  g.fillRect(-W, -H, W * 2, H * 2)
  return {
    draw() {
      fx.drawImage(layer, 0, 0)
    }
  }
}

const effectMakers = {
  glow: glowEffect,
  rays: raysEffect,
  particles: particlesEffect,
  twinkle: twinkleEffect,
  leaves: leavesEffect,
  debris: debrisEffect,
  birds: birdsEffect,
  vignette: vignetteEffect
}

// ---------- scenes, rotation and the frame loop

let images = null

function sizeCanvases() {
  const ratio = window.devicePixelRatio || 1
  const asked = new URLSearchParams(window.location.search)
  W = Number(asked.get('w')) || Math.round(window.innerWidth * ratio)
  H = Number(asked.get('h')) || Math.round(window.innerHeight * ratio)
  S = H / 1080
  for (const c of [glCanvas, fxCanvas, fadeCanvas]) {
    c.width = W
    c.height = H
    c.style.width = W / ratio + 'px'
    c.style.height = H / ratio + 'px'
  }
}

function buildEffects() {
  sprite = sprite || makeSprite()
  things = scene.effects.map(e => effectMakers[e.type](e, images))
}

async function showScene(id) {
  const s = window.SCENES[id]
  if (!s) return
  if (!window.PICTURES || !window.PICTURES[id]) {
    await loadScript(`data/${id}.js`)
  }
  s.id = id
  const loaded = await loadPictures(s)
  scene = s
  sceneId = id
  images = loaded
  useScenePictures(images)
  buildEffects()
  placeClock()
}

// crossfade: freeze the old frame on top and let it fade away
async function switchTo(id) {
  if (id === sceneId) return
  const g = fadeCanvas.getContext('2d')
  g.clearRect(0, 0, W, H)
  g.drawImage(glCanvas, 0, 0)
  g.drawImage(fxCanvas, 0, 0)
  fadeCanvas.style.transition = 'none'
  fadeCanvas.style.opacity = '1'
  await showScene(id)
  requestAnimationFrame(() => {
    fadeCanvas.style.transition = 'opacity 4s ease'
    fadeCanvas.style.opacity = '0'
  })
}

let rotationTimer = 0
function startRotation() {
  clearInterval(rotationTimer)
  if (settings.scene !== 'rotate') return
  rotationTimer = setInterval(() => {
    const i = settings.order.indexOf(sceneId)
    switchTo(settings.order[(i + 1) % settings.order.length])
  }, settings.minutes * 60 * 1000)
}

function render(t, dt) {
  drawPicture(t)
  fx.clearRect(0, 0, W, H)
  for (const thing of things) {
    thing.draw(t, dt)
  }
}

let lastFrame = 0
let framesDrawn = 0
function frame(now) {
  requestAnimationFrame(frame)
  if (!scene) return
  if (now - lastFrame < 1000 / 30 - 2) return
  const dt = Math.min(0.1, (now - lastFrame) / 1000)
  lastFrame = now
  render((now - startTime) / 1000 + 20, dt)
  framesDrawn = framesDrawn + 1
  // tell the show program that the moving picture is on screen
  // (again every time the page comes back from being hidden)
  if (announce && window.chrome && window.chrome.webview) {
    announce = false
    window.chrome.webview.postMessage('ready')
  }
}

let announce = true
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) announce = true
})

// date and time in a lower corner (?clock=1)
let placeClock = () => {}
function makeClock() {
  const box = document.createElement('div')
  const time = document.createElement('div')
  const line = document.createElement('div')
  const date = document.createElement('div')
  const serif = 'Garamond, "Palatino Linotype", Georgia, serif'
  const shadow = '0 0 18px rgba(0, 0, 0, 0.9), 0 0 6px rgba(0, 0, 0, 0.8), 0 0 40px rgba(255, 190, 90, 0.25)'
  Object.assign(box.style, {
    position: 'absolute',
    left: '11vh',
    bottom: '9vh',
    zIndex: '10',
    color: 'rgba(244, 230, 198, 0.95)',
    fontFamily: serif,
    textShadow: shadow,
    pointerEvents: 'none'
  })
  Object.assign(time.style, { fontSize: '13vh', lineHeight: '1', letterSpacing: '0.04em' })
  Object.assign(line.style, {
    height: '1px',
    margin: '1.4vh 0 1.2vh',
    background: 'linear-gradient(to right, rgba(226, 182, 94, 0.9), rgba(226, 182, 94, 0))'
  })
  Object.assign(date.style, { fontSize: '3.1vh', letterSpacing: '0.22em', textTransform: 'uppercase' })
  box.appendChild(time)
  box.appendChild(line)
  box.appendChild(date)
  document.body.appendChild(box)
  // each picture says in which lower corner the clock fits (clock: 'right')
  placeClock = () => {
    const right = scene && scene.clock === 'right'
    box.style.left = right ? 'auto' : '11vh'
    box.style.right = right ? '11vh' : 'auto'
    box.style.textAlign = right ? 'right' : 'left'
    const direction = right ? 'to left' : 'to right'
    line.style.background = `linear-gradient(${direction}, rgba(226, 182, 94, 0.9), rgba(226, 182, 94, 0))`
  }
  placeClock()
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const two = n => String(n).padStart(2, '0')
  const update = () => {
    const now = new Date()
    time.textContent = `${two(now.getHours())}:${two(now.getMinutes())}`
    date.textContent = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`
  }
  update()
  setInterval(update, 1000)
}

// Lively Wallpaper calls this when a setting is changed in its panel
window.livelyPropertyListener = function (name, value) {
  if (name === 'scene') {
    const choices = ['rotate'].concat(settings.order)
    settings.scene = choices[value] || 'rotate'
    if (settings.scene !== 'rotate') switchTo(settings.scene)
    startRotation()
  }
  if (name === 'minutes') {
    settings.minutes = Math.max(1, Number(value))
    startRotation()
  }
}

async function start() {
  const asked = new URLSearchParams(window.location.search)
  if (asked.get('s')) settings.scene = asked.get('s')
  if (asked.get('every')) settings.minutes = Number(asked.get('every'))
  sizeCanvases()
  if (!setupGl()) {
    document.body.textContent = 'This wallpaper needs WebGL.'
    return
  }
  // ?first=scadutree starts the rotation with that picture
  const wantedFirst = settings.order.includes(asked.get('first')) ? asked.get('first') : settings.order[0]
  const first = settings.scene === 'rotate' ? wantedFirst : settings.scene
  if (asked.get('clock')) makeClock()
  await showScene(first)
  // ?advance=N runs the wallpaper N seconds ahead (only used for testing)
  const advance = Number(asked.get('advance')) || 0
  for (const i of range(Math.round(advance * 10))) {
    render(20 + i * 0.1, 0.1)
  }
  startTime = performance.now() - advance * 1000
  // draw once right away, so the picture is there even while the page is still hidden
  render(20 + advance, 0.03)
  startRotation()
  requestAnimationFrame(frame)
  let resizeTimer = 0
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      sizeCanvases()
      buildEffects()
    }, 300)
  })
}

start()
