/**
 * Shared educational city layout — wide flyable streets, dense blocks, tapered Growth Tower.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createWindowTextures, hashStringToSeed } from './windowTexture.js'
import { getKenneyAssets, placeOnSurface } from './kenneyAssets.js'
import { buildAmusementPark } from './amusementPark.js'
import { buildSunsetSky } from './islandRoadmap.js'
import {
  buildThemedSky,
  createGearDecorations,
  createThemeParticles,
  getLevelTheme,
  makeStreetTexture,
} from './levelThemes.js'

const BASE_GROWTH_H = 14
const PLAZA_RADIUS = 28
const CELL = 24 // roomy but not barren
const FOOTPRINT = 8
const ROAD_W = 28 // wide streets — readable from aerial / horizon
const BLOCK_GAP = 8 // empty lots between blocks as road shoulders
const MIN_H = 14
const MAX_H = 70

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

/**
 * Canvas is sized to the measured text (never clipped) and drawn at 2× for
 * crisp edges. `scaleY` is world height per line; `scaleX * 2` caps width.
 * Use '\n' for multi-line; `lineColors` overrides colour per line.
 */
function makeTextSprite(
  text,
  colorHex,
  { scaleX = 14, scaleY = 3, fontSize = 40, lineColors = null, glow = false } = {},
) {
  const RES = 2
  const lines = String(text).split('\n')
  const px = fontSize * RES
  const font = `700 ${px}px "Bebas Neue", Sora, sans-serif`
  const measureCtx = document.createElement('canvas').getContext('2d')
  measureCtx.font = font
  const textW = Math.max(...lines.map((l) => measureCtx.measureText(l).width))
  const padX = px * 0.7
  const lineH = px * 1.15
  const padY = px * 0.4
  const w = Math.ceil(textW + padX * 2)
  const h = Math.ceil(lineH * lines.length + padY * 2)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const r = Math.min(h / 2, px * 0.6)
  ctx.fillStyle = 'rgba(5, 8, 20, 0.8)'
  ctx.beginPath()
  ctx.roundRect(RES, RES, w - RES * 2, h - RES * 2, r)
  ctx.fill()
  ctx.lineWidth = RES * 1.5
  ctx.strokeStyle = colorHex
  ctx.globalAlpha = 0.55
  ctx.stroke()
  ctx.globalAlpha = 1

  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (glow) {
    ctx.shadowColor = colorHex
    ctx.shadowBlur = px * 0.35
  }
  lines.forEach((line, i) => {
    ctx.fillStyle = lineColors?.[i] || colorHex
    ctx.fillText(line, w / 2, padY + lineH * (i + 0.5))
  })

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
  )
  let worldH = scaleY * lines.length
  let worldW = worldH * (w / h)
  const maxW = scaleX * 2
  if (worldW > maxW) {
    worldH *= maxW / worldW
    worldW = maxW
  }
  sprite.scale.set(worldW, worldH, 1)
  sprite.renderOrder = 5
  return sprite
}

export function growthStatsFromProgress(progressList, totalBuildings, allowedBuildingIds) {
  const rows = progressList || []
  let filtered = rows
  if (allowedBuildingIds) {
    const allow =
      allowedBuildingIds instanceof Set
        ? allowedBuildingIds
        : allowedBuildingIds instanceof Map
          ? allowedBuildingIds
          : new Set(allowedBuildingIds)
    filtered = rows.filter((r) => allow.has(r.building_id))
  } else {
    // Drop Backboard/memory-synced IDs that are not real curriculum buildings.
    filtered = rows.filter((r) => !String(r.building_id || '').includes('-mem-'))
  }
  const scored = filtered.filter((r) => (r.quiz_score || 0) > 0)
  const total = Math.max(0, Number(totalBuildings) || 0)
  const completed = Math.min(scored.length, total)
  const scores = scored.map((r) => r.quiz_score)
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const pct = total > 0 ? completed / total : 0
  const height = BASE_GROWTH_H + completed * 1.1 + (avgScore / 100) * 10
  let milestone = 0
  if (pct >= 1) milestone = 100
  else if (pct >= 0.75) milestone = 75
  else if (pct >= 0.5) milestone = 50
  else if (pct >= 0.25) milestone = 25
  return { completed, totalBuildings: total, avgScore, pct, height, milestone }
}

function milestoneColor(milestone) {
  if (milestone >= 100) return new THREE.Color('#ffffff')
  if (milestone >= 75) return new THREE.Color('#fbbf24') // gold
  if (milestone >= 50) return new THREE.Color('#34d399') // green
  if (milestone >= 25) return new THREE.Color('#3b82f6') // blue
  return new THREE.Color('#64748b')
}

function addGrowthFence(root) {
  const fenceGroup = new THREE.Group()
  const radius = PLAZA_RADIUS - 2.2
  const posts = 64
  const brushMat = new THREE.MeshStandardMaterial({ color: 0x2d5a34, roughness: 0.92 })
  const flowerMat = new THREE.MeshBasicMaterial({ color: 0xe11d48 })
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2
    const x = Math.cos(a) * radius
    const z = Math.sin(a) * radius
    const brush = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.95, 0.6), brushMat)
    brush.position.set(x, 0.48, z)
    brush.rotation.y = -a
    fenceGroup.add(brush)
    for (let f = 0; f < 2 + (i % 3); f++) {
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), flowerMat)
      const ox = (f - 1) * 0.24
      flower.position.set(
        x + Math.cos(a) * 0.18 + Math.sin(a) * ox,
        1.0 + (f % 2) * 0.1,
        z + Math.sin(a) * 0.18 - Math.cos(a) * ox,
      )
      fenceGroup.add(flower)
    }
  }
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 1.1, radius + 0.9, 64),
    new THREE.MeshStandardMaterial({ color: 0x1a3d22, roughness: 1, side: THREE.DoubleSide }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.06
  fenceGroup.add(ring)
  root.add(fenceGroup)
}

/**
 * Trees, street lamps, and cars to fill the generous lot spacing.
 * Returns { update(delta) }.
 */
