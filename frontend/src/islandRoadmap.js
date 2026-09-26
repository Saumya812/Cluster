/**
 * Fantasy island roadmap — sunset sky, GLB islands, rope bridges, resume marker.
 */
import * as THREE from 'three'
import { cloneKenneyProp, placeOnSurface } from './kenneyAssets.js'
import {
  cloneIslandModel,
  darkenIslandMaterials,
  createInstancedIslandBodies,
  getIslandPlacementMetrics,
} from './fantasyIslandModel.js'

const ISLAND_GAP_Y = 42
const TOP_RADIUS = 22
const ZIGZAG_X = 40
const SURFACE_Y = 1.32
const ISLAND_MODEL_SCALE = 0.05

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

function themeForLevel(levelNum) {
  const n = levelNum || 1
  if (n <= 3) {
    const variants = [
      { rock: 0x4a4540, grass: 0x3d9e3a, accent: 0xe8b86d, building: 0x8a7060, roof: 0x6a4a38, light: 0xffd9a0 },
      { rock: 0x524840, grass: 0x48b048, accent: 0xf0d090, building: 0x9a8068, roof: 0x7a5538, light: 0xffe4b5 },
      { rock: 0x3f3a36, grass: 0x349638, accent: 0xd4a574, building: 0x7a6048, roof: 0x5a3a28, light: 0xf5deb3 },
    ]
    return variants[(n - 1) % 3]
  }
  if (n <= 6) {
    const variants = [
      { rock: 0x3a4a50, grass: 0x2a9a6a, accent: 0x5ec8c0, building: 0x4a6870, roof: 0x2a6a6a, light: 0xa8e8e0 },
      { rock: 0x354858, grass: 0x3aa888, accent: 0x6ab8d8, building: 0x3a5a70, roof: 0x3a6a88, light: 0xb0d8f0 },
      { rock: 0x404850, grass: 0x389870, accent: 0x7ab0a8, building: 0x506870, roof: 0x4a7880, light: 0xc0e0d8 },
    ]
    return variants[(n - 4) % 3]
  }
  if (n <= 9) {
    const variants = [
      { rock: 0x3a3048, grass: 0x2a6a58, accent: 0x9a6ad8, building: 0x4a3a5a, roof: 0x5a2a7a, light: 0xd8b0f8 },
      { rock: 0x2a3048, grass: 0x1a5a58, accent: 0x5a7ad8, building: 0x2a3a55, roof: 0x2a4a70, light: 0xb0c8f8 },
      { rock: 0x2a3840, grass: 0x1a6a55, accent: 0x3a9a9a, building: 0x2a4050, roof: 0x1a5a60, light: 0x90e0d8 },
    ]
    return variants[(n - 7) % 3]
  }
  return {
    rock: 0x5a5040,
    grass: 0x3aef5a,
    accent: 0xffd700,
    building: 0xc4a040,
    roof: 0x2ecc71,
    light: 0xfff4b0,
  }
}

function desaturateHex(hex, amount = 0.45) {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  hsl.s *= 1 - amount
  hsl.l = Math.min(0.62, hsl.l * 0.88 + 0.14)
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l)
}

/** Clean white text on a dark pill — no colored borders. */
function makeLabel(text, { scaleX = 14, scaleY = 2.6, fontSize = 30 } = {}) {
  const RES = 2.5
  const px = Math.round(fontSize * RES)
  const font = `700 ${px}px Sora, system-ui, sans-serif`
  const measureCtx = document.createElement('canvas').getContext('2d')
  measureCtx.font = font
  const padX = px * 0.9
  const padY = px * 0.45
  const tw = Math.ceil(measureCtx.measureText(text).width + padX * 2)
  const th = Math.ceil(px + padY * 2)

  const canvas = document.createElement('canvas')
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(12, 14, 22, 0.88)'
  ctx.beginPath()
  ctx.roundRect(0, 0, tw, th, th / 2)
  ctx.fill()

  ctx.font = font
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, tw / 2, th / 2 + px * 0.04)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  let worldH = scaleY * 0.5
  let worldW = worldH * (tw / th)
  if (worldW > scaleX * 1.3) {
    worldH *= (scaleX * 1.3) / worldW
    worldW = scaleX * 1.3
  }
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    }),
  )
  sprite.scale.set(worldW, worldH, 1)
  sprite.renderOrder = 20
  return sprite
}

