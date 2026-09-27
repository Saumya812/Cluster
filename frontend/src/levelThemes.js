/**
 * Visual theme per level city (1-10). Themes only recolor / decorate — layout,
 * labels, window patterns, Growth Tower and gameplay are identical everywhere.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * buildingColors — body tints (multiplied onto a neutral wall texture)
 * windowGlow     — emissive tints; fillers are split into one batch per colour
 * street         — road base + speckle colours (moss, frost, lava cracks…)
 * sky            — [zenith, mid, horizon]
 * particles      — optional THREE.Points effect
 */
export const LEVEL_THEMES = {
  1: {
    name: 'Neon Cyberpunk',
    buildingColors: ['#1b2446', '#162040', '#221a4a', '#111a3a'],
    windowGlow: ['#29f3ff', '#ff3fd4'],
    glowIntensity: 2.1,
    street: { color: '#2a1648', speck: ['#4a2a78', '#3a1f66'], lane: '#ff3fd4', emissive: '#1a0830' },
    lampColor: '#ff4fd8',
    fogColor: '#1f1245',
    fogDensity: 0.0009,
    sky: ['#05031a', '#2a0f5a', '#8a2a9a'],
    celestial: '#ff8ae6',
    ambient: { color: '#6a5aff', intensity: 0.7 },
    hemi: { sky: '#3a1f8a', ground: '#1a0a2a', intensity: 0.8 },
    sun: { color: '#8a7aff', intensity: 0.6 },
    bounce: '#ff3fd4',
    rockColor: '#2a2440',
    water: { color: '#ff6ae0', emissive: '#a01f8a', intensity: 0.8 },
    particles: null,
  },
  2: {
    name: 'Golden City',
    buildingColors: ['#c9a36b', '#b88f58', '#d8b57e', '#a87f4a'],
    windowGlow: ['#ffc94a', '#ffe08a'],
    glowIntensity: 1.5,
    street: { color: '#6b5132', speck: ['#8a6a42', '#5a4228'], lane: '#ffcf6a' },
    lampColor: '#ffb347',
    fogColor: '#f0b070',
    fogDensity: 0.0006,
    sky: ['#5a3a7a', '#e08a50', '#ffd08a'],
    celestial: '#fff0b0',
    ambient: { color: '#ffd9a0', intensity: 0.9 },
    hemi: { sky: '#ffcf8a', ground: '#6a4a2a', intensity: 0.8 },
    sun: { color: '#ffc070', intensity: 1.0 },
    bounce: '#ffb347',
    rockColor: '#8a6a48',
    water: { color: '#ffe0a0', emissive: '#a07020', intensity: 0.5 },
    particles: null,
  },
  3: {
    name: 'Emerald Forest City',
    buildingColors: ['#1d4a32', '#173f2b', '#22553a', '#133824'],
    windowGlow: ['#4dff8a', '#a8ff5a'],
    glowIntensity: 1.8,
    street: { color: '#2c3a22', speck: ['#4a6a2a', '#3a5a22', '#5a7a32'], lane: '#7aff9a' },
    lampColor: '#b8ff7a',
    fogColor: '#1f4a36',
    fogDensity: 0.0009,
    sky: ['#0a2418', '#1f5a3a', '#7ac88a'],
    celestial: '#e0ffd0',
    ambient: { color: '#8affb0', intensity: 0.7 },
    hemi: { sky: '#4a9a6a', ground: '#1a2a14', intensity: 0.8 },
    sun: { color: '#c8ffb0', intensity: 0.7 },
    bounce: '#4dff8a',
    rockColor: '#3a4a2a',
    water: { color: '#8affc8', emissive: '#1a7a4a', intensity: 0.5 },
    particles: { kind: 'fireflies', colors: ['#b8ff5a', '#6aff9a'], count: 260, size: 1.3 },
  },
  4: {
    name: 'Autumn City',
    buildingColors: ['#8a3a1f', '#a04a22', '#7a2a1a', '#b0602a'],
    windowGlow: ['#ffb347', '#ff8a3a'],
    glowIntensity: 1.5,
    street: { color: '#4a3222', speck: ['#8a4a1f', '#b0602a', '#6a3a1a'], lane: '#ffcf8a' },
    lampColor: '#ffb347',
    fogColor: '#d8884a',
    fogDensity: 0.0007,
    sky: ['#4a2a4a', '#c8603a', '#ffb070'],
    celestial: '#fff0c0',
    ambient: { color: '#ffc890', intensity: 0.85 },
    hemi: { sky: '#ffb070', ground: '#4a2a14', intensity: 0.8 },
    sun: { color: '#ffa050', intensity: 0.9 },
    bounce: '#ff8a3a',
    rockColor: '#6a4a32',
    water: { color: '#a8d8f0', emissive: '#3a6a8a', intensity: 0.35 },
    particles: { kind: 'leaves', colors: ['#ff7a1a', '#d8401a', '#ffb030', '#a0522d'], count: 700, size: 2.6 },
  },
  5: {
    name: 'Ice Crystal City',
    buildingColors: ['#b4d4ee', '#9cc4e6', '#cce2f6', '#8ab6de'],
    windowGlow: ['#2a9aff', '#7ad4ff'],
    glowIntensity: 2.0,
    street: {
      color: '#b8d4e8',
      speck: ['#ffffff', '#e0f0ff'],
      lane: '#e8f8ff',
      emissive: '#2a4a6a',
      roughness: 0.25,
      metalness: 0.3,
    },
    lampColor: '#bfe8ff',
    fogColor: '#8ab8e0',
    fogDensity: 0.00045,
    sky: ['#14305e', '#5a8ac8', '#c4def6'],
    celestial: '#ffffff',
    ambient: { color: '#c8e0ff', intensity: 0.75 },
    hemi: { sky: '#a8d0ff', ground: '#4a6a8a', intensity: 0.75 },
    sun: { color: '#e8f4ff', intensity: 0.85 },
    bounce: '#8ad0ff',
    rockColor: '#a8c0d8',
    water: { color: '#e0f6ff', emissive: '#6aa8d8', intensity: 0.5 },
    particles: { kind: 'snow', colors: ['#ffffff', '#e0f4ff'], count: 900, size: 1.2 },
  },
  6: {
    name: 'Volcanic City',
    buildingColors: ['#2e2e32', '#26262a', '#38363a', '#1e1e22'],
    windowGlow: ['#ff5a1a', '#ff2a0a', '#ffa030'],
    glowIntensity: 2.2,
    street: { color: '#1a1616', speck: ['#ff4a0a', '#5a1a0a'], lane: '#ff5a1a', emissive: '#3a0a00', cracks: true },
    lampColor: '#ff6a2a',
    fogColor: '#3a1a14',
    fogDensity: 0.001,
    sky: ['#0a0404', '#4a120a', '#d8481a'],
    celestial: '#ff7a3a',
    ambient: { color: '#ff8a5a', intensity: 0.6 },
    hemi: { sky: '#ff5a2a', ground: '#1a0a0a', intensity: 0.8 },
    sun: { color: '#ff7a3a', intensity: 0.7 },
    bounce: '#ff3a0a',
    rockColor: '#2a2220',
    water: { color: '#ff7a2a', emissive: '#ff3a00', intensity: 1.4 },
    particles: { kind: 'embers', colors: ['#ff6a1a', '#ffb030', '#ff2a0a'], count: 650, size: 1.5 },
  },
  7: {
    name: 'Deep Space City',
    buildingColors: ['#07080d', '#0b0c14', '#050609', '#10111c'],
    windowGlow: ['#ffffff', '#7ab8ff', '#b8c8ff'],
    glowIntensity: 2.1,
    street: { color: '#0a0a18', speck: ['#3a3a7a', '#8a8aff'], lane: '#7ab8ff' },
    lampColor: '#bcd4ff',
    fogColor: '#1c1040',
    fogDensity: 0.0011,
    sky: ['#000005', '#120a30', '#4a1f6a'],
    celestial: '#d8e0ff',
    stars: true,
    nebula: ['#8a3aff', '#ff4ab8', '#3a8aff'],
    ambient: { color: '#8a9aff', intensity: 0.55 },
    hemi: { sky: '#4a3a9a', ground: '#050510', intensity: 0.7 },
    sun: { color: '#c8d4ff', intensity: 0.6 },
    bounce: '#7a4aff',
    rockColor: '#15151f',
    water: { color: '#8ab8ff', emissive: '#3a4aa8', intensity: 0.7 },
    particles: { kind: 'stardust', colors: ['#ffffff', '#9ac8ff', '#c8b8ff'], count: 700, size: 1.1 },
  },
  8: {
    name: 'Candy City',
    buildingColors: ['#ff8ac4', '#c08aff', '#ffa8d8', '#a88aff', '#ff9ad0'],
    windowGlow: ['#fff0b0', '#ffd8f0'],
    glowIntensity: 1.7,
    street: { color: '#e8a8d0', speck: ['#ffffff', '#8ad8ff', '#fff08a', '#b8ffb8'], lane: '#ffffff' },
    lampColor: '#fff0a8',
    fogColor: '#e89ad0',
    fogDensity: 0.00045,
    sky: ['#7a4ad8', '#f08ad0', '#ffdcc8'],
    celestial: '#fff8e0',
    ambient: { color: '#ffe0f0', intensity: 0.8 },
    hemi: { sky: '#ffc0e8', ground: '#8060a8', intensity: 0.8 },
    sun: { color: '#fff0e0', intensity: 0.9 },
    bounce: '#ff9ad8',
    rockColor: '#e8a8c8',
    water: { color: '#ffd0f4', emissive: '#c86aa8', intensity: 0.5 },
    particles: null,
  },
  9: {
    name: 'Steampunk City',
    buildingColors: ['#6b4226', '#8a5a32', '#5a3a22', '#9a6a3a'],
    windowGlow: ['#ff9a3a', '#ffb860'],
    glowIntensity: 1.6,
    street: { color: '#3a2a1e', speck: ['#5a4a3a', '#2a1e14'], lane: '#c8883a' },
    lampColor: '#ffa040',
    fogColor: '#6a4a32',
    fogDensity: 0.0009,
    sky: ['#2a1e18', '#7a5a3a', '#d8a86a'],
    celestial: '#ffe0a0',
    ambient: { color: '#ffc890', intensity: 0.75 },
    hemi: { sky: '#c8905a', ground: '#2a1a10', intensity: 0.8 },
    sun: { color: '#ffb870', intensity: 0.8 },
    bounce: '#ff9a3a',
    rockColor: '#4a3a2a',
    water: { color: '#b8d0d0', emissive: '#4a6a6a', intensity: 0.35 },
    gears: true,
    particles: null,
  },
  10: {
    name: 'Crystal Kingdom',
    buildingColors: ['#8ac8f0', '#78b8f0', '#a8d8f8', '#6aaae8'],
    windowGlow: ['#ff6ad5', '#6ad5ff', '#ffe66a', '#8aff9a'],
    glowIntensity: 2.0,
    shimmer: true,
    buildingOpacity: 0.9,
    street: {
      color: '#a8c8e8',
      speck: ['#ffffff', '#e8d8ff'],
      lane: '#ffffff',
      emissive: '#3a3a7a',
      roughness: 0.2,
      metalness: 0.4,
    },
    lampColor: '#e8d8ff',
    fogColor: '#9aa4ec',
    fogDensity: 0.00045,
    sky: ['#2a1e7a', '#7a88e8', '#dcd4ff'],
    celestial: '#ffffff',
    ambient: { color: '#e0e8ff', intensity: 0.75 },
    hemi: { sky: '#c8d0ff', ground: '#6a6aa8', intensity: 0.8 },
    sun: { color: '#ffffff', intensity: 0.85 },
    bounce: '#c8a8ff',
    rockColor: '#b8c8e8',
    water: { color: '#e8f0ff', emissive: '#a8a0ff', intensity: 0.6 },
    particles: { kind: 'prism', colors: ['#ffffff'], count: 450, size: 1.6 },
  },
}