function addStreetLife(root, {
  streetZs,
  avenueXs,
  cityHalfX,
  cityHalfZ,
  plazaRadius,
  occupied,
  rng,
  roadW,
  cell,
  lampColor = 0xffd08a,
}) {
  const treePositions = []
  const lampPositions = []
  const carLanes = []

  function nearOccupied(x, z) {
    const step = cell * 0.5
    for (let dx = -step; dx <= step; dx += step) {
      for (let dz = -step; dz <= step; dz += step) {
        if (occupied.has(`${Math.round(x + dx)},${Math.round(z + dz)}`)) return true
      }
    }
    const kx = Math.round(x / cell) * cell
    const kz = Math.round(z / cell) * cell
    if (occupied.has(`${Math.round(kx)},${Math.round(kz)}`)) return true
    return false
  }

  // Sidewalk trees + lamps along every street (both curbs)
  for (const z of streetZs) {
    for (const side of [-1, 1]) {
      const curbZ = z + side * (roadW * 0.5 + 2.2)
      for (let x = -cityHalfX + cell; x <= cityHalfX - cell; x += cell * 0.85) {
        if (Math.hypot(x, curbZ) < plazaRadius + 6) continue
        if (nearOccupied(x, curbZ, cell * 0.38)) continue
        if (rng() < 0.78) treePositions.push([x + (rng() - 0.5) * 2, curbZ + (rng() - 0.5) * 1.2])
      }
      for (let x = -cityHalfX + cell * 1.2; x <= cityHalfX - cell; x += cell * 1.6) {
        if (Math.hypot(x, curbZ) < plazaRadius + 4) continue
        lampPositions.push([x, curbZ])
      }
    }
    // Driving lanes for cars on this street
    carLanes.push({
      horizontal: true,
      fixed: z - roadW * 0.22,
      min: -cityHalfX + 8,
      max: cityHalfX - 8,
      dir: 1,
    })
    carLanes.push({
      horizontal: true,
      fixed: z + roadW * 0.22,
      min: -cityHalfX + 8,
      max: cityHalfX - 8,
      dir: -1,
    })
  }

  // Trees filling the big gaps between streets / avenues
  for (let z = -cityHalfZ; z <= cityHalfZ; z += cell * 0.55) {
    for (let x = -cityHalfX; x <= cityHalfX; x += cell * 0.55) {
      if (Math.hypot(x, z) < plazaRadius + 10) continue
      let onRoad = false
      for (const sz of streetZs) {
        if (Math.abs(z - sz) < roadW * 0.55) onRoad = true
      }
      for (const ax of avenueXs) {
        if (Math.abs(x - ax) < roadW * 0.55) onRoad = true
      }
      if (onRoad) continue
      if (nearOccupied(x, z)) continue
      if (rng() > 0.35) continue
      treePositions.push([x + (rng() - 0.5) * 2.5, z + (rng() - 0.5) * 2.5])
    }
  }

  // Avenue lamps + cars
  for (const ax of avenueXs) {
    for (const side of [-1, 1]) {
      const curbX = ax + side * (roadW * 0.5 + 2.2)
      for (let z = -cityHalfZ + cell; z <= cityHalfZ - cell; z += cell * 1.5) {
        if (Math.hypot(curbX, z) < plazaRadius + 4) continue
        lampPositions.push([curbX, z])
        if (rng() < 0.5) treePositions.push([curbX + side * 2.5, z + (rng() - 0.5) * 2])
      }
    }
    carLanes.push({
      horizontal: false,
      fixed: ax - roadW * 0.22,
      min: -cityHalfZ + 8,
      max: cityHalfZ - 8,
      dir: 1,
    })
    carLanes.push({
      horizontal: false,
      fixed: ax + roadW * 0.22,
      min: -cityHalfZ + 8,
      max: cityHalfZ - 8,
      dir: -1,
    })
  }

  // A lamp on every street/avenue corner (unless a curb lamp already stands there)
  const cornerOff = roadW * 0.5 + 2.2
  for (const sz of streetZs) {
    for (const ax of avenueXs) {
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = ax + dx * cornerOff
        const z = sz + dz * cornerOff
        if (lampPositions.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 5)) continue
        lampPositions.push([x, z])
      }
    }
  }

  // --- Instanced trees (larger so they read from flight altitude) ---
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.48, 3.2, 6)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 1 })
  const coneGeo = new THREE.ConeGeometry(2.4, 5.2, 7)
  const roundGeo = new THREE.IcosahedronGeometry(2.6, 0)
  const foliageColors = [0x1f4d2b, 0x2c5f34, 0x255a3f, 0x3a6b2e, 0x1a5c38]
  const coneIdx = []
  const roundIdx = []
  treePositions.forEach((_, i) => (rng() < 0.55 ? coneIdx : roundIdx).push(i))

  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length)
  const coneMesh = new THREE.InstancedMesh(
    coneGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    Math.max(coneIdx.length, 1),
  )
  const roundMesh = new THREE.InstancedMesh(
    roundGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    Math.max(roundIdx.length, 1),
  )
  coneMesh.count = coneIdx.length
  roundMesh.count = roundIdx.length

  const dummy = new THREE.Object3D()
  const tmpColor = new THREE.Color()
  treePositions.forEach(([x, z], i) => {
    const scale = 1.15 + rng() * 0.85
    dummy.position.set(x, 1.6 * scale, z)
    dummy.scale.set(scale, scale, scale)
    dummy.rotation.y = rng() * Math.PI * 2
    dummy.updateMatrix()
    trunkMesh.setMatrixAt(i, dummy.matrix)
  })
  coneIdx.forEach((i, j) => {
    const [x, z] = treePositions[i]
    const scale = 1.15 + rng() * 0.85
    dummy.position.set(x, 4.2 * scale, z)
    dummy.scale.set(scale, scale, scale)
    dummy.rotation.y = rng() * Math.PI * 2
    dummy.updateMatrix()
    coneMesh.setMatrixAt(j, dummy.matrix)
    coneMesh.setColorAt(j, tmpColor.set(foliageColors[Math.floor(rng() * foliageColors.length)]))
  })
  roundIdx.forEach((i, j) => {
    const [x, z] = treePositions[i]
    const scale = 1.15 + rng() * 0.85
    dummy.position.set(x, 3.6 * scale, z)
    dummy.scale.set(scale, scale, scale)
    dummy.rotation.y = rng() * Math.PI * 2
    dummy.updateMatrix()
    roundMesh.setMatrixAt(j, dummy.matrix)
    roundMesh.setColorAt(j, tmpColor.set(foliageColors[Math.floor(rng() * foliageColors.length)]))
  })
  trunkMesh.instanceMatrix.needsUpdate = true
  coneMesh.instanceMatrix.needsUpdate = true
  roundMesh.instanceMatrix.needsUpdate = true
  if (coneMesh.instanceColor) coneMesh.instanceColor.needsUpdate = true
  if (roundMesh.instanceColor) roundMesh.instanceColor.needsUpdate = true
  if (treePositions.length) root.add(trunkMesh, coneMesh, roundMesh)

  // --- Street lamps (tall pole + arm + warm bulb) ---
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.2, 9, 6)
  const armGeo = new THREE.BoxGeometry(2.4, 0.14, 0.14)
  const bulbGeo = new THREE.SphereGeometry(0.48, 8, 8)
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1c1f28, roughness: 0.7, metalness: 0.4 })
  const bulbMat = new THREE.MeshBasicMaterial({ color: lampColor })
  const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, Math.max(lampPositions.length, 1))
  const armMesh = new THREE.InstancedMesh(armGeo, poleMat, Math.max(lampPositions.length, 1))
  const bulbMesh = new THREE.InstancedMesh(bulbGeo, bulbMat, Math.max(lampPositions.length, 1))
  poleMesh.count = lampPositions.length
  armMesh.count = lampPositions.length
  bulbMesh.count = lampPositions.length
  lampPositions.forEach(([x, z], i) => {
    let yaw = 0
    let nearest = Infinity
    for (const sz of streetZs) {
      const d = Math.abs(z - sz)
      if (d < nearest) {
        nearest = d
        yaw = z > sz ? Math.PI : 0
      }
    }
    for (const ax of avenueXs) {
      const d = Math.abs(x - ax)
      if (d < nearest) {
        nearest = d
        yaw = x > ax ? -Math.PI / 2 : Math.PI / 2
      }
    }
    dummy.position.set(x, 4.5, z)
    dummy.scale.set(1, 1, 1)
    dummy.rotation.set(0, yaw, 0)
    dummy.updateMatrix()
    poleMesh.setMatrixAt(i, dummy.matrix)

    dummy.position.set(x + Math.sin(yaw) * 1.0, 8.7, z + Math.cos(yaw) * 1.0)
    dummy.rotation.set(0, yaw, 0)
    dummy.updateMatrix()
    armMesh.setMatrixAt(i, dummy.matrix)

    dummy.position.set(x + Math.sin(yaw) * 2.0, 8.4, z + Math.cos(yaw) * 2.0)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    bulbMesh.setMatrixAt(i, dummy.matrix)
  })
  if (lampPositions.length) {
    poleMesh.instanceMatrix.needsUpdate = true
    armMesh.instanceMatrix.needsUpdate = true
    bulbMesh.instanceMatrix.needsUpdate = true
    root.add(poleMesh, armMesh, bulbMesh)
  }

  // --- Cars (oversized so they read from flight height) ---
  const CAR_COUNT = Math.min(36, Math.max(12, carLanes.length * 4))
  const chassisGeo = new THREE.BoxGeometry(2.6, 0.8, 5.2)
  const cabinGeo = new THREE.BoxGeometry(2.0, 0.75, 2.6)
  const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.32, 8)
  const chassisMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.45 })
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.3, metalness: 0.5 })
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.85 })
  const chassisMesh = new THREE.InstancedMesh(chassisGeo, chassisMat, CAR_COUNT)
  const cabinMesh = new THREE.InstancedMesh(cabinGeo, cabinMat, CAR_COUNT)
  const wheelMesh = new THREE.InstancedMesh(wheelGeo, wheelMat, CAR_COUNT * 4)
  const carColors = [0xff6b4a, 0x3de7ff, 0xf0b429, 0x7ec850, 0x5b7cfa, 0xe8eef8, 0xff4d8d]
  const cars = []

  for (let i = 0; i < CAR_COUNT; i++) {
    const lane = carLanes[i % carLanes.length]
    const t = rng()
    const along = lane.min + t * (lane.max - lane.min)
    const speed = 12 + rng() * 18
    const color = new THREE.Color(carColors[Math.floor(rng() * carColors.length)])
    cars.push({ lane, along, speed, color, dir: lane.dir })
    chassisMesh.setColorAt(i, color)
  }

  function placeCar(i, x, z, yaw) {
    dummy.position.set(x, 0.75, z)
    dummy.rotation.set(0, yaw, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    chassisMesh.setMatrixAt(i, dummy.matrix)

    dummy.position.set(x, 1.45, z)
    dummy.updateMatrix()
    cabinMesh.setMatrixAt(i, dummy.matrix)

    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)
    const corners = [
      [1.05, 1.55],
      [-1.05, 1.55],
      [1.05, -1.55],
      [-1.05, -1.55],
    ]
    corners.forEach(([lx, lz], w) => {
      const wx = x + lx * cos + lz * sin
      const wz = z - lx * sin + lz * cos
      dummy.position.set(wx, 0.45, wz)
      dummy.rotation.set(Math.PI / 2, yaw, 0)
      dummy.updateMatrix()
      wheelMesh.setMatrixAt(i * 4 + w, dummy.matrix)
    })
  }

  function syncCars() {
    cars.forEach((car, i) => {
      const yaw = car.lane.horizontal
        ? car.dir > 0
          ? Math.PI / 2
          : -Math.PI / 2
        : car.dir > 0
          ? 0
          : Math.PI
      const x = car.lane.horizontal ? car.along : car.lane.fixed
      const z = car.lane.horizontal ? car.lane.fixed : car.along
      placeCar(i, x, z, yaw)
    })
    chassisMesh.instanceMatrix.needsUpdate = true
    cabinMesh.instanceMatrix.needsUpdate = true
    wheelMesh.instanceMatrix.needsUpdate = true
    if (chassisMesh.instanceColor) chassisMesh.instanceColor.needsUpdate = true
  }
  syncCars()
  root.add(chassisMesh, cabinMesh, wheelMesh)

  addBenches(root, {
    streetZs,
    avenueXs,
    cityHalfX,
    cityHalfZ,
    plazaRadius,
    roadW,
    cell,
    treePositions,
    lampPositions,
  })

  return {
    update(delta) {
      for (const car of cars) {
        car.along += car.dir * car.speed * delta
        if (car.along > car.lane.max) car.along = car.lane.min
        if (car.along < car.lane.min) car.along = car.lane.max
      }
      syncCars()
    },
  }
}

