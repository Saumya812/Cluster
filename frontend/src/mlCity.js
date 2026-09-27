/**
 * Organized GitCity-style ML city — clear street blocks, packed lots, central Growth Tower.
 */
import * as THREE from 'three'
import { createWindowTextures, hashStringToSeed } from './windowTexture.js'
import { ML_STREETS, getAllMlBuildings } from './mlCurriculum.js'

const BASE_GROWTH_H = 8
const BASE_GROWTH_W = 6
const PLAZA_RADIUS = 15
const CELL = 6.8
const FOOTPRINT = 5.5
const ROAD_W = 7.5
const LOTS_PER_HALF = 9 // lots on each side of center along a street
const MIN_H = 12
const MAX_H = 52
const BLOCK_DEPTH = 2 // building rows on each side of a street

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

function makeTextSprite(text, colorHex, { scaleX = 10, scaleY = 2.2, fontSize = 36 } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 512, 128)
  ctx.fillStyle = 'rgba(5, 8, 20, 0.72)'
  ctx.fillRect(16, 28, 480, 72)
  ctx.font = `700 ${fontSize}px Bebas Neue, Sora, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = colorHex
  ctx.fillText(text, 256, 64)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
  )
  sprite.scale.set(scaleX, scaleY, 1)
  sprite.renderOrder = 5
  return sprite
}

export function growthStatsFromProgress(progressList, totalBuildings) {
  const rows = progressList || []
  const completed = rows.filter((r) => (r.quiz_score || 0) > 0).length
  const scores = rows.filter((r) => (r.quiz_score || 0) > 0).map((r) => r.quiz_score)
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const pct = totalBuildings > 0 ? completed / totalBuildings : 0
  const height = BASE_GROWTH_H + completed * 7 + (avgScore / 100) * 8
  const width = BASE_GROWTH_W + (avgScore / 100) * 5
  let milestone = 0
  if (pct >= 1) milestone = 100
  else if (pct >= 0.75) milestone = 75
  else if (pct >= 0.5) milestone = 50
  else if (pct >= 0.25) milestone = 25
  return { completed, totalBuildings, avgScore, pct, height, width, milestone }
}

function milestoneColor(milestone) {
  if (milestone >= 100) return new THREE.Color('#34d399')
  if (milestone >= 75) return new THREE.Color('#3de7ff')
  if (milestone >= 50) return new THREE.Color('#a78bfa')
  if (milestone >= 25) return new THREE.Color('#ffb347')
  return new THREE.Color('#5b6a88')
}

function addGrowthFence(root) {
  const fenceGroup = new THREE.Group()
  fenceGroup.name = 'growthFence'
  const radius = PLAZA_RADIUS - 1.2
  const posts = 56
  const brushMat = new THREE.MeshStandardMaterial({
    color: 0x2d5a34,
    roughness: 0.9,
    metalness: 0.05,
  })
  const flowerMat = new THREE.MeshBasicMaterial({ color: 0xe11d48 })

  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2
    const x = Math.cos(a) * radius
    const z = Math.sin(a) * radius
    const brush = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.85, 0.55), brushMat)
    brush.position.set(x, 0.42, z)
    brush.rotation.y = -a
    fenceGroup.add(brush)

    const flowerCount = 2 + (i % 3)
    for (let f = 0; f < flowerCount; f++) {
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), flowerMat)
      const ox = (f - 1) * 0.22
      flower.position.set(
        x + Math.cos(a) * 0.15 + Math.sin(a) * ox,
        0.9 + (f % 2) * 0.08,
        z + Math.sin(a) * 0.15 - Math.cos(a) * ox,
      )
      fenceGroup.add(flower)
    }
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.9, radius + 0.7, 64),
    new THREE.MeshStandardMaterial({
      color: 0x1a3d22,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.06
  fenceGroup.add(ring)
  root.add(fenceGroup)
}

/**
 * Street band centers: equal spacing north→south, plaza kept clear in the middle.
 * Returns world Z for each of the 5 named streets.
 */
function streetWorldZs() {
  // Two streets north of plaza, one near center (shifted), two south.
  const step = CELL * (BLOCK_DEPTH * 2 + 1.35)
  return [-2 * step, -step, 0, step, 2 * step]
}

export function buildMlCity(scene, { progress = [] } = {}) {
  const root = new THREE.Group()
  root.name = 'mlCity'
  scene.add(root)

  const buildingsById = new Map()
  const clickables = []
  const allBuildings = getAllMlBuildings()
  const progressById = new Map(progress.map((p) => [p.building_id, p]))
  const rng = mulberry32(hashStringToSeed('ml-organized-city-v3'))

  const streetZs = streetWorldZs()
  const cityHalfX = LOTS_PER_HALF * CELL + ROAD_W
  const cityHalfZ = Math.max(...streetZs.map(Math.abs)) + CELL * (BLOCK_DEPTH + 1)
  const span = Math.max(cityHalfX, cityHalfZ) * 2 + 30

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(span, span),
    new THREE.MeshStandardMaterial({ color: 0x060810, roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.05
  root.add(ground)

  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(PLAZA_RADIUS, PLAZA_RADIUS, 0.35, 48),
    new THREE.MeshStandardMaterial({
      color: 0x12182a,
      emissive: 0x1a2848,
      emissiveIntensity: 0.35,
      roughness: 0.7,
    }),
  )
  plaza.position.set(0, 0.12, 0)
  root.add(plaza)
  addGrowthFence(root)

  const { colorTexture, emissiveTexture } = createWindowTextures({
    seed: hashStringToSeed('ml-organized-windows'),
    minLitRatio: 0.28,
    maxLitRatio: 0.48,
  })

  const streetCenters = []
  const avenueXs = [-LOTS_PER_HALF * 0.55 * CELL, 0, LOTS_PER_HALF * 0.55 * CELL]

  // N–S avenues
  for (const x of avenueXs) {
    if (Math.abs(x) < 1) continue // leave center for plaza / growth tower sightline
    const ave = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_W * 0.8, span - 16),
      new THREE.MeshStandardMaterial({ color: 0x1a1c26, roughness: 0.95 }),
    )
    ave.rotation.x = -Math.PI / 2
    ave.position.set(x, 0.015, 0)
    root.add(ave)
  }

  const occupied = new Set()
  const fillers = []
  const topicMarkers = []

  function lotKey(x, z) {
    return `${Math.round(x * 10)},${Math.round(z * 10)}`
  }

  ML_STREETS.forEach((street, si) => {
    const z = streetZs[si]
    streetCenters.push({
      id: street.id,
      name: street.name,
      z,
      color: street.color,
      cx: 0,
      cz: z,
    })

    // E–W road
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(span - 16, ROAD_W),
      new THREE.MeshStandardMaterial({ color: 0x12131a, roughness: 0.95 }),
    )
    road.rotation.x = -Math.PI / 2
    road.position.set(0, 0.02, z)
    root.add(road)

    const lane = new THREE.Mesh(
      new THREE.PlaneGeometry(span - 28, 0.2),
      new THREE.MeshBasicMaterial({ color: 0x6a7390 }),
    )
    lane.rotation.x = -Math.PI / 2
    lane.position.set(0, 0.04, z)
    root.add(lane)

    const streetLabel = makeTextSprite(street.name, street.color, {
      scaleX: 16,
      scaleY: 3.1,
      fontSize: 40,
    })
    streetLabel.position.set(-cityHalfX + 8, 14, z)
    root.add(streetLabel)

    // Topic buildings: neat row on the south side of the street (or north for southern streets)
    const topicSide = z >= 0 ? 1 : -1
    const topicRowZ = z + topicSide * (ROAD_W * 0.55 + CELL * 0.55)
    const nTopics = street.buildings.length
    street.buildings.forEach((building, bi) => {
      const x = (bi - (nTopics - 1) / 2) * CELL * 1.15
      if (Math.hypot(x, topicRowZ) < PLAZA_RADIUS + 3) return

      const height = MIN_H + 6 + building.subtopics.length * 4 + rng() * 10
      const color = new THREE.Color(street.color)
      const mat = new THREE.MeshStandardMaterial({
        map: colorTexture,
        emissiveMap: emissiveTexture,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 1.6,
        color: color.clone().multiplyScalar(0.92),
        roughness: 0.62,
        metalness: 0.24,
      })
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat)
      mesh.position.set(x, height / 2, topicRowZ)
      mesh.scale.set(FOOTPRINT * 1.08, height, FOOTPRINT * 1.08)
      mesh.userData = {
        kind: 'topicBuilding',
        buildingId: building.id,
        name: building.name,
        streetName: street.name,
        subtopicCount: building.subtopics.length,
      }
      root.add(mesh)
      clickables.push(mesh)
      occupied.add(lotKey(x, topicRowZ))

      const nameSprite = makeTextSprite(building.name, '#e8eef8', {
        scaleX: 11,
        scaleY: 2.3,
        fontSize: 30,
      })
      nameSprite.position.set(x, height + 3.2, topicRowZ)
      nameSprite.visible = false
      root.add(nameSprite)

      if (progressById.get(building.id)?.quiz_score > 0) {
        const check = new THREE.Mesh(
          new THREE.SphereGeometry(0.45, 10, 10),
          new THREE.MeshBasicMaterial({ color: 0x34d399 }),
        )
        check.position.set(x, height + 1.0, topicRowZ)
        root.add(check)
      }

      buildingsById.set(building.id, {
        mesh,
        label: nameSprite,
        x,
        z: topicRowZ,
        height,
        building,
        street,
      })
      topicMarkers.push({
        id: building.id,
        name: building.name,
        x,
        z: topicRowZ,
        color: street.color,
        streetName: street.name,
      })
    })

    // Filler rows on both sides of the street (organized block)
    for (let row = 1; row <= BLOCK_DEPTH; row++) {
      for (const side of [-1, 1]) {
        const rowZ = z + side * (ROAD_W * 0.55 + CELL * (row - 0.45))
        for (let i = -LOTS_PER_HALF; i <= LOTS_PER_HALF; i++) {
          const x = i * CELL
          if (Math.abs(x) < ROAD_W * 0.6) continue // avenue gap near centerline avenues
          // Keep gaps at avenue crossings
          let onAvenue = false
          for (const ax of avenueXs) {
            if (Math.abs(ax) > 1 && Math.abs(x - ax) < ROAD_W * 0.55) onAvenue = true
          }
          if (onAvenue) continue
          if (Math.hypot(x, rowZ) < PLAZA_RADIUS + 2.8) continue
          if (occupied.has(lotKey(x, rowZ))) continue

          const height = MIN_H + rng() * (MAX_H - MIN_H)
          const tint = new THREE.Color(street.color).multiplyScalar(0.5 + rng() * 0.45)
          fillers.push({ x, z: rowZ, height, tint, cylinder: rng() < 0.12 })
          occupied.add(lotKey(x, rowZ))
        }
      }
    }

    // Lamps along street
    for (let i = -LOTS_PER_HALF; i <= LOTS_PER_HALF; i += 3) {
      const x = i * CELL
      if (Math.hypot(x, z) < PLAZA_RADIUS) continue
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.11, 4.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x1c1f28 }),
      )
      pole.position.set(x, 2.1, z + ROAD_W * 0.4)
      root.add(pole)
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffc878 }),
      )
      bulb.position.set(x, 4.35, z + ROAD_W * 0.4)
      root.add(bulb)
    }
  })

  const dummy = new THREE.Object3D()
  function addFillerInstances(list, geometry) {
    if (!list.length) return
    const mat = new THREE.MeshStandardMaterial({
      map: colorTexture,
      emissiveMap: emissiveTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.3,
      roughness: 0.72,
      metalness: 0.18,
    })
    const mesh = new THREE.InstancedMesh(geometry, mat, list.length)
    list.forEach((f, i) => {
      dummy.position.set(f.x, f.height / 2, f.z)
      dummy.scale.set(FOOTPRINT, f.height, FOOTPRINT)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, f.tint)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    root.add(mesh)
  }

  addFillerInstances(
    fillers.filter((f) => !f.cylinder),
    new THREE.BoxGeometry(1, 1, 1),
  )
  addFillerInstances(
    fillers.filter((f) => f.cylinder),
    new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  )

  // Growth tower
  const growthMat = new THREE.MeshStandardMaterial({
    color: milestoneColor(0),
    emissive: milestoneColor(0),
    emissiveIntensity: 1.2,
    roughness: 0.35,
    metalness: 0.55,
  })
  const growthMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), growthMat)
  const stats = growthStatsFromProgress(progress, allBuildings.length)
  growthMesh.position.set(0, stats.height / 2, 0)
  growthMesh.scale.set(stats.width, stats.height, stats.width)
  growthMesh.userData = { kind: 'growthTower' }
  root.add(growthMesh)

  const growthLabel = makeTextSprite('GROWTH TOWER', '#3de7ff', {
    scaleX: 14,
    scaleY: 2.8,
    fontSize: 38,
  })
  growthLabel.position.set(0, stats.height + 5, 0)
  root.add(growthLabel)

  function setGrowthTower(nextStats, { animate = true } = {}) {
    const h = nextStats.height
    const w = nextStats.width
    const color = milestoneColor(nextStats.milestone)
    growthMat.color.copy(color)
    growthMat.emissive.copy(color)
    growthMat.emissiveIntensity = 1.1 + nextStats.pct * 1.4
    growthLabel.position.y = h + 5
    if (!animate) {
      growthMesh.scale.set(w, h, w)
      growthMesh.position.y = h / 2
      return
    }
    const startH = growthMesh.scale.y
    const startW = growthMesh.scale.x
    const startY = growthMesh.position.y
    const t0 = performance.now()
    function step(now) {
      const u = Math.min((now - t0) / 1000, 1)
      const s = u * u * (3 - 2 * u)
      const nh = startH + (h - startH) * s
      const nw = startW + (w - startW) * s
      growthMesh.scale.set(nw, nh, nw)
      growthMesh.position.y = startY + (h / 2 - startY) * s
      if (u < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  setGrowthTower(stats, { animate: false })

  function updateApproachLabels(cameraPos) {
    let nearest = null
    let nearestDist = 18
    for (const [, entry] of buildingsById) {
      const d = Math.hypot(cameraPos.x - entry.x, cameraPos.z - entry.z)
      entry.label.visible = d < 22
      if (d < nearestDist) {
        nearestDist = d
        nearest = { ...entry, dist: d, id: entry.building.id }
      }
    }
    return nearest
  }

  const reposForHud = allBuildings.map((b) => {
    const entry = buildingsById.get(b.id)
    return {
      full_name: b.name,
      district: b.streetName,
      x: entry?.x ?? 0,
      z: entry?.z ?? 0,
      stars: 0,
      contributor_count: b.subtopicCount,
    }
  })

  const mapLayout = {
    bounds: {
      minX: -cityHalfX,
      maxX: cityHalfX,
      minZ: -cityHalfZ,
      maxZ: cityHalfZ,
    },
    streets: streetCenters.map((s) => ({
      name: s.name,
      z: s.z,
      color: s.color,
      cx: 0,
      cz: s.z,
    })),
    avenues: avenueXs.filter((x) => Math.abs(x) > 1),
    plazaRadius: PLAZA_RADIUS,
    growthTower: { x: 0, z: 0 },
    topics: topicMarkers,
    fillers: fillers.map((f) => ({ x: f.x, z: f.z })),
  }

  return {
    root,
    clickables,
    buildingsById,
    streetCenters,
    reposForHud,
    mapLayout,
    totalBuildings: allBuildings.length,
    growthMesh,
    getGrowthStats: () =>
      growthStatsFromProgress([...progressById.values()], allBuildings.length),
    applyProgress(list) {
      progressById.clear()
      for (const row of list) progressById.set(row.building_id, row)
      setGrowthTower(growthStatsFromProgress(list, allBuildings.length), { animate: true })
    },
    setGrowthTower,
    updateApproachLabels,
    dispose() {
      scene.remove(root)
    },
  }
}