/** Strong zigzag + depth scatter — no two consecutive share x or z. */
function islandOffset(index) {
  const level = index + 1
  const side = level % 2 === 1 ? -1 : 1
  const x = side * (ZIGZAG_X + (index % 3) * 7 + (index % 5) * 2)
  const zPatterns = [24, -20, 30, -28, 18, -32, 26, -16, 34, -24]
  let z = zPatterns[index % zPatterns.length]
  if (index > 0) {
    const prev = islandOffset(index - 1)
    if (Math.abs(z - prev.z) < 10) z = prev.z + (side > 0 ? 16 : -16)
  }
  return { x, z }
}

function makeRockTexture(seed) {
  const rng = mulberry32(seed)
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#4a4642'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 80; i++) {
    const shade = 50 + Math.floor(rng() * 40)
    ctx.fillStyle = `rgb(${shade},${shade - 4},${shade - 8})`
    ctx.beginPath()
    ctx.ellipse(rng() * 256, rng() * 256, 8 + rng() * 28, 6 + rng() * 18, rng() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(20, 18, 16, 0.55)'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 28; i++) {
    ctx.beginPath()
    let x = rng() * 256
    let y = rng() * 256
    ctx.moveTo(x, y)
    for (let j = 0; j < 4; j++) {
      x += (rng() - 0.5) * 40
      y += (rng() - 0.3) * 36
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

function rockMat(locked, tint, map) {
  const color = locked ? desaturateHex(tint, 0.45) : new THREE.Color(tint)
  return new THREE.MeshStandardMaterial({
    color,
    map: map || null,
    roughness: 0.94,
    metalness: 0.05,
    flatShading: true,
    transparent: locked,
    opacity: locked ? 0.72 : 1,
    emissive: new THREE.Color(0xff8040).multiplyScalar(locked ? 0.02 : 0.06),
    emissiveIntensity: 0.2,
  })
}

function grassMat(locked, shade) {
  const color = locked ? desaturateHex(shade, 0.4) : new THREE.Color(shade)
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0.02,
    transparent: locked,
    opacity: locked ? 0.7 : 1,
    emissive: color.clone().multiplyScalar(0.08),
    emissiveIntensity: locked ? 0.05 : 0.12,
  })
}

function addDirtPath(parent, topR, locked, rng) {
  const mat = new THREE.MeshStandardMaterial({
    color: locked ? 0x6a6570 : 0x8a6a48,
    roughness: 0.95,
    transparent: locked,
    opacity: locked ? 0.65 : 1,
  })
  const steps = 8
  let angle = rng() * Math.PI * 2
  let r = topR * 0.15
  for (let i = 0; i < steps; i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(1.4 + rng() * 0.6, 0.08, 2.2), mat)
    seg.rotation.x = -Math.PI / 2
    seg.rotation.z = angle + Math.PI / 2
    seg.position.set(Math.cos(angle) * r, SURFACE_Y - 0.2, Math.sin(angle) * r)
    seg.receiveShadow = true
    parent.add(seg)
    angle += (rng() - 0.45) * 0.55
    r = Math.min(topR * 0.75, r + 1.6 + rng())
  }
}

function decorateWithKenney(parent, topR, surfaceY, locked, rng, assets, { trees = true, rocks = true, buildings = true, shape = 0 } = {}) {
  if (!assets) return

  if (trees) {
    const treeCount = 3 + Math.floor(rng() * 3) // 3–5
    for (let i = 0; i < treeCount; i++) {
      const a = rng() * Math.PI * 2
      const r = 3.5 + rng() * Math.max(2, topR - 7)
      const tree = cloneKenneyProp(assets.trees, rng, { scale: 0.9 + rng() * 0.4, locked })
      if (!tree) continue
      placeOnSurface(tree, Math.cos(a) * r, Math.sin(a) * r, surfaceY)
      parent.add(tree)
    }
  }

  if (rocks) {
    const rockCount = 2 + Math.floor(rng() * 2) // 2–3
    for (let i = 0; i < rockCount; i++) {
      const a = rng() * Math.PI * 2
      const r = topR * (0.72 + rng() * 0.2)
      const rock = cloneKenneyProp(assets.rocks, rng, { scale: 0.8 + rng() * 0.6, locked })
      if (!rock) continue
      placeOnSurface(rock, Math.cos(a) * r, Math.sin(a) * r, surfaceY)
      parent.add(rock)
    }
  }

  if (buildings) {
    const buildingCount = shape === 1 ? 1 : 2 + Math.floor(rng() * 2) // 2–3 (1 on tall)
    for (let i = 0; i < buildingCount; i++) {
      const a = (i / Math.max(buildingCount, 1)) * Math.PI * 2 - Math.PI / 2 + rng() * 0.35
      const r = shape === 1 ? 1.5 + rng() : 4 + rng() * (topR * 0.35)
      const bldg = cloneKenneyProp(assets.buildings, rng, {
        scale: shape === 1 ? 1.1 : 0.65 + rng() * 0.35,
        locked,
        yRot: -a + Math.PI,
      })
      if (!bldg) continue
      placeOnSurface(bldg, Math.cos(a) * r, Math.sin(a) * r, surfaceY)
      parent.add(bldg)
    }
  }
}