/** Low-poly dark-wood benches facing the road along every sidewalk. Returns the count. */
function addBenches(root, {
  streetZs,
  avenueXs,
  cityHalfX,
  cityHalfZ,
  plazaRadius,
  roadW,
  cell,
  treePositions,
  lampPositions,
}) {
  const spots = []
  const benchOff = roadW * 0.5 + 3.8
  const clear = (x, z) =>
    !treePositions.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 2.8) &&
    !lampPositions.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 2.6)

  for (const z of streetZs) {
    for (const side of [-1, 1]) {
      const bz = z + side * benchOff
      for (let x = -cityHalfX + cell * 2; x <= cityHalfX - cell; x += cell * 1.6) {
        if (Math.hypot(x, bz) < plazaRadius + 6) continue
        if (avenueXs.some((ax) => Math.abs(x - ax) < roadW * 0.5 + 5)) continue
        if (!clear(x, bz)) continue
        spots.push([x, bz, side > 0 ? Math.PI : 0])
      }
    }
  }
  for (const ax of avenueXs) {
    for (const side of [-1, 1]) {
      const bx = ax + side * benchOff
      for (let z = -cityHalfZ + cell * 1.75; z <= cityHalfZ - cell; z += cell * 1.5) {
        if (streetZs.some((sz) => Math.abs(z - sz) < roadW * 0.5 + 5)) continue
        if (!clear(bx, z)) continue
        spots.push([bx, z, side > 0 ? -Math.PI / 2 : Math.PI / 2])
      }
    }
  }
  if (!spots.length) return 0

  // Local +z is the seat front; yaw turns it toward the road.
  const woodGeo = mergeGeometries([
    new THREE.BoxGeometry(3.6, 0.18, 1.1).translate(0, 1.0, 0.05),
    new THREE.BoxGeometry(3.6, 0.8, 0.16).rotateX(-0.14).translate(0, 1.6, -0.5),
  ])
  const frameGeo = mergeGeometries([
    new THREE.BoxGeometry(0.18, 1.0, 1.0).translate(-1.5, 0.5, 0),
    new THREE.BoxGeometry(0.18, 1.0, 1.0).translate(1.5, 0.5, 0),
  ])
  const woodMesh = new THREE.InstancedMesh(
    woodGeo,
    new THREE.MeshStandardMaterial({ color: 0x4a2e1a, roughness: 0.88 }),
    spots.length,
  )
  const frameMesh = new THREE.InstancedMesh(
    frameGeo,
    new THREE.MeshStandardMaterial({ color: 0x1c1f28, roughness: 0.6, metalness: 0.4 }),
    spots.length,
  )
  const dummy = new THREE.Object3D()
  spots.forEach(([x, z, yaw], i) => {
    dummy.position.set(x, 0, z)
    dummy.rotation.set(0, yaw, 0)
    dummy.updateMatrix()
    woodMesh.setMatrixAt(i, dummy.matrix)
    frameMesh.setMatrixAt(i, dummy.matrix)
  })
  woodMesh.instanceMatrix.needsUpdate = true
  frameMesh.instanceMatrix.needsUpdate = true
  root.add(woodMesh, frameMesh)
  return spots.length
}

function buildFallbackObelisk(height) {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x9a9aa6, roughness: 0.8 })
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 2.6), mat)
  base.position.y = 0.4
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.0, height * 0.8, 4), mat)
  shaft.position.y = 0.8 + height * 0.4
  shaft.rotation.y = Math.PI / 4
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.78, height * 0.12, 4), mat)
  tip.position.y = 0.8 + height * 0.8 + height * 0.06
  tip.rotation.y = Math.PI / 4
  group.add(base, shaft, tip)
  return group
}

/** Kenney obelisks in front of the Growth Tower, columns behind — inside the plaza fence. */
function addPlazaStatues(root, surfaceY) {
  const statues = getKenneyAssets()?.statues || []
  const [obelisk, column] = statues
  const r = PLAZA_RADIUS * 0.55
  const placements = [
    { template: obelisk, height: 10, x: -r * 0.7071, z: r * 0.7071 },
    { template: obelisk, height: 10, x: r * 0.7071, z: r * 0.7071 },
    { template: column || obelisk, height: 7.5, x: -r * 0.7071, z: -r * 0.7071 },
    { template: column || obelisk, height: 7.5, x: r * 0.7071, z: -r * 0.7071 },
  ]
  for (const { template, height, x, z } of placements) {
    let statue
    if (template) {
      statue = template.clone(true)
      statue.scale.multiplyScalar(height)
      statue.rotation.y = Math.atan2(x, z)
    } else {
      statue = buildFallbackObelisk(height)
    }
    placeOnSurface(statue, x, z, surfaceY)
    root.add(statue)
  }
}

const FOUNTAIN_Z = 17
const FOUNTAIN_GRAVITY = 16
const FOUNTAIN_COUNT = 260
const FOUNTAIN_SPOUT_Y = 2.3
const FOUNTAIN_WATER_Y = 0.7
const FOUNTAIN_CONE = 0.2 // radians from vertical

function makeRadialTexture(size = 64) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.4, 'rgba(255,255,255,0.75)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