/** 'l3' / 3 / '3' → theme 3. Levels past 10 wrap around. */
export function getLevelTheme(levelId) {
  const n =
    typeof levelId === 'number' ? levelId : parseInt(String(levelId ?? '').replace(/\D+/g, ''), 10)
  if (!Number.isFinite(n) || n < 1) return LEVEL_THEMES[1]
  return LEVEL_THEMES[((n - 1) % 10) + 1]
}

function softDotTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.75)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function leafTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  ctx.translate(32, 32)
  ctx.rotate(-0.6)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.ellipse(0, 0, 26, 12, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-24, 0)
  ctx.lineTo(24, 0)
  ctx.stroke()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Gradient dome + moon/sun, with optional stars and nebula clouds. */
export function buildThemedSky(theme) {
  const group = new THREE.Group()
  group.name = 'themedSky'
  const [top, mid, horizon] = theme.sky

  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 512)
  g.addColorStop(0, top)
  g.addColorStop(0.3, mid)
  g.addColorStop(0.5, horizon)
  g.addColorStop(1, horizon)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 8, 512)
  const skyTex = new THREE.CanvasTexture(canvas)
  skyTex.colorSpace = THREE.SRGBColorSpace

  const SKY_R = 2600
  const S = SKY_R / 420
  group.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(SKY_R, 32, 24),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false }),
    ),
  )

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(26 * S, 32, 32),
    new THREE.MeshBasicMaterial({ color: theme.celestial, transparent: true, opacity: 0.95, depthWrite: false, fog: false }),
  )
  body.position.set(240 * S, 250 * S, -360 * S)
  group.add(body)
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(40 * S, 32, 32),
    new THREE.MeshBasicMaterial({
      color: theme.celestial,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  halo.position.copy(body.position)
  group.add(halo)

  if (theme.stars) {
    const count = 1400
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 0.95)
      const r = SKY_R * 0.95
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi)
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    group.add(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: 0xffffff,
          size: 2.2,
          sizeAttenuation: false,
          map: softDotTexture(),
          transparent: true,
          depthWrite: false,
          fog: false,
        }),
      ),
    )
  }

  if (theme.nebula) {
    const tex = softDotTexture()
    theme.nebula.forEach((color, i) => {
      for (let k = 0; k < 3; k++) {
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: tex,
            color,
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
            fog: false,
            blending: THREE.AdditiveBlending,
          }),
        )
        const a = (i * 3 + k) * 0.75 + 0.4
        const r = SKY_R * 0.85
        sprite.position.set(Math.cos(a) * r, 300 + ((i + k) % 3) * 260, Math.sin(a) * r)
        const size = 900 + ((i * 7 + k * 3) % 5) * 180
        sprite.scale.set(size * 1.6, size, 1)
        group.add(sprite)
      }
    })
  }

  return group
}

