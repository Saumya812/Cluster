import * as THREE from 'three'

// Number of individual windows across one tile, in both directions. Kept as
// a named export so main.js can compute UV repeat against the exact same
// grid this module draws -- if this drifts out of sync with the repeat
// math, windows stop lining up with a believable real-world size.
export const WINDOW_TILE_CELLS = 8

// Deterministic PRNG (mulberry32) so a given seed always reproduces the
// exact same lit/unlit pattern -- lets each building batch get its own
// distinct window layout instead of every building sharing one texture.
function mulberry32(seed) {
  let a = seed >>> 0
  return function random() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Simple string hash (djb2) so a building's own id/name can seed its
// texture's PRNG -- same input always yields the same seed.
export function hashStringToSeed(str) {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return hash >>> 0
}

// Procedurally draws a tileable grid of window panes onto a canvas, then
// wraps it as a THREE.CanvasTexture. Two variants share the exact same
// lit/unlit pattern:
//   - colorTexture: used as the material's diffuse map (wall + window colors)
//   - emissiveTexture: black everywhere except lit windows, so occupied
//     windows glow at night independent of scene lighting
//
// Pass `seed` (e.g. from hashStringToSeed(building.full_name)) to get a
// reproducible, distinct pattern per call -- each building batch in
// main.js calls this with its own seed rather than sharing one texture.
// litRatio is randomized within [minLitRatio, maxLitRatio] each call,
// simulating ~15-25% building occupancy -- a later phase can swap this
// for real per-repo contributor data.
export function createWindowTextures({
  cells = WINDOW_TILE_CELLS,
  cellPx = 48,
  minLitRatio = 0.2,
  maxLitRatio = 0.34,
  seed = null,
  // Themed level cities pass a neutral wall so material.color sets the hue.
  wallColor = '#3a4258',
  paneColor = '#2a3144',
} = {}) {
  const random = seed === null ? Math.random : mulberry32(seed)

  const size = cells * cellPx
  const litRatio = minLitRatio + random() * (maxLitRatio - minLitRatio)

  const colorCanvas = document.createElement('canvas')
  colorCanvas.width = size
  colorCanvas.height = size
  const colorCtx = colorCanvas.getContext('2d')

  const emissiveCanvas = document.createElement('canvas')
  emissiveCanvas.width = size
  emissiveCanvas.height = size
  const emissiveCtx = emissiveCanvas.getContext('2d')

  // Wall / mortar -- cool slate so warm window panes punch like neon glass.
  colorCtx.fillStyle = wallColor
  colorCtx.fillRect(0, 0, size, size)
  emissiveCtx.fillStyle = '#000000'
  emissiveCtx.fillRect(0, 0, size, size)

  // Generous margin so each pane reads as a distinct square with a clear
  // dark gap around it, not a busy edge-to-edge checkerboard.
  const margin = Math.round(cellPx * 0.22)
  const paneSize = cellPx - margin * 2

  // Warm amber / cool cyan mix (Chongqing night + NYC office glow).
  const WARM = [
    [255, 214, 170],
    [255, 196, 120],
    [255, 236, 200],
  ]
  const COOL = [
    [180, 220, 255],
    [160, 240, 255],
    [200, 210, 255],
  ]

  // Each texture row tiles vertically into a building "floor" (see
  // instanceUvRepeat in main.js). Real office/residential occupancy isn't
  // an even scatter -- whole floors tend to be mostly dark, or empty, or
  // have a busy bright cluster. Pick each floor's own lit-density instead
  // of applying one uniform ratio to every cell in the tile.
  for (let row = 0; row < cells; row++) {
    const floorRoll = random()
    let rowLitRatio
    if (floorRoll < 0.28) {
      rowLitRatio = litRatio * (0.12 + random() * 0.2)
    } else if (floorRoll < 0.72) {
      rowLitRatio = litRatio * (0.55 + random() * 0.55)
    } else {
      rowLitRatio = Math.min(litRatio * (2.2 + random() * 2.2), 0.92)
    }

    for (let col = 0; col < cells; col++) {
      const x = col * cellPx + margin
      const y = row * cellPx + margin

      if (random() < rowLitRatio) {
        const palette = random() < 0.62 ? WARM : COOL
        const [br, bg, bb] = palette[Math.floor(random() * palette.length)]
        const brightness = 0.72 + random() * 0.28
        const r = Math.round(br * brightness)
        const g = Math.round(bg * brightness)
        const b = Math.round(bb * brightness)

        colorCtx.fillStyle = `rgb(${r}, ${g}, ${b})`
        colorCtx.fillRect(x, y, paneSize, paneSize)
        emissiveCtx.fillStyle = `rgb(${Math.min(255, r + 20)}, ${Math.min(255, g + 10)}, ${b})`
        emissiveCtx.fillRect(x, y, paneSize, paneSize)
      } else {
        colorCtx.fillStyle = paneColor
        colorCtx.fillRect(x, y, paneSize, paneSize)
      }
    }
  }

  const colorTexture = new THREE.CanvasTexture(colorCanvas)
  const emissiveTexture = new THREE.CanvasTexture(emissiveCanvas)

  for (const texture of [colorTexture, emissiveTexture]) {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.colorSpace = THREE.SRGBColorSpace
    // Mipmapped + high-repeat CanvasTextures sample as solid black on some
    // GPU/driver combinations, and blurred mipmaps also muddy crisp pixel
    // edges. Flat nearest-neighbor filtering avoids both and keeps window
    // edges sharp instead of dissolving into moire/static at a distance.
    texture.generateMipmaps = false
    texture.minFilter = THREE.NearestFilter
    texture.magFilter = THREE.NearestFilter
    texture.needsUpdate = true
  }

  return { colorTexture, emissiveTexture, litRatio }
}