/**
 * Place a cloned GLB island mesh into `group` (fallback when instancing is off).
 * @returns {{ topR: number, surfaceY: number } | null}
 */
function addGlbIslandBody(group, islandTemplate, locked, rng) {
  if (!islandTemplate) return null

  const model = cloneIslandModel(islandTemplate)
  model.name = 'island-glb'
  model.scale.set(ISLAND_MODEL_SCALE, ISLAND_MODEL_SCALE, ISLAND_MODEL_SCALE)
  model.rotation.y = rng() * Math.PI * 2
  model.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(model)
  model.position.y += SURFACE_Y - box.max.y
  model.updateMatrixWorld(true)

  if (locked) {
    darkenIslandMaterials(model, 0.4)
  }

  group.add(model)

  const placed = new THREE.Box3().setFromObject(model)
  const placedSize = new THREE.Vector3()
  placed.getSize(placedSize)
  const topR = Math.max(placedSize.x, placedSize.z) * 0.42
  return { topR: Math.max(topR, 8), surfaceY: placed.max.y }
}

function buildProceduralIslandBody(group, locked, rng, shape, topR) {
  const tipH = shape === 1 ? 26 + rng() * 8 : 18 + rng() * 10
  const rockMap = makeRockTexture(Math.floor(rng() * 10000))

  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(topR * 0.55, tipH, 5 + Math.floor(rng() * 3)),
    rockMat(locked, 0x4a4540, rockMap),
  )
  tip.position.y = -tipH * 0.42
  tip.rotation.y = rng() * Math.PI
  tip.castShadow = true
  tip.receiveShadow = true
  group.add(tip)

  const chunkCount = 9 + Math.floor(rng() * 6)
  for (let i = 0; i < chunkCount; i++) {
    const a = (i / chunkCount) * Math.PI * 2 + rng() * 0.35
    const r = topR * (0.35 + rng() * 0.55)
    const s = 2.2 + rng() * 3.5
    const chunk = new THREE.Mesh(
      new THREE.ConeGeometry(s * 0.45, s * 2.2 + rng() * 4, 5),
      rockMat(locked, 0x3f3a36, rockMap),
    )
    chunk.position.set(Math.cos(a) * r * 0.8, -3 - rng() * 10, Math.sin(a) * r * 0.8)
    chunk.rotation.set(rng() * 0.5, rng() * 2, (rng() - 0.5) * 0.6)
    chunk.castShadow = true
    group.add(chunk)
  }

  if (shape === 2) {
    const cliff = new THREE.Mesh(
      new THREE.BoxGeometry(topR * 0.95, 8 + rng() * 5, topR * 0.5),
      rockMat(locked, 0x45403c, rockMap),
    )
    cliff.position.set(topR * 0.65, 0.5, -topR * 0.15)
    cliff.rotation.z = -0.32
    cliff.castShadow = true
    group.add(cliff)
  }

  const shelf = new THREE.Mesh(
    new THREE.CylinderGeometry(topR * 0.98, topR * 1.15, 3.2, 8),
    rockMat(locked, 0x4a4540, rockMap),
  )
  shelf.position.y = -0.4
  shelf.castShadow = true
  shelf.receiveShadow = true
  group.add(shelf)

  const grass = new THREE.Mesh(
    new THREE.CylinderGeometry(topR, topR * 0.99, 0.55, 16),
    grassMat(locked, 0x3cb043),
  )
  grass.position.y = 1.05
  grass.receiveShadow = true
  grass.castShadow = true
  group.add(grass)

  for (let i = 0; i < 4 + Math.floor(rng() * 3); i++) {
    const pw = 3 + rng() * 5
    const patch = new THREE.Mesh(
      new THREE.CircleGeometry(pw * 0.45, 8),
      grassMat(locked, 0x2e8b3a),
    )
    patch.rotation.x = -Math.PI / 2
    const a = rng() * Math.PI * 2
    const r = rng() * (topR - 4)
    patch.position.set(Math.cos(a) * r, 1.34, Math.sin(a) * r)
    group.add(patch)
  }

  addDirtPath(group, topR, locked, rng)
  return { topR, surfaceY: SURFACE_Y }
}

