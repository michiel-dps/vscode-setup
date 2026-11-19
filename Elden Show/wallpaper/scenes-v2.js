'use strict'

// The wallpapers. Positions are fractions of the full two-screen picture:
// x 0 = left edge of the left screen, x 1 = right edge of the right screen,
// y 0 = top, y 1 = bottom.
// flow: areas where the picture itself slowly changes shape (clouds, fog),
//   at most warpPixels far. strength: how much of that (1 = all).
//   protect: how much the details inside an area (towers, branches) are
//   kept still (1 = fully).
// mist: areas where drifting fog is drawn on top (amount 0 to 1).
//   mistAmount: how much the fog hides what is behind it.
//   mistFloor: how much of that fog is there everywhere, also between the
//   banks (0 = only banks, 1 = one even haze).
//   wisps: how clearly you see brighter banks and darker gaps in the fog.
// near: how near the ground is, from [top of the area, bottom of the area]
//   (0 = far away, 1 = at your feet). Near mist is bigger and faster, and
//   the viewer's tiny drift (cameraPixels) moves near things more.
// light: how much the light brightens and dims under moving clouds.
// sway: areas where grass and trees lean in the wind (swayPixels wide).

window.SCENES = {
  shadow: {
    title: 'The Land of Shadow',
    moves: 'Mist drifts over the plain and past the ruins, the storm clouds slowly change shape, gusts run through the wheat, the light changes, the ghost graves shimmer, debris falls from the Scadutree, embers, spirit lights, gold dust',
    source: 'official Shadow of the Erdtree announcement art (ELDEN RING, February 2023)',
    pulseStrength: 0.35,
    wobble: 1.6,
    swayPixels: 1.6,
    warpPixels: 18,
    mistAmount: 0.55,
    mistFloor: 0.4,
    wisps: 0.14,
    cameraPixels: 4,
    light: 0.09,
    flow: [
      { poly: [[0.34, 0], [1, 0], [1, 0.4], [0.34, 0.38]], dir: [10, 0], protect: 0.2 },
      { poly: [[0, 0.16], [0.06, 0.2], [0.2, 0.3], [0.22, 0.38], [0, 0.4]], dir: [7, 0], protect: 0.4 },
      { poly: [[0, 0.45], [0.62, 0.46], [0.6, 0.6], [0.45, 0.72], [0.35, 0.98], [0, 0.98]], dir: [11, 0], strength: 0.6, protect: 0.85 },
      { poly: [[0.35, 0.46], [1, 0.47], [1, 0.53], [0.35, 0.55]], dir: [7, 0], strength: 0.5, protect: 0.9 }
    ],
    mist: [
      { poly: [[0, 0.44], [0.5, 0.45], [0.62, 0.5], [0.56, 0.6], [0.47, 0.7], [0.4, 0.85], [0.34, 1], [0, 1]] },
      { poly: [[0.45, 0.45], [1, 0.46], [1, 0.53], [0.6, 0.56], [0.45, 0.56]], amount: 0.6 },
      { poly: [[0.34, 1], [0.47, 0.7], [0.62, 0.56], [0.75, 0.56], [0.7, 0.8], [0.6, 1]], amount: 0.3 }
    ],
    near: [
      { poly: [[0, 0.44], [1, 0.44], [1, 1], [0, 1]], near: [0, 0.85] },
      { poly: [[0.34, 1], [0.5, 0.64], [0.66, 0.53], [1, 0.47], [1, 1]], near: [0.25, 1] }
    ],
    sway: [
      { poly: [[0.33, 1], [0.45, 0.8], [0.62, 0.66], [0.75, 0.6], [0.75, 1]] },
      { poly: [[0.85, 0.55], [1, 0.5], [1, 1], [0.85, 1]] },
      { poly: [[0.75, 0.86], [0.85, 0.86], [0.85, 1], [0.75, 1]] }
    ],
    effects: [
      // the tree (19 Nov 2026): the light behind the trunk breathes, the gold
      // cracks glow and sparkle, molten gold drips down the gold line, and
      // gold dust hangs around the tree
      { type: 'glow', x: 0.293, y: 0.39, r: 0.2, squash: 0.6, color: [255, 205, 130], alpha: 0.07, speed: 0.25 },
      { type: 'glow', x: 0.285, y: 0.32, r: 0.05, color: [255, 140, 40], alpha: 0.3, speed: 1.3 },
      { type: 'glow', x: 0.2815, y: 0.235, r: 0.04, color: [255, 150, 45], alpha: 0.22, speed: 0.9 },
      { type: 'twinkle', points: window.SPARKLES.shadow, size: [5, 11], color: [255, 175, 60], alpha: 0.7 },
      { type: 'debris', cuts: 'shadow-debris', loop: 0.1, speed: 3.5, slant: -0.25, share: 0.3, alpha: 0.6, turn: 0.3 },
      { type: 'particles', fall: true, x0: 0.2822, x1: 0.2834, color: [255, 195, 75], top: 0.26, bottom: 0.36, speed: 22, drift: 1, wander: 1, size: [2, 4], life: [3, 6], count: 12 },
      { type: 'particles', x0: 0.27, x1: 0.3, color: [255, 150, 50], top: 0.18, bottom: 0.42, speed: 16, size: [2, 5], life: [3, 7], count: 45 },
      { type: 'particles', x0: 0.2, x1: 0.38, color: [255, 215, 140], top: 0.05, bottom: 0.5, speed: 4, size: [2, 5], life: [9, 15], count: 45, alpha: 0.8 },
      { type: 'particles', x0: 0, x1: 0.5, color: [255, 215, 140], top: 0.2, bottom: 0.6, speed: 5, size: [2, 4], life: [8, 14], count: 60, alpha: 0.8 },
      { type: 'particles', x0: 0.4, x1: 1, color: [215, 228, 255], top: 0.6, bottom: 1, speed: 6, size: [4, 10], life: [5, 10], count: 45, alpha: 0.6 },
      { type: 'vignette', alpha: 0.3 }
    ]
  },

  scadutree: {
    title: 'The Scadutree and the rider',
    moves: 'The golden leaves and the debris from the picture fall, the light veils and fog drift, grass and trees sway, the fire in the tree glows and sparkles, embers, sun rays, spirit lights at the graves',
    source: 'official screenshot, Steam store page of Shadow of the Erdtree',
    clock: 'right',
    swayPixels: 1.6,
    warpPixels: 12,
    light: 0.06,
    flow: [
      { poly: [[0.47, 0], [1, 0], [1, 0.36], [0.8, 0.4], [0.57, 0.36], [0.47, 0.2]], dir: [7, 2], protect: 0.3 },
      { poly: [[0, 0], [0.09, 0], [0.12, 0.24], [0, 0.3]], dir: [-5, 2], protect: 0.5 },
      { poly: [[0.24, 0.74], [0.5, 0.72], [1, 0.7], [1, 0.85], [0.3, 0.86]], dir: [9, 0], strength: 0.8, protect: 0.9 }
    ],
    sway: [
      { poly: [[0, 0.76], [0.08, 0.72], [0.08, 1], [0, 1]] },
      { poly: [[0.22, 0.88], [0.55, 0.9], [1, 0.92], [1, 1], [0.22, 1]], amount: 0.8 },
      { poly: [[0.78, 0.36], [1, 0.34], [1, 0.6], [0.78, 0.58]], amount: 0.35 }
    ],
    effects: [
      { type: 'rays', x: 0.445, y: 0.52, from: 3.5, to: 6.0, length: 1, color: [255, 220, 150], alpha: 0.03, count: 9 },
      { type: 'glow', x: 0.445, y: 0.52, r: 0.24, color: [255, 200, 120], alpha: 0.12, speed: 0.35 },
      { type: 'glow', x: 0.339, y: 0.24, r: 0.04, color: [255, 120, 30], alpha: 0.3, speed: 1.5 },
      { type: 'glow', x: 0.356, y: 0.33, r: 0.035, color: [255, 120, 30], alpha: 0.25, speed: 1.1 },
      { type: 'twinkle', points: window.SPARKLES.scadutree, size: [5, 12], color: [255, 170, 60], alpha: 0.8 },
      { type: 'debris', cuts: 'scadutree-debris', loop: 0.1, speed: 3.5, slant: 0.1, share: 0.4, alpha: 0.6, turn: 0.3 },
      { type: 'particles', x0: 0.325, x1: 0.37, color: [255, 140, 40], top: 0.16, bottom: 0.42, speed: 12, size: [2, 5], life: [3, 7], count: 35 },
      { type: 'birds', top: 0.05, bottom: 0.22, size: [0.004, 0.007], speed: [60, 90], every: [30, 55], group: [4, 8], color: [20, 18, 12] },
      { type: 'leaves', cuts: 'scadutree-leaves', count: 7, x0: 0.3, x1: 1.03, top: -0.05, bottom: 0.55, scale: [0.4, 0.75], fall: [4, 9], wind: [-12, -3], turn: 0.35, alpha: 0.8 },
      { type: 'particles', x0: 0.38, x1: 0.75, color: [255, 220, 150], top: 0.3, bottom: 0.9, speed: 6, size: [2, 5], life: [8, 14], count: 80 },
      { type: 'particles', x0: 0.25, x1: 0.95, color: [215, 228, 255], top: 0.82, bottom: 1, speed: 5, size: [4, 9], life: [5, 10], count: 30, alpha: 0.5 },
      { type: 'vignette', alpha: 0.2 }
    ]
  }
}