/** Tileable road texture: base colour + speckles (moss, frost, sprinkles) or lava cracks. */
export function makeStreetTexture(street) {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  ctx.fillStyle = street.color
  ctx.fillRect(0, 0, size, size)
  const specks = street.speck || []
  let seed = 1337
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  if (street.cracks) {
    ctx.lineWidth = 1.6
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = specks[i % specks.length]
      ctx.beginPath()
      let x = rand() * size
      let y = rand() * size
      ctx.moveTo(x, y)
      for (let s = 0; s < 5; s++) {
        x += (rand() - 0.5) * 30
        y += (rand() - 0.5) * 30
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  } else {
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = specks[i % specks.length]
      ctx.globalAlpha = 0.35 + rand() * 0.5
      const s = 1 + rand() * 2.5
      ctx.fillRect(rand() * size, rand() * size, s, s)
    }
    ctx.globalAlpha = 1
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

/**
 * Floating particle field over the city. Returns { points, update(delta, time) } or null.
 * bounds: { minX, maxX, minZ, maxZ, top }
 */
export function createThemeParticles(theme, bounds) {
  const spec = theme.particles
  if (!spec) return null
  const { kind, count, size } = spec
  const { minX, maxX, minZ, maxZ, top } = bounds
  const spanX = maxX - minX
  const spanZ = maxZ - minZ

  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const speed = new Float32Array(count)
  const phase = new Float32Array(count)
  const tmp = new THREE.Color()

  const lowFlyer = kind === 'fireflies'
  for (let i = 0; i < count; i++) {
    positions[i * 3] = minX + Math.random() * spanX
    positions[i * 3 + 1] = lowFlyer ? 2 + Math.random() * 40 : Math.random() * top
    positions[i * 3 + 2] = minZ + Math.random() * spanZ
    tmp.set(spec.colors[i % spec.colors.length])
    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
    speed[i] = 0.6 + Math.random() * 0.8
    phase[i] = Math.random() * Math.PI * 2
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const glowing = kind !== 'leaves' && kind !== 'snow'
  const material = new THREE.PointsMaterial({
    size,
    map: kind === 'leaves' ? leafTexture() : softDotTexture(),
    vertexColors: true,
    transparent: true,
    opacity: kind === 'snow' ? 0.9 : 1,
    depthWrite: false,
    blending: glowing ? THREE.AdditiveBlending : THREE.NormalBlending,
  })
  const points = new THREE.Points(geo, material)
  points.frustumCulled = false
  points.name = `themeParticles-${kind}`

  function wrap(i) {
    const p = i * 3
    if (positions[p] < minX) positions[p] += spanX
    if (positions[p] > maxX) positions[p] -= spanX
    if (positions[p + 2] < minZ) positions[p + 2] += spanZ
    if (positions[p + 2] > maxZ) positions[p + 2] -= spanZ
  }

  function update(delta, time) {
    for (let i = 0; i < count; i++) {
      const p = i * 3
      const s = speed[i]
      const ph = phase[i]
      switch (kind) {
        case 'embers':
          positions[p] += Math.sin(time * 1.3 + ph) * 3 * delta
          positions[p + 1] += (6 + s * 10) * delta
          positions[p + 2] += Math.cos(time * 1.1 + ph) * 3 * delta
          if (positions[p + 1] > top) positions[p + 1] = 0
          break
        case 'leaves':
          positions[p] += (Math.sin(time * 0.9 + ph) * 6 + 2.5) * delta
          positions[p + 1] -= (2.5 + s * 3) * delta
          positions[p + 2] += Math.cos(time * 0.7 + ph) * 4 * delta
          if (positions[p + 1] < 0) positions[p + 1] = top
          break
        case 'snow':
          positions[p] += Math.sin(time * 0.6 + ph) * 1.8 * delta
          positions[p + 1] -= (3 + s * 4) * delta
          if (positions[p + 1] < 0) positions[p + 1] = top
          break
        case 'fireflies':
          positions[p] += Math.sin(time * 0.8 * s + ph) * 4 * delta
          positions[p + 1] += Math.cos(time * 1.1 * s + ph) * 2 * delta
          positions[p + 2] += Math.sin(time * 0.6 * s + ph * 1.7) * 4 * delta
          break
        case 'stardust':
          positions[p] += Math.sin(time * 0.2 + ph) * 0.8 * delta
          positions[p + 1] += Math.cos(time * 0.25 + ph) * 0.6 * delta
          break
        case 'prism': {
          positions[p + 1] += Math.sin(time * 0.8 + ph) * 2 * delta
          tmp.setHSL((time * 0.08 + ph / (Math.PI * 2)) % 1, 0.9, 0.7)
          colors[p] = tmp.r
          colors[p + 1] = tmp.g
          colors[p + 2] = tmp.b
          break
        }
        default:
          break
      }
      wrap(i)
    }
    geo.attributes.position.needsUpdate = true
    if (kind === 'prism') geo.attributes.color.needsUpdate = true
    if (kind === 'fireflies' || kind === 'stardust') {
      material.opacity = 0.65 + 0.35 * Math.sin(time * 2.2)
    }
  }

  return { points, update }
}

function buildGearGeometry(teeth = 10) {
  const parts = []
  const disc = new THREE.CylinderGeometry(1, 1, 0.3, 24)
  disc.rotateX(Math.PI / 2)
  parts.push(disc)
  const hub = new THREE.CylinderGeometry(0.32, 0.32, 0.5, 12)
  hub.rotateX(Math.PI / 2)
  parts.push(hub)
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2
    const tooth = new THREE.BoxGeometry(0.36, 0.34, 0.3)
    tooth.rotateZ(a)
    tooth.translate(Math.cos(a + Math.PI / 2) * 1.12, Math.sin(a + Math.PI / 2) * 1.12, 0)
    parts.push(tooth)
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()))
}

/**
 * Copper gears mounted on building faces (steampunk). Each placement:
 * { x, y, z, yaw, radius, speed } — the gear disc faces along its yaw direction.
 */
export function createGearDecorations(placements) {
  if (!placements.length) return null
  // Low metalness on purpose: there's no env map, so a very metallic copper renders near-black.
  const material = new THREE.MeshStandardMaterial({
    color: '#d08a48',
    metalness: 0.4,
    roughness: 0.4,
    emissive: '#8a4a1a',
    emissiveIntensity: 0.55,
  })
  const mesh = new THREE.InstancedMesh(buildGearGeometry(), material, placements.length)
  mesh.name = 'steampunkGears'
  mesh.frustumCulled = false
  const dummy = new THREE.Object3D()

  function sync(time) {
    placements.forEach((g, i) => {
      dummy.position.set(g.x, g.y, g.z)
      dummy.rotation.set(0, g.yaw, time * g.speed)
      dummy.scale.setScalar(g.radius)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }
  sync(0)
  return { mesh, update: sync }
}