/** Stone fountain in front of the Growth Tower with arcing water particles. */
function addPlazaFountain(root, surfaceY, waterColor) {
  const group = new THREE.Group()
  group.name = 'plaza-fountain'
  group.position.set(0, surfaceY, FOUNTAIN_Z)
  root.add(group)

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8f9c, roughness: 0.85 })
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, 0.8, 28), stoneMat)
  basin.position.y = 0.4
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 1.9, 12), stoneMat)
  pedestal.position.y = 0.95
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.5, 0.4, 18), stoneMat)
  bowl.position.y = 2.05
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(3.9, 28),
    new THREE.MeshStandardMaterial({
      color: waterColor.clone().multiplyScalar(0.35),
      emissive: waterColor,
      emissiveIntensity: 0.35,
      roughness: 0.15,
      metalness: 0.1,
    }),
  )
  water.rotation.x = -Math.PI / 2
  water.position.y = 0.82
  group.add(basin, pedestal, bowl, water)

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(6.8, 40),
    new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: waterColor,
      emissiveIntensity: 0.8,
      alphaMap: makeRadialTexture(128),
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  )
  glow.rotation.x = -Math.PI / 2
  glow.position.y = 0.03
  group.add(glow)

  const positions = new Float32Array(FOUNTAIN_COUNT * 3)
  const velocities = new Float32Array(FOUNTAIN_COUNT * 3)
  const launch = (i) => {
    const speed = 7.5 + Math.random() * 4
    const tilt = Math.random() * FOUNTAIN_CONE
    const az = Math.random() * Math.PI * 2
    velocities[i * 3] = Math.sin(tilt) * Math.cos(az) * speed
    velocities[i * 3 + 1] = Math.cos(tilt) * speed
    velocities[i * 3 + 2] = Math.sin(tilt) * Math.sin(az) * speed
    positions[i * 3] = 0
    positions[i * 3 + 1] = FOUNTAIN_SPOUT_Y
    positions[i * 3 + 2] = 0
  }
  // Start each particle part-way through its arc so the jet is full from frame one.
  for (let i = 0; i < FOUNTAIN_COUNT; i++) {
    launch(i)
    const vy = velocities[i * 3 + 1]
    const drop = FOUNTAIN_SPOUT_Y - FOUNTAIN_WATER_Y
    const flight = (vy + Math.sqrt(vy * vy + 2 * FOUNTAIN_GRAVITY * drop)) / FOUNTAIN_GRAVITY
    const t = Math.random() * flight
    positions[i * 3] += velocities[i * 3] * t
    positions[i * 3 + 1] += vy * t - 0.5 * FOUNTAIN_GRAVITY * t * t
    positions[i * 3 + 2] += velocities[i * 3 + 2] * t
    velocities[i * 3 + 1] -= FOUNTAIN_GRAVITY * t
  }

  const geometry = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(positions, 3)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', posAttr)
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 8)
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: waterColor,
      size: 0.42,
      map: makeRadialTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  points.name = 'fountain-water'
  group.add(points)

  return {
    update(delta) {
      const dt = Math.min(delta, 0.05)
      for (let i = 0; i < FOUNTAIN_COUNT; i++) {
        const k = i * 3
        velocities[k + 1] -= FOUNTAIN_GRAVITY * dt
        positions[k] += velocities[k] * dt
        positions[k + 1] += velocities[k + 1] * dt
        positions[k + 2] += velocities[k + 2] * dt
        if (positions[k + 1] < FOUNTAIN_WATER_Y) launch(i)
      }
      posAttr.needsUpdate = true
    },
  }
}

function makePortalTexture(accent) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 64, 256)
  const grad = ctx.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(0.5, accent)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalAlpha = 0.55
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 256)
  ctx.globalAlpha = 0.8
  ctx.fillStyle = '#ffffff'
  for (let y = 0; y < 256; y += 32) ctx.fillRect(0, y, 64, 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

/**
 * Neon portal arch at the city entrance with a self-sizing title sign.
 * Returns { group, update(time, delta) }.
 */
function buildTitleGate(accent, title) {
  const group = new THREE.Group()
  group.name = 'titleGate'
  const accentCol = new THREE.Color(accent)
  const warmCol = new THREE.Color('#ffb86b')
  const SPAN = 20
  const PLINTH_H = 2.4
  const PILLAR_H = 26
  const topY = PLINTH_H + PILLAR_H

  const metal = new THREE.MeshStandardMaterial({ color: 0x151a28, roughness: 0.35, metalness: 0.8 })
  const neon = new THREE.MeshStandardMaterial({
    color: accentCol,
    emissive: accentCol,
    emissiveIntensity: 1.6,
    roughness: 0.3,
  })
  const neonWarm = new THREE.MeshStandardMaterial({
    color: warmCol,
    emissive: warmCol,
    emissiveIntensity: 1.4,
    roughness: 0.3,
  })

  const spinners = []
  const bobbers = []

  for (const side of [-1, 1]) {
    const x = side * SPAN
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 1.2, 6), metal)
    base.position.set(x, 0.6, 0)
    const step = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 1.2, 6), metal)
    step.position.set(x, 1.8, 0)
    const baseGlow = new THREE.Mesh(new THREE.TorusGeometry(4.0, 0.14, 6, 6), neon)
    baseGlow.rotation.x = Math.PI / 2
    baseGlow.position.set(x, 1.22, 0)
    const column = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.2, PILLAR_H, 6), metal)
    column.position.set(x, PLINTH_H + PILLAR_H / 2, 0)
    group.add(base, step, baseGlow, column)

    for (let k = 0; k < 4; k++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.9 - k * 0.15, 0.14, 8, 32),
        k % 2 ? neonWarm : neon,
      )
      ring.rotation.x = Math.PI / 2
      const baseY = PLINTH_H + 4 + k * 5.5
      ring.position.set(x, baseY, 0)
      group.add(ring)
      bobbers.push({ mesh: ring, baseY, phase: k * 0.8 + side })
    }

    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(1.8, 0), neon)
    const capY = topY + 2.8
    cap.position.set(x, capY, 0)
    group.add(cap)
    spinners.push({ mesh: cap, speed: 0.9 * side })
    bobbers.push({ mesh: cap, baseY: capY, phase: side * 1.7 })
  }

  // Arch layers: dark backing, main neon tube, warm outer trim, thin inner line
  const backing = new THREE.Mesh(new THREE.TorusGeometry(SPAN, 1.8, 10, 72, Math.PI), metal)
  backing.position.set(0, topY, -0.9)
  const arch = new THREE.Mesh(new THREE.TorusGeometry(SPAN, 1.1, 12, 72, Math.PI), neon)
  arch.position.y = topY
  const archOuter = new THREE.Mesh(new THREE.TorusGeometry(SPAN + 2.4, 0.32, 8, 72, Math.PI), neonWarm)
  archOuter.position.y = topY
  const archInner = new THREE.Mesh(new THREE.TorusGeometry(SPAN - 2.2, 0.2, 8, 72, Math.PI), neon)
  archInner.position.y = topY
  group.add(backing, arch, archOuter, archInner)

  const keyY = topY + SPAN + 4.5
  const keystone = new THREE.Mesh(new THREE.OctahedronGeometry(3.2, 0), neonWarm)
  keystone.position.y = keyY
  const halo = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.16, 8, 48), neon)
  halo.position.y = keyY
  group.add(keystone, halo)
  spinners.push({ mesh: keystone, speed: 0.6 })
  bobbers.push({ mesh: keystone, baseY: keyY, phase: 0 })
  bobbers.push({ mesh: halo, baseY: keyY, phase: 0 })

  // Portal membrane filling the arch opening
  const inner = SPAN - 2.4
  const shape = new THREE.Shape()
  shape.moveTo(-inner, 0.2)
  shape.lineTo(-inner, topY)
  shape.absarc(0, topY, inner, Math.PI, 0, true)
  shape.lineTo(inner, 0.2)
  shape.closePath()
  const portalTex = makePortalTexture(accent)
  portalTex.repeat.set(1 / (inner * 2), 1 / 14)
  const portalMat = new THREE.MeshBasicMaterial({
    map: portalTex,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const portal = new THREE.Mesh(new THREE.ShapeGeometry(shape, 32), portalMat)
  group.add(portal)

  // Rising sparks inside the arch
  const SPARKS = 160
  const sparkPos = new Float32Array(SPARKS * 3)
  const sparkSpeed = new Float32Array(SPARKS)
  const maxSparkY = topY + inner
  for (let i = 0; i < SPARKS; i++) {
    sparkPos[i * 3] = (Math.random() - 0.5) * inner * 2
    sparkPos[i * 3 + 1] = Math.random() * maxSparkY
    sparkPos[i * 3 + 2] = (Math.random() - 0.5) * 4
    sparkSpeed[i] = 2 + Math.random() * 5
  }
  const sparkGeo = new THREE.BufferGeometry()
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3))
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({
      color: accentCol,
      size: 0.55,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  group.add(sparks)

  // Threshold strip + chevrons pointing into the city
  const threshold = new THREE.Mesh(new THREE.BoxGeometry(SPAN * 2, 0.12, 1.2), neon)
  threshold.position.y = 0.08
  group.add(threshold)
  const chevronMats = []
  for (let c = 0; c < 3; c++) {
    const mat = new THREE.MeshBasicMaterial({ color: warmCol, transparent: true, opacity: 0.6 })
    chevronMats.push(mat)
    const cz = 9 + c * 6
    for (const side of [-1, 1]) {
      const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 5), mat)
      armMesh.rotation.y = side * 0.65
      armMesh.position.set(side * 1.6, 0.06, cz)
      group.add(armMesh)
    }
  }

  const gateLight = new THREE.PointLight(accentCol, 2.2, 70, 1.6)
  gateLight.position.set(0, topY * 0.6, 4)
  group.add(gateLight)

  const lines = title.split(' · ')
  const sign = makeTextSprite(lines.join('\n'), accent, {
    scaleX: 40,
    scaleY: 8.5,
    fontSize: 64,
    lineColors: [accent, '#ffd08a'],
    glow: true,
  })
  sign.position.y = keyY + 13 + (lines.length - 1) * 4.2
  group.add(sign)

  return {
    group,
    topY,
    signY: sign.position.y,
    update(time, delta) {
      for (const s of spinners) s.mesh.rotation.y += s.speed * delta
      for (const b of bobbers) b.mesh.position.y = b.baseY + Math.sin(time * 1.6 + b.phase) * 0.5
      halo.rotation.x = Math.sin(time * 0.7) * 0.5
      portalTex.offset.y -= delta * 0.08
      portalMat.opacity = 0.42 + Math.sin(time * 2) * 0.1
      neon.emissiveIntensity = 1.45 + Math.sin(time * 2.4) * 0.25
      chevronMats.forEach((m, i) => {
        m.opacity = 0.25 + 0.65 * (0.5 + 0.5 * Math.sin(time * 4 - i * 1.3))
      })
      for (let i = 0; i < SPARKS; i++) {
        let y = sparkPos[i * 3 + 1] + sparkSpeed[i] * delta
        if (y > maxSparkY) y = 0
        sparkPos[i * 3 + 1] = y
      }
      sparkGeo.attributes.position.needsUpdate = true
    },
  }
}