function buildFantasyIsland(
  level,
  theme,
  state,
  index,
  assets = null,
  islandTemplate = null,
  { skipGlbBody = false, metrics = null } = {},
) {
  const group = new THREE.Group()
  group.name = `island-${level.id}`
  const rng = mulberry32(index * 9973 + (level.level || 1) * 131)
  const completed = state === 'completed'
  const current = state === 'current'
  const locked = state === 'locked'
  const shape = index % 3

  const scaleXZ = shape === 1 ? 0.78 : shape === 0 ? 1.35 : 1.05
  let topR = TOP_RADIUS * scaleXZ
  let surfaceY = SURFACE_Y

  if (skipGlbBody && metrics) {
    topR = metrics.topR
    surfaceY = metrics.surfaceY
    decorateWithKenney(group, topR, surfaceY, locked, rng, assets, {
      trees: true,
      rocks: true,
      buildings: false,
      shape,
    })
  } else {
    const glb = addGlbIslandBody(group, islandTemplate, locked, rng)
    if (glb) {
      topR = glb.topR
      surfaceY = glb.surfaceY
      decorateWithKenney(group, topR, surfaceY, locked, rng, assets, {
        trees: true,
        rocks: true,
        buildings: false,
        shape,
      })
    } else {
      const body = buildProceduralIslandBody(group, locked, rng, shape, topR)
      topR = body.topR
      surfaceY = body.surfaceY
      decorateWithKenney(group, topR, surfaceY, locked, rng, assets, {
        trees: true,
        rocks: true,
        buildings: true,
        shape,
      })
    }
  }

  let edgeGlow = null
  if (current) {
    edgeGlow = new THREE.Mesh(
      new THREE.TorusGeometry(topR + 0.6, 0.12, 8, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffc878,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    )
    edgeGlow.rotation.x = Math.PI / 2
    edgeGlow.position.y = surfaceY + 0.15
    group.add(edgeGlow)
  }

  const pct = Math.max(level.progress_pct || 0, completed ? 1 : 0, current ? 0.12 : 0)
  const growthH = 2.5 + pct * 7
  const growthCol = locked
    ? desaturateHex(theme.accent, 0.45)
    : completed
      ? new THREE.Color(0x3cb043)
      : new THREE.Color(theme.accent)
  const growth = new THREE.Mesh(
    new THREE.ConeGeometry(1.2, growthH, 5),
    new THREE.MeshStandardMaterial({
      color: growthCol,
      emissive: growthCol,
      emissiveIntensity: locked ? 0.08 : 0.22,
      roughness: 0.5,
      transparent: locked,
      opacity: locked ? 0.65 : 1,
    }),
  )
  growth.position.set(0, surfaceY + growthH / 2, 0)
  group.add(growth)

  const labelY = surfaceY + (shape === 1 ? 26 : 22)
  const label = makeLabel(`Level ${level.level}: ${level.name}`, {
    scaleX: 28,
    scaleY: 5.2,
    fontSize: 40,
  })
  label.position.set(0, labelY, 0)
  group.add(label)

  const here = makeLabel('YOU ARE HERE', { scaleX: 16, scaleY: 3.2, fontSize: 30 })
  here.position.set(0, labelY + 4.2, 0)
  here.visible = false
  group.add(here)

  group.userData = {
    kind: 'island',
    levelId: level.id,
    level,
    state,
    edgeGlow,
    hereMarker: here,
    clickable: !locked,
    locked,
    index,
    theme,
    topRadius: topR,
  }

  group.traverse((obj) => {
    if (obj.isMesh) obj.userData = { ...group.userData, hereMarker: here, edgeGlow }
  })

  // Fat invisible pick volume covering the full island body (GLB or procedural).
  const hitR = Math.max(topR * 1.35, metrics?.size ? Math.max(metrics.size.x, metrics.size.z) * 0.55 : 0, 16)
  const hitH = Math.max(metrics?.size?.y ? metrics.size.y * 1.1 : 36, 36)
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(hitR, hitR * 0.85, hitH, 16),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    }),
  )
  hit.position.y = surfaceY - hitH * 0.25
  hit.userData = group.userData
  // Always raycastable even when camera is close / looking from below.
  hit.raycast = THREE.Mesh.prototype.raycast
  group.add(hit)

  // Extra sphere around the floating level name so the label itself opens the level.
  const labelHit = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(hitR * 0.55, 12), 12, 10),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    }),
  )
  labelHit.position.set(0, labelY, 0)
  labelHit.userData = group.userData
  group.add(labelHit)

  return group
}