/** Floating rocky platform + waterfall skirts. Returns { waterMats, bounds }. */
function addFloatingPlatform(root, halfX, halfZ, theme = null) {
  const padX = halfX + 28
  const padZ = halfZ + 28
  const thick = 8

  const rockMat = new THREE.MeshStandardMaterial({
    color: theme?.rockColor ?? 0x5a5048,
    roughness: 0.92,
    flatShading: true,
  })
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(padX * 2, thick, padZ * 2),
    rockMat,
  )
  platform.position.y = -thick / 2 - 0.2
  root.add(platform)

  // Jagged underside tips
  for (let i = 0; i < 12; i++) {
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(4 + (i % 3) * 2, 10 + (i % 4) * 3, 5),
      rockMat,
    )
    tip.position.set(
      ((i % 4) - 1.5) * padX * 0.45,
      -thick - 6,
      (Math.floor(i / 4) - 1) * padZ * 0.5,
    )
    root.add(tip)
  }

  // Waterfall texture (scrolling)
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  const grd = ctx.createLinearGradient(0, 0, 0, 128)
  grd.addColorStop(0, '#a8e8ff')
  grd.addColorStop(0.4, '#4ab8e8')
  grd.addColorStop(1, '#ffffff')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, 64, 128)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  for (let y = 0; y < 128; y += 8) {
    ctx.fillRect(8 + (y % 16), y, 12, 4)
    ctx.fillRect(36 + ((y + 4) % 12), y, 10, 3)
  }
  const waterTex = new THREE.CanvasTexture(canvas)
  waterTex.wrapS = THREE.RepeatWrapping
  waterTex.wrapT = THREE.RepeatWrapping
  waterTex.repeat.set(4, 6)
  const waterMat = new THREE.MeshStandardMaterial({
    map: waterTex,
    color: theme?.water.color ?? 0xa0d8f0,
    emissive: theme?.water.emissive ?? 0x3a80a0,
    emissiveIntensity: theme?.water.intensity ?? 0.35,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    roughness: 0.35,
  })
  const waterMats = [waterMat]

  const fallH = 55
  const sides = [
    { w: padX * 2 + 4, d: 3, x: 0, z: padZ + 1.2, rotY: 0 },
    { w: padX * 2 + 4, d: 3, x: 0, z: -padZ - 1.2, rotY: 0 },
    { w: padZ * 2 + 4, d: 3, x: padX + 1.2, z: 0, rotY: Math.PI / 2 },
    { w: padZ * 2 + 4, d: 3, x: -padX - 1.2, z: 0, rotY: Math.PI / 2 },
  ]
  for (const s of sides) {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(s.w, fallH), waterMat.clone())
    waterMats.push(sheet.material)
    sheet.position.set(s.x, -fallH / 2 - 1, s.z)
    sheet.rotation.y = s.rotY
    root.add(sheet)
    // Mist at base
    const mist = new THREE.Mesh(
      new THREE.PlaneGeometry(s.w * 0.9, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      }),
    )
    mist.position.set(s.x, -fallH + 2, s.z)
    mist.rotation.y = s.rotY
    root.add(mist)
  }

  return {
    waterMats,
    bounds: {
      minX: -padX + 4,
      maxX: padX - 4,
      minZ: -padZ + 4,
      maxZ: padZ + 80,
      minY: 4,
      maxY: 220,
    },
  }
}

function buildTaperedSpire(height, color) {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({
    color: color.clone(),
    emissive: color.clone(),
    emissiveIntensity: 1.6,
    roughness: 0.28,
    metalness: 0.45,
  })
  const h = Math.max(height, 8)
  const spire = new THREE.Mesh(new THREE.ConeGeometry(7.5, h, 6), mat)
  spire.position.y = h / 2
  group.add(spire)

  const glow = new THREE.Mesh(
    new THREE.ConeGeometry(8.4, h * 1.02, 6),
    new THREE.MeshBasicMaterial({
      color: color.clone(),
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  )
  glow.position.y = (h * 1.02) / 2
  group.add(glow)

  group.userData.spire = spire
  group.userData.glow = glow
  group.userData.mat = mat
  group.userData.height = h
  return group
}

/**
 * @param {THREE.Scene} scene
 * @param {{ cityId: string, cityLabel: string, streets: string[], topics: object[], accent: string, progress?: object[] }} opts
 */
const TOPIC_DONE_COLOR = 0x34d399
const TOPIC_BEAM_H = 160

/** Ground ring, rooftop crown and sky beam so a topic building reads from anywhere. */
function addTopicBeacon(root, x, z, height, footprint, accent, id, done) {
  const group = new THREE.Group()
  group.position.set(x, 0, z)
  root.add(group)

  const additive = (opacity) =>
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })

  const ringMat = additive(0.85)
  const ring = new THREE.Mesh(new THREE.RingGeometry(footprint * 0.95, footprint * 1.3, 48), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.08
  group.add(ring)

  const crownMat = new THREE.MeshBasicMaterial({ color: accent, fog: false })
  const crown = new THREE.Mesh(new THREE.TorusGeometry(footprint * 0.62, 0.35, 8, 40), crownMat)
  crown.rotation.x = Math.PI / 2
  crown.position.y = height + 0.6
  group.add(crown)

  const beamMat = additive(0.3)
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.6, TOPIC_BEAM_H, 16, 1, true),
    beamMat,
  )
  beam.position.y = height + TOPIC_BEAM_H / 2
  group.add(beam)

  const mats = [ringMat, crownMat, beamMat]
  const setDone = (isDone) => {
    for (const m of mats) m.color.set(isDone ? TOPIC_DONE_COLOR : accent)
  }
  setDone(done)

  const phase = (x * 0.13 + z * 0.07) % (Math.PI * 2)
  return {
    id,
    setDone,
    update(time) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.2 + phase)
      beamMat.opacity = 0.2 + pulse * 0.2
      ringMat.opacity = 0.55 + pulse * 0.35
    },
  }
}