function buildRopeBridge(from, to, unlocked) {
  const group = new THREE.Group()
  group.name = 'ropeBridge'
  const mid = from.clone().lerp(to, 0.5)
  const sag = mid.clone()
  sag.y -= 6 + from.distanceTo(to) * 0.04

  const ropeMat = new THREE.MeshStandardMaterial({
    color: unlocked ? 0xd4a84a : 0x7a8490,
    emissive: unlocked ? 0xa07820 : 0x000000,
    emissiveIntensity: unlocked ? 0.15 : 0,
    roughness: 0.7,
    transparent: !unlocked,
    opacity: unlocked ? 1 : 0.45,
  })
  const plankMat = new THREE.MeshStandardMaterial({
    color: unlocked ? 0x8b5a2b : 0x6a7078,
    roughness: 0.88,
    transparent: !unlocked,
    opacity: unlocked ? 1 : 0.42,
  })

  function curvePoint(t) {
    const a = from.clone().lerp(sag, t)
    const b = sag.clone().lerp(to, t)
    return a.lerp(b, t)
  }

  const segs = 18
  const points = []
  for (let i = 0; i <= segs; i++) points.push(curvePoint(i / segs))

  const ropeMeshes = []
  const sideOffset = 0.95
  for (const side of [-1, 1]) {
    // Two ropes per side (handrail + foot rope)
    for (const rail of [0, 0.55]) {
      const offset = new THREE.Vector3().subVectors(to, from).cross(new THREE.Vector3(0, 1, 0))
      if (offset.lengthSq() < 0.001) offset.set(1, 0, 0)
      offset.normalize().multiplyScalar(side * sideOffset)
      for (let i = 0; i < segs; i++) {
        const a = points[i].clone().add(offset)
        a.y += rail
        const b = points[i + 1].clone().add(offset)
        b.y += rail
        const len = a.distanceTo(b)
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, len, 6), ropeMat)
        rope.position.copy(a).add(b).multiplyScalar(0.5)
        rope.lookAt(b)
        rope.rotateX(Math.PI / 2)
        group.add(rope)
        ropeMeshes.push({ mesh: rope, baseY: rope.position.y, phase: i * 0.3 + side + rail })
      }
    }
  }

  for (let i = 1; i < segs; i++) {
    const p = points[i]
    const tangent = points[Math.min(i + 1, segs)].clone().sub(points[i - 1]).normalize()
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 0.72), plankMat)
    plank.position.copy(p)
    plank.lookAt(p.clone().add(tangent))
    plank.rotateY(Math.PI / 2)
    plank.castShadow = true
    group.add(plank)
    ropeMeshes.push({ mesh: plank, baseY: plank.position.y, phase: i * 0.35 })
  }

  group.userData.swayParts = ropeMeshes
  return group
}

export function buildSunsetSky() {
  const group = new THREE.Group()
  group.name = 'sunsetSky'

  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 512)
  g.addColorStop(0, '#4a2868') // soft purple top
  g.addColorStop(0.35, '#d46898') // pink mid
  g.addColorStop(0.7, '#f07840') // orange
  g.addColorStop(1, '#ff9a50') // warm horizon
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 8, 512)
  const skyTex = new THREE.CanvasTexture(canvas)
  skyTex.colorSpace = THREE.SRGBColorSpace
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 32, 24),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false }),
  )
  group.add(sky)

  // Full moon — upper right, far back (world-fixed with the sky, not camera-attached)
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(26, 32, 32),
    new THREE.MeshBasicMaterial({
      color: 0xfff4cc,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  )
  moon.position.set(240, 250, -360)
  group.add(moon)

  const moonHalo = new THREE.Mesh(
    new THREE.SphereGeometry(40, 32, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffe8b0,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  moonHalo.position.copy(moon.position)
  group.add(moonHalo)

  // Star field — upper purple sky only (not orange/pink lower half)
  const starCount = 2000
  const starPos = new Float32Array(starCount * 3)
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2
    // Keep stars near the top pole so they sit in the purple band only.
    const phi = Math.random() * (Math.PI * 0.32)
    const r = 390 + Math.random() * 25
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    starPos[i * 3 + 1] = r * Math.cos(phi)
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.75,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  )
  stars.frustumCulled = false
  group.add(stars)

  return group
}

export function createIslandRoadmap(scene, opts) {
  const {
    cityId,
    cityLabel = cityId,
    levels = [],
    lastLevelId = null,
    assets = null,
    islandModel = null,
    // Baseline perf path: deep-clone the GLB once per island (?islands=clone).
    forceCloneIslands = false,
  } = opts

  const root = new THREE.Group()
  root.name = `islandRoadmap-${cityId}`
  scene.add(root)

  const clickables = []
  const islandEntries = []
  const bridges = []

  root.add(buildSunsetSky())

  // Golden-hour lighting: warm sun from below-left horizon
  const hemi = new THREE.HemisphereLight(0xffe0c8, 0x4a3060, 0.85)
  root.add(hemi)

  const sunLight = new THREE.DirectionalLight(0xffb070, 1.45)
  sunLight.position.set(-80, -10, 40)
  // Island GLBs are heavy — skip shadow maps on the roadmap.
  sunLight.castShadow = false
  root.add(sunLight)

  const fill = new THREE.DirectionalLight(0xff9060, 0.45)
  fill.position.set(-40, 5, -30)
  root.add(fill)

  root.add(new THREE.AmbientLight(0xffe8d0, 0.4))

  const useInstances = Boolean(islandModel) && levels.length > 0 && !forceCloneIslands
  const metrics = useInstances
    ? getIslandPlacementMetrics(ISLAND_MODEL_SCALE, SURFACE_Y)
    : null
  const instanced = useInstances
    ? createInstancedIslandBodies(root, islandModel, levels.length)
    : null
  const instanceMatrix = new THREE.Matrix4()
  const instancePos = new THREE.Vector3()
  const instanceQuat = new THREE.Quaternion()
  const instanceScale = new THREE.Vector3(
    ISLAND_MODEL_SCALE,
    ISLAND_MODEL_SCALE,
    ISLAND_MODEL_SCALE,
  )
  const upAxis = new THREE.Vector3(0, 1, 0)

  if (useInstances) {
    console.log(
      `[roadmap] instanced islands: ${levels.length} islands × ${instanced.partCount} merged draw call(s)`,
    )
    // Instanced GLB bodies are the thing you see — make them clickable by instanceId.
    for (const mesh of instanced.meshes) {
      mesh.userData.kind = 'islandInstances'
      mesh.userData.levels = levels
      clickables.push(mesh)
    }
  } else if (forceCloneIslands && islandModel) {
    console.log(`[roadmap] clone baseline: ${levels.length} full GLB clones`)
  }

  levels.forEach((level, i) => {
    const theme = themeForLevel(level.level || i + 1)
    const off = islandOffset(i)
    const y = i * ISLAND_GAP_Y
    const rng = mulberry32(i * 9973 + (level.level || 1) * 131)
    const rotY = rng() * Math.PI * 2
    const locked = (level.state || 'locked') === 'locked'

    if (instanced && metrics) {
      instancePos.set(off.x, y + metrics.yLift, off.z)
      instanceQuat.setFromAxisAngle(upAxis, rotY)
      instanceMatrix.compose(instancePos, instanceQuat, instanceScale)
      instanced.setInstance(i, instanceMatrix, locked)
    }

    const island = buildFantasyIsland(
      level,
      theme,
      level.state || 'locked',
      i,
      assets,
      useInstances ? null : islandModel,
      useInstances
        ? { skipGlbBody: true, metrics }
        : { skipGlbBody: false, metrics: null },
    )
    island.position.set(off.x, y, off.z)
    root.add(island)
    // Hit volumes + overlays (and clones when not instanced).
    island.traverse((obj) => {
      if (obj.isMesh) clickables.push(obj)
    })
    islandEntries.push({ level, island, y, off, theme })

    if (lastLevelId && level.id === lastLevelId) {
      island.userData.hereMarker.visible = true
    }

    if (i > 0) {
      const prev = islandEntries[i - 1]
      const from = new THREE.Vector3(prev.off.x, prev.y + 1.5, prev.off.z)
      const to = new THREE.Vector3(off.x, y + 1.5, off.z)
      const unlocked = prev.level.state === 'completed' || level.state === 'current'
      const bridge = buildRopeBridge(from, to, unlocked)
      root.add(bridge)
      bridges.push(bridge)
    }
  })

  instanced?.finalize()

  let pulseT = 0
  let visible = true
  const stackHeight = Math.max(levels.length - 1, 1) * ISLAND_GAP_Y

  /** Full-path overview — all islands visible without zooming out. */
  function cameraOverviewPose() {
    const focusY = stackHeight * 0.45
    const focusX = 0
    const focusZ = 0
    // 3x farther than the original overview so the camera starts outside the islands.
    const dist = Math.max(220, stackHeight * 0.85 + 80) * 3
    const angle = Math.PI / 5
    return {
      position: new THREE.Vector3(
        focusX + Math.sin(angle) * dist,
        focusY + 165,
        focusZ + Math.cos(angle) * dist,
      ),
      lookAt: new THREE.Vector3(focusX, focusY + 8, focusZ),
      target: new THREE.Vector3(focusX, focusY + 8, focusZ),
    }
  }

  function cameraStartPose(focusLevelId = null) {
    // Default / resume: always show the full winding path
    void focusLevelId
    return cameraOverviewPose()
  }

  return {
    root,
    clickables,
    cityId,
    cityLabel,
    levels,
    islandEntries,
    stackHeight,
    cameraStartPose,
    cameraOverviewPose,
    show() {
      visible = true
      root.visible = true
    },
    hide() {
      visible = false
      root.visible = false
    },
    get isVisible() {
      return visible
    },
    update(_time, delta) {
      if (!visible) return
      pulseT += delta
      for (const entry of islandEntries) {
        const glow = entry.island.userData.edgeGlow
        if (glow?.material) {
          glow.material.opacity = 0.3 + Math.sin(pulseT * 2.2) * 0.18
        }
      }
      for (const bridge of bridges) {
        for (const part of bridge.userData.swayParts || []) {
          part.mesh.position.y = part.baseY + Math.sin(pulseT * 1.4 + part.phase) * 0.09
        }
      }
    },
    pick(raycaster) {
      const hits = raycaster.intersectObjects(clickables, true)
      for (const hit of hits) {
        const obj = hit.object
        // Clicked the visible instanced GLB body
        if (obj.userData?.kind === 'islandInstances' && hit.instanceId != null) {
          const level = obj.userData.levels?.[hit.instanceId]
          if (level) {
            return {
              level,
              locked: (level.state || 'locked') === 'locked',
              state: level.state,
              point: hit.point.clone(),
            }
          }
        }
        let walk = obj
        while (walk) {
          if (walk.userData?.kind === 'island' && walk.userData.level) {
            return {
              level: walk.userData.level,
              locked: !!walk.userData.locked,
              state: walk.userData.state,
              point: hit.point.clone(),
            }
          }
          walk = walk.parent
        }
      }
      return null
    },
    dispose() {
      scene.remove(root)
    },
  }
}

export function animateCameraTo(camera, { position, lookAt }, duration = 1100) {
  return new Promise((resolve) => {
    const startPos = camera.position.clone()
    const startTarget = new THREE.Vector3()
    camera.getWorldDirection(startTarget)
    startTarget.multiplyScalar(20).add(camera.position)
    const endPos = position.clone()
    const endLook = lookAt.clone()
    const t0 = performance.now()
    function step(now) {
      const u = Math.min((now - t0) / duration, 1)
      const s = u * u * (3 - 2 * u)
      camera.position.lerpVectors(startPos, endPos, s)
      camera.lookAt(startTarget.clone().lerp(endLook, s))
      if (u < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
}

export { ISLAND_GAP_Y, islandOffset }