export function buildEduCity(scene, opts) {
  const {
    cityId,
    cityLabel,
    streets: streetNames,
    topics,
    accent = '#3de7ff',
    progress = [],
    includePark = true,
    levelId = null,
  } = opts

  const root = new THREE.Group()
  root.name = `eduCity-${cityId}`
  scene.add(root)

  const buildingsById = new Map()
  const clickables = []
  const progressById = new Map(progress.map((p) => [p.building_id, p]))
  const rng = mulberry32(hashStringToSeed(`edu-city-${cityId}-v5-spacious`))

  // Visual theme only. It draws from its own RNG so `rng` — which decides
  // building heights and lots — produces the exact same layout in every theme.
  const theme = levelId ? getLevelTheme(levelId) : null
  const themeRng = mulberry32(hashStringToSeed(`edu-theme-${cityId}-${levelId}`))
  const streetTex = theme ? makeStreetTexture(theme.street) : null
  const glowMats = []

  function roadMaterial(fallbackColor, w, h) {
    if (!theme) return new THREE.MeshStandardMaterial({ color: fallbackColor, roughness: 0.95 })
    const map = streetTex.clone()
    map.repeat.set(w / 24, h / 24)
    map.needsUpdate = true
    return new THREE.MeshStandardMaterial({
      map,
      roughness: theme.street.roughness ?? 0.95,
      metalness: theme.street.metalness ?? 0,
      emissive: theme.street.emissive ?? 0x000000,
      emissiveIntensity: theme.street.emissive ? 0.6 : 0,
    })
  }

  function themedBuildingMaterial(glowIndex, extra) {
    const glow = theme.windowGlow[glowIndex % theme.windowGlow.length]
    const mat = new THREE.MeshStandardMaterial({
      ...extra,
      emissive: new THREE.Color(glow),
      emissiveIntensity: theme.glowIntensity,
      transparent: Boolean(theme.buildingOpacity),
      opacity: theme.buildingOpacity ?? 1,
      depthWrite: !theme.buildingOpacity,
    })
    glowMats.push({ mat, offset: glowIndex / theme.windowGlow.length })
    return mat
  }

  const themeBuildingColor = () =>
    new THREE.Color(theme.buildingColors[Math.floor(themeRng() * theme.buildingColors.length)])

  const streetCount = Math.max(streetNames.length, 1)
  const streetSpacing = CELL * 4.0
  const streetZs = streetNames.map((_, i) => (i - (streetCount - 1) / 2) * streetSpacing)

  const approxPerStreet = Math.max(1, Math.ceil((topics.length || 20) / streetCount))
  const lotsPerSide = Math.max(12, Math.ceil(approxPerStreet / 2) + 4)
  const cityHalfX = lotsPerSide * CELL + ROAD_W
  const cityHalfZ = Math.max(...streetZs.map(Math.abs)) + CELL * 3
  const span = Math.max(cityHalfX, cityHalfZ) * 2 + 40

  let waterfallFx = null
  let flightBounds = null
  if (!includePark) {
    // Floating city: no solid ground — only platform, waterfalls, and sky below
    root.add(theme ? buildThemedSky(theme) : buildSunsetSky())
    waterfallFx = addFloatingPlatform(root, cityHalfX + 10, cityHalfZ + 10, theme)
    flightBounds = waterfallFx.bounds
  } else {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(span, span),
      new THREE.MeshStandardMaterial({
        color: 0x060810,
        roughness: 1,
      }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.05
    root.add(ground)
    flightBounds = {
      minX: -cityHalfX - 20,
      maxX: cityHalfX + 40,
      minZ: -cityHalfZ - 20,
      maxZ: cityHalfZ + 100,
      minY: 4,
      maxY: 220,
    }
  }

  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(PLAZA_RADIUS, PLAZA_RADIUS, 0.4, 48),
    new THREE.MeshStandardMaterial({
      color: 0x12182a,
      emissive: 0x1a2848,
      emissiveIntensity: 0.4,
      roughness: 0.7,
    }),
  )
  plaza.position.set(0, 0.15, 0)
  root.add(plaza)
  addGrowthFence(root)

  const { colorTexture, emissiveTexture } = createWindowTextures({
    seed: hashStringToSeed(`edu-windows-${cityId}`),
    minLitRatio: 0.26,
    maxLitRatio: 0.46,
    ...(theme && { wallColor: '#9aa0ae', paneColor: '#666c7c' }),
  })

  const streetCenters = []
  const avenueXs = [-lotsPerSide * 0.5 * CELL, lotsPerSide * 0.5 * CELL]
  const occupied = new Set()
  const fillers = []
  const fillerJobs = []
  const topicMarkers = []
  const topicSpots = []
  const beacons = []
  // Small (level) cities: topic buildings become tall landmarks with beams + signs.
  const landmarkTopics = topics.length <= 12
  const topicFootprint = landmarkTopics ? FOOTPRINT * 1.4 : FOOTPRINT

  function lotKey(x, z) {
    return `${Math.round(x)},${Math.round(z)}`
  }

  for (const x of avenueXs) {
    const ave = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_W, span - 20),
      roadMaterial(0x14161f, ROAD_W, span - 20),
    )
    ave.rotation.x = -Math.PI / 2
    ave.position.set(x, 0.015, 0)
    root.add(ave)
  }

  // Group topics by street
  const byStreet = new Map(streetNames.map((n) => [n, []]))
  topics.forEach((t, i) => {
    const street = t.street && byStreet.has(t.street) ? t.street : streetNames[i % streetNames.length]
    byStreet.get(street).push(t)
  })

  streetNames.forEach((streetName, si) => {
    const z = streetZs[si]
    const color = new THREE.Color(accent).offsetHSL((si - 2) * 0.04, 0, (si % 2) * 0.05)
    streetCenters.push({
      id: `${cityId}-street-${si}`,
      name: streetName,
      z,
      color: `#${color.getHexString()}`,
      cx: 0,
      cz: z,
    })

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(span - 20, ROAD_W),
      roadMaterial(0x101218, span - 20, ROAD_W),
    )
    road.rotation.x = -Math.PI / 2
    road.position.set(0, 0.02, z)
    root.add(road)

    const lane = new THREE.Mesh(
      new THREE.PlaneGeometry(span - 40, 0.35),
      new THREE.MeshBasicMaterial({ color: theme?.street.lane ?? 0x7a849e }),
    )
    lane.rotation.x = -Math.PI / 2
    lane.position.set(0, 0.05, z)
    root.add(lane)

    const streetLabel = makeTextSprite(streetName, `#${color.getHexString()}`, {
      scaleX: 36,
      scaleY: 7,
      fontSize: 56,
    })
    streetLabel.position.set(-cityHalfX + 18, 26, z)
    root.add(streetLabel)

    const streetTopics = byStreet.get(streetName) || []
    const topicSide = z >= 0 ? 1 : -1
    const topicRowZ = z + topicSide * (ROAD_W * 0.5 + CELL * 0.65)

    streetTopics.forEach((topic, bi) => {
      let px
      if (landmarkTopics) {
        // Spread landmarks across the whole city in topic order, zig-zagging
        // between streets, so consecutive topics never stand side by side.
        const k = topics.indexOf(topic)
        const spread = CELL * 5
        px = topics.length > 1 ? -spread + (2 * spread * k) / (topics.length - 1) : 0
        // Keep off the gate axis so no tower hides behind the welcome banner.
        if (Math.abs(px) < CELL) px = CELL * 1.5
      } else {
        px = (bi - (streetTopics.length - 1) / 2) * CELL
        if (Math.hypot(px, topicRowZ) < PLAZA_RADIUS + 8) {
          px = Math.sign(px || 1) * (PLAZA_RADIUS + 10 + (bi % 3) * CELL)
        }
      }

      const subCount = Math.max(topic.subtopicCount || topic.subtopics?.length || 3, 2)
      const height = landmarkTopics
        ? MAX_H + 10 + rng() * 12
        : 12 + subCount * 7 + rng() * 8
      const mat = theme
        ? themedBuildingMaterial(topics.indexOf(topic), {
            map: colorTexture,
            emissiveMap: emissiveTexture,
            color: themeBuildingColor(),
            roughness: 0.65,
            metalness: 0.22,
          })
        : new THREE.MeshStandardMaterial({
            map: colorTexture,
            emissiveMap: emissiveTexture,
            emissive: new THREE.Color(0xffffff),
            emissiveIntensity: 1.5,
            color: color.clone().multiplyScalar(0.9),
            roughness: 0.65,
            metalness: 0.22,
          })
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat)
      mesh.position.set(px, height / 2, topicRowZ)
      mesh.scale.set(topicFootprint, height, topicFootprint)
      mesh.userData = {
        kind: 'topicBuilding',
        buildingId: topic.id,
        name: topic.name,
        streetName,
        cityId,
        topic,
      }
      root.add(mesh)
      clickables.push(mesh)
      occupied.add(lotKey(px, topicRowZ))
      topicSpots.push({ x: px, z: topicRowZ, height, streetZ: z })

      const topicNumber = topics.indexOf(topic) + 1
      const nameSprite = landmarkTopics
        ? makeTextSprite(`TOPIC ${topicNumber}\n${topic.name}`, accent, {
            scaleX: 34,
            scaleY: 8,
            fontSize: 52,
            lineColors: [accent, '#ffffff'],
            glow: true,
          })
        : makeTextSprite(topic.name, '#e8eef8', {
            scaleX: 22,
            scaleY: 4.6,
            fontSize: 40,
          })
      nameSprite.position.set(px, height + (landmarkTopics ? 14 : 6), topicRowZ)
      nameSprite.visible = landmarkTopics
      root.add(nameSprite)

      if (landmarkTopics) {
        const done = progressById.get(topic.id)?.quiz_score > 0
        beacons.push(addTopicBeacon(root, px, topicRowZ, height, topicFootprint, accent, topic.id, done))
      }

      if (progressById.get(topic.id)?.quiz_score > 0) {
        const check = new THREE.Mesh(
          new THREE.SphereGeometry(0.55, 10, 10),
          new THREE.MeshBasicMaterial({ color: 0x34d399 }),
        )
        check.position.set(px, height + 1.2, topicRowZ)
        root.add(check)
      }

      // Parking spot for the plane: down the road (always clear), nose to the tower.
      const approachSide = px > 0 ? -1 : 1
      buildingsById.set(topic.id, {
        mesh,
        label: nameSprite,
        x: px,
        z: topicRowZ,
        height,
        approach: {
          position: new THREE.Vector3(px + approachSide * 58, 26, z),
          lookAt: new THREE.Vector3(px, height * 0.5, topicRowZ),
        },
        building: { id: topic.id, name: topic.name },
        street: { name: streetName },
        topic,
      })
      topicMarkers.push({
        id: topic.id,
        name: topic.name,
        x: px,
        z: topicRowZ,
        color: `#${color.getHexString()}`,
        streetName,
      })
    })

    fillerJobs.push({ z, color })
  })

  // Fillers run after every street's topics exist, so none can land on (or crowd)
  // a topic building — including topics on the neighbouring street.
  const topicClearance = landmarkTopics ? CELL * 1.3 : topicFootprint
  const nearTopic = (x, z) => topicSpots.some((t) => Math.hypot(x - t.x, z - t.z) < topicClearance)
  for (const { z, color } of fillerJobs) {
    // Filler blocks on both sides — denser rows so lots don't look barren
    for (const side of [-1, 1]) {
      for (let row = 1; row <= 3; row++) {
        const rowZ = z + side * (ROAD_W * 0.5 + CELL * (0.55 + (row - 1) * 0.95))
        for (let i = -lotsPerSide; i <= lotsPerSide; i++) {
          if (Math.abs(i) <= BLOCK_GAP * 0.15 && Math.abs(rowZ) < PLAZA_RADIUS) continue
          const x = i * CELL
          let onAve = false
          for (const ax of avenueXs) {
            if (Math.abs(x - ax) < ROAD_W * 0.55) onAve = true
          }
          if (onAve) continue
          if (Math.hypot(x, rowZ) < PLAZA_RADIUS + 8) continue
          if (occupied.has(lotKey(x, rowZ))) continue
          if (nearTopic(x, rowZ)) continue
          // Skip every ~5th lot so trees can sit between buildings
          if (Math.abs(i) % 5 === 2) continue
          const height = MIN_H + rng() * (MAX_H - MIN_H)
          const defaultTint = color.clone().multiplyScalar(0.45 + rng() * 0.4)
          fillers.push({
            x,
            z: rowZ,
            height,
            streetZ: z,
            tint: theme ? themeBuildingColor().multiplyScalar(0.8 + themeRng() * 0.35) : defaultTint,
            glow: theme ? Math.floor(themeRng() * theme.windowGlow.length) : 0,
          })
          occupied.add(lotKey(x, rowZ))
        }
      }
    }
  }

  const dummy = new THREE.Object3D()
  // Emissive can't vary per instance, so themed fillers get one batch per glow colour.
  const fillerBatches = theme
    ? theme.windowGlow.map((_, gi) => fillers.filter((f) => f.glow === gi))
    : [fillers]
  const fillerGeo = new THREE.BoxGeometry(1, 1, 1)
  fillerBatches.forEach((batch, gi) => {
    if (!batch.length) return
    const base = { map: colorTexture, emissiveMap: emissiveTexture, roughness: 0.75, metalness: 0.15 }
    const mat = theme
      ? themedBuildingMaterial(gi, base)
      : new THREE.MeshStandardMaterial({ ...base, emissive: new THREE.Color(0xffffff), emissiveIntensity: 1.25 })
    const mesh = new THREE.InstancedMesh(fillerGeo, mat, batch.length)
    batch.forEach((f, i) => {
      dummy.position.set(f.x, f.height / 2, f.z)
      dummy.scale.set(FOOTPRINT * 0.92, f.height, FOOTPRINT * 0.92)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, f.tint)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    root.add(mesh)
  })

  let gears = null
  if (theme?.gears) {
    const placements = []
    const faceOffset = (FOOTPRINT * 0.92) / 2 + 0.35
    for (const f of fillers) {
      if (themeRng() > 0.35) continue
      const streetDir = Math.sign(f.streetZ - f.z) || 1
      const face = Math.floor(themeRng() * 3)
      const sideDir = face === 1 ? 1 : -1
      placements.push({
        x: face === 0 ? f.x : f.x + sideDir * faceOffset,
        y: f.height * (0.6 + themeRng() * 0.2),
        z: face === 0 ? f.z + streetDir * faceOffset : f.z,
        yaw: face === 0 ? 0 : Math.PI / 2,
        radius: 2.0 + themeRng() * 0.8,
        speed: (themeRng() < 0.5 ? -1 : 1) * (0.4 + themeRng() * 0.6),
      })
    }
    const topicFace = topicFootprint / 2 + 0.4
    for (const spot of topicSpots) {
      const dir = Math.sign(spot.streetZ - spot.z) || 1
      const zFace = spot.z + dir * topicFace
      placements.push(
        { x: spot.x - 2.2, y: spot.height * 0.8, z: zFace, yaw: 0, radius: 2.8, speed: 0.5 },
        { x: spot.x + 2.2, y: spot.height * 0.7, z: zFace, yaw: 0, radius: 1.8, speed: -0.8 },
      )
      for (const side of [-1, 1]) {
        placements.push(
          { x: spot.x + side * topicFace, y: spot.height * 0.78, z: spot.z - 2.2, yaw: Math.PI / 2, radius: 2.8, speed: 0.5 * side },
          { x: spot.x + side * topicFace, y: spot.height * 0.68, z: spot.z + 2.4, yaw: Math.PI / 2, radius: 1.8, speed: -0.8 * side },
        )
      }
    }
    if (placements.length) {
      gears = createGearDecorations(placements)
      root.add(gears.mesh)
    }
  }

  const stats = growthStatsFromProgress(progress, topics.length, buildingsById)
  const growthColor = milestoneColor(stats.milestone)
  const growthTower = buildTaperedSpire(stats.height, growthColor)
  growthTower.position.set(0, 0, 0)
  root.add(growthTower)

  const growthLabel = makeTextSprite('GROWTH TOWER', accent, {
    scaleX: 24,
    scaleY: 5,
    fontSize: 52,
  })
  growthLabel.position.set(0, stats.height + 8, 0)
  root.add(growthLabel)
  addPlazaStatues(root, plaza.position.y + 0.2)
  const fountain = addPlazaFountain(
    root,
    plaza.position.y + 0.2,
    new THREE.Color(theme?.windowGlow?.[0] ?? '#00ffff'),
  )

  const titleZ = cityHalfZ + 18
  const gate = buildTitleGate(accent, cityLabel.toUpperCase())
  gate.group.position.set(0, 0, titleZ - 6)
  root.add(gate.group)

  // Entry boulevard + landscaping visible from the title spawn
  const entryRoad = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_W * 1.15, 70),
    roadMaterial(0x14161f, ROAD_W * 1.15, 70),
  )
  entryRoad.rotation.x = -Math.PI / 2
  entryRoad.position.set(0, 0.02, titleZ - 28)
  root.add(entryRoad)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const tz = titleZ - 18 - i * 7
      const tx = side * (ROAD_W * 0.55 + 4)
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.55, 3.4, 6),
        new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 1 }),
      )
      trunk.position.set(tx, 1.7, tz)
      root.add(trunk)
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(2.8, 5.5, 7),
        new THREE.MeshStandardMaterial({ color: 0x2c5f34, roughness: 0.9 }),
      )
      crown.position.set(tx, 5.2, tz)
      root.add(crown)
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.22, 9, 6),
        new THREE.MeshStandardMaterial({ color: 0x1c1f28, metalness: 0.4 }),
      )
      pole.position.set(tx + side * 3, 4.5, tz + 3)
      root.add(pole)
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 8, 8),
        new THREE.MeshBasicMaterial({ color: theme?.lampColor ?? 0xffd08a }),
      )
      bulb.position.set(tx + side * 1.2, 8.6, tz + 3)
      root.add(bulb)
    }
  }

  const streetLife = addStreetLife(root, {
    streetZs,
    avenueXs,
    cityHalfX,
    cityHalfZ,
    plazaRadius: PLAZA_RADIUS,
    occupied,
    rng,
    roadW: ROAD_W,
    cell: CELL,
    lampColor: theme?.lampColor,
  })

  let particles = null
  if (theme?.particles) {
    const b = flightBounds || { minX: -cityHalfX, maxX: cityHalfX, minZ: -cityHalfZ, maxZ: cityHalfZ }
    particles = createThemeParticles(theme, { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, top: 120 })
    if (particles) root.add(particles.points)
  }

  // Start outside the city looking at the title gate — not at the Growth Tower.
  const spawnPose = {
    position: new THREE.Vector3(0, 34, titleZ + 115),
    lookAt: new THREE.Vector3(0, 36, titleZ - 6),
  }

  let park = null
  if (includePark) {
    park = buildAmusementPark({
      x: cityHalfX * 0.35,
      z: cityHalfZ + 48,
      accent,
    })
    root.add(park.root)
  }

  function setGrowthTower(nextStats, { animate = true } = {}) {
    const h = Math.max(nextStats.height, BASE_GROWTH_H)
    const color = milestoneColor(nextStats.milestone)
    const mat = growthTower.userData.mat
    mat.color.copy(color)
    mat.emissive.copy(color)
    mat.emissiveIntensity = 1.2 + nextStats.pct * 1.8
    growthTower.userData.glow.material.color.copy(color)
    growthLabel.position.y = h + 6

    const applyH = (nh) => {
      const spire = growthTower.userData.spire
      const glow = growthTower.userData.glow
      spire.geometry.dispose()
      glow.geometry.dispose()
      spire.geometry = new THREE.ConeGeometry(7.5, nh, 6)
      glow.geometry = new THREE.ConeGeometry(8.4, nh * 1.02, 6)
      spire.position.y = nh / 2
      glow.position.y = (nh * 1.02) / 2
      growthTower.userData.height = nh
    }

    if (!animate) {
      applyH(h)
      return
    }
    const startH = growthTower.userData.height || BASE_GROWTH_H
    const t0 = performance.now()
    function step(now) {
      const u = Math.min((now - t0) / 1100, 1)
      const s = u * u * (3 - 2 * u)
      applyH(startH + (h - startH) * s)
      if (u < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  setGrowthTower(stats, { animate: false })

  function updateApproachLabels(cameraPos) {
    let nearest = null
    let nearestDist = 42
    for (const [, entry] of buildingsById) {
      const d = Math.hypot(cameraPos.x - entry.x, cameraPos.z - entry.z)
      entry.label.visible = landmarkTopics || d < 55
      if (d < nearestDist) {
        nearestDist = d
        nearest = { ...entry, dist: d, id: entry.building.id }
      }
    }
    return nearest
  }

  const reposForHud = topicMarkers.map((t) => ({
    full_name: t.name,
    district: t.streetName,
    x: t.x,
    z: t.z,
    stars: 0,
    contributor_count: 1,
  }))

  const mapLayout = {
    bounds: {
      minX: -cityHalfX,
      maxX: cityHalfX + 20,
      minZ: -cityHalfZ,
      maxZ: cityHalfZ + (park ? 80 : 20),
    },
    streets: streetCenters.map((s) => ({
      name: s.name,
      z: s.z,
      color: s.color,
      cx: 0,
      cz: s.z,
    })),
    avenues: avenueXs,
    plazaRadius: PLAZA_RADIUS,
    growthTower: { x: 0, z: 0 },
    topics: topicMarkers,
    fillers: fillers.map((f) => ({ x: f.x, z: f.z })),
    amusementPark: park?.mapMarker || null,
  }

  return {
    root,
    clickables,
    buildingsById,
    streetCenters,
    reposForHud,
    mapLayout,
    totalBuildings: topics.length,
    cityId,
    cityLabel,
    amusementPark: park,
    flightBounds,
    spawnPose,
    theme,
    applyProgress(list) {
      progressById.clear()
      for (const row of list) progressById.set(row.building_id, row)
      for (const b of beacons) b.setDone(progressById.get(b.id)?.quiz_score > 0)
      setGrowthTower(growthStatsFromProgress(list, topics.length, buildingsById), { animate: true })
    },
    setGrowthTower,
    updateApproachLabels,
    update(time, delta) {
      park?.update(time, delta)
      streetLife?.update(delta)
      fountain.update(delta)
      gate.update(time, delta)
      for (const b of beacons) b.update(time)
      if (waterfallFx?.waterMats) {
        for (const mat of waterfallFx.waterMats) {
          if (mat.map) {
            mat.map.offset.y = (mat.map.offset.y + delta * 0.55) % 1
          }
        }
      }
      particles?.update(delta, time)
      gears?.update(time)
      if (theme?.shimmer) {
        for (const { mat, offset } of glowMats) {
          mat.emissive.setHSL((time * 0.06 + offset) % 1, 0.85, 0.62)
        }
      }
    },
    dispose() {
      scene.remove(root)
    },
  }
}

// Back-compat alias
export const buildMlCity = (scene, opts) =>
  buildEduCity(scene, {
    cityId: 'ml',
    cityLabel: 'Machine Learning',
    streets: opts.streets || ['ML Street', 'Supervised Ave', 'Unsupervised Blvd', 'Neural Net Ave', 'RL Street'],
    topics: opts.topics || [],
    accent: '#3de7ff',
    progress: opts.progress,
  })
