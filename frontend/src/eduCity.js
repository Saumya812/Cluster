/**
 * Shared educational city layout — wide flyable streets, dense blocks, tapered Growth Tower.
 */
import * as THREE from 'three'
import { createWindowTextures, hashStringToSeed } from './windowTexture.js'
import { buildAmusementPark } from './amusementPark.js'
import { buildSunsetSky } from './islandRoadmap.js'

const BASE_GROWTH_H = 14
const PLAZA_RADIUS = 22
const CELL = 16 // generous lot spacing for plane flight
const FOOTPRINT = 7.5
const ROAD_W = 18 // wide streets — readable from aerial / horizon
const BLOCK_GAP = 4 // empty lots between blocks as road shoulders
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

function makeTextSprite(text, colorHex, { scaleX = 14, scaleY = 3, fontSize = 40 } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 640, 128)
  ctx.fillStyle = 'rgba(5, 8, 20, 0.75)'
  ctx.fillRect(20, 24, 600, 80)
  ctx.font = `700 ${fontSize}px Bebas Neue, Sora, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = colorHex
  ctx.fillText(text, 320, 64)
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
  const height = BASE_GROWTH_H + completed * 1.1 + (avgScore / 100) * 10
  let milestone = 0
  if (pct >= 1) milestone = 100
  else if (pct >= 0.75) milestone = 75
  else if (pct >= 0.5) milestone = 50
  else if (pct >= 0.25) milestone = 25
  return { completed, totalBuildings, avgScore, pct, height, milestone }
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

/** Floating rocky platform + waterfall skirts. Returns { waterMats, bounds }. */
function addFloatingPlatform(root, halfX, halfZ) {
  const padX = halfX + 28
  const padZ = halfZ + 28
  const thick = 8

  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x5a5048,
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
    color: 0xa0d8f0,
    emissive: 0x3a80a0,
    emissiveIntensity: 0.35,
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
      maxZ: padZ - 4,
      minY: 4,
      maxY: 80,
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
export function buildEduCity(scene, opts) {
  const {
    cityId,
    cityLabel,
    streets: streetNames,
    topics,
    accent = '#3de7ff',
    progress = [],
    includePark = true,
  } = opts

  const root = new THREE.Group()
  root.name = `eduCity-${cityId}`
  scene.add(root)

  const buildingsById = new Map()
  const clickables = []
  const progressById = new Map(progress.map((p) => [p.building_id, p]))
  const rng = mulberry32(hashStringToSeed(`edu-city-${cityId}-v4`))

  const streetCount = Math.max(streetNames.length, 1)
  const streetSpacing = CELL * 5.2
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
    root.add(buildSunsetSky())
    waterfallFx = addFloatingPlatform(root, cityHalfX + 10, cityHalfZ + 10)
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
  })

  const streetCenters = []
  const avenueXs = [-lotsPerSide * 0.5 * CELL, lotsPerSide * 0.5 * CELL]
  const occupied = new Set()
  const fillers = []
  const topicMarkers = []

  function lotKey(x, z) {
    return `${Math.round(x)},${Math.round(z)}`
  }

  for (const x of avenueXs) {
    const ave = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_W, span - 20),
      new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.95 }),
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
      new THREE.MeshStandardMaterial({ color: 0x101218, roughness: 0.95 }),
    )
    road.rotation.x = -Math.PI / 2
    road.position.set(0, 0.02, z)
    root.add(road)

    const lane = new THREE.Mesh(
      new THREE.PlaneGeometry(span - 40, 0.35),
      new THREE.MeshBasicMaterial({ color: 0x7a849e }),
    )
    lane.rotation.x = -Math.PI / 2
    lane.position.set(0, 0.05, z)
    root.add(lane)

    const streetLabel = makeTextSprite(streetName, `#${color.getHexString()}`, {
      scaleX: 22,
      scaleY: 4.2,
      fontSize: 44,
    })
    streetLabel.position.set(-cityHalfX + 14, 18, z)
    root.add(streetLabel)

    const streetTopics = byStreet.get(streetName) || []
    const topicSide = z >= 0 ? 1 : -1
    const topicRowZ = z + topicSide * (ROAD_W * 0.5 + CELL * 0.65)

    streetTopics.forEach((topic, bi) => {
      const x = (bi - (streetTopics.length - 1) / 2) * CELL
      if (Math.hypot(x, topicRowZ) < PLAZA_RADIUS + 6) {
        // shift outward if plaza collision
      }
      let px = x
      if (Math.hypot(px, topicRowZ) < PLAZA_RADIUS + 8) {
        px = Math.sign(px || 1) * (PLAZA_RADIUS + 10 + (bi % 3) * CELL)
      }

      const subCount = Math.max(topic.subtopicCount || topic.subtopics?.length || 3, 2)
      const height = 12 + subCount * 7 + rng() * 8
      const mat = new THREE.MeshStandardMaterial({
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
      mesh.scale.set(FOOTPRINT, height, FOOTPRINT)
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

      const nameSprite = makeTextSprite(topic.name, '#e8eef8', {
        scaleX: 12,
        scaleY: 2.6,
        fontSize: 28,
      })
      nameSprite.position.set(px, height + 4, topicRowZ)
      nameSprite.visible = false
      root.add(nameSprite)

      if (progressById.get(topic.id)?.quiz_score > 0) {
        const check = new THREE.Mesh(
          new THREE.SphereGeometry(0.55, 10, 10),
          new THREE.MeshBasicMaterial({ color: 0x34d399 }),
        )
        check.position.set(px, height + 1.2, topicRowZ)
        root.add(check)
      }

      buildingsById.set(topic.id, {
        mesh,
        label: nameSprite,
        x: px,
        z: topicRowZ,
        height,
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

    // Filler blocks on both sides — dense but with clear road gaps
    for (const side of [-1, 1]) {
      for (let row = 1; row <= 2; row++) {
        const rowZ = z + side * (ROAD_W * 0.5 + CELL * (0.65 + (row - 1) * 1.05))
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
          const height = MIN_H + rng() * (MAX_H - MIN_H)
          fillers.push({
            x,
            z: rowZ,
            height,
            tint: color.clone().multiplyScalar(0.45 + rng() * 0.4),
          })
          occupied.add(lotKey(x, rowZ))
        }
      }
    }

    for (let i = -lotsPerSide; i <= lotsPerSide; i += 2) {
      const x = i * CELL
      if (Math.hypot(x, z) < PLAZA_RADIUS) continue
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.14, 5, 6),
        new THREE.MeshStandardMaterial({ color: 0x1c1f28 }),
      )
      pole.position.set(x, 2.5, z + ROAD_W * 0.42)
      root.add(pole)
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffc878 }),
      )
      bulb.position.set(x, 5.2, z + ROAD_W * 0.42)
      root.add(bulb)
    }
  })

  const dummy = new THREE.Object3D()
  if (fillers.length) {
    const mat = new THREE.MeshStandardMaterial({
      map: colorTexture,
      emissiveMap: emissiveTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.25,
      roughness: 0.75,
      metalness: 0.15,
    })
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, fillers.length)
    fillers.forEach((f, i) => {
      dummy.position.set(f.x, f.height / 2, f.z)
      dummy.scale.set(FOOTPRINT * 0.92, f.height, FOOTPRINT * 0.92)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, f.tint)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    root.add(mesh)
  }

  const stats = growthStatsFromProgress(progress, topics.length)
  const growthColor = milestoneColor(stats.milestone)
  const growthTower = buildTaperedSpire(stats.height, growthColor)
  growthTower.position.set(0, 0, 0)
  root.add(growthTower)

  const growthLabel = makeTextSprite('GROWTH TOWER', accent, {
    scaleX: 16,
    scaleY: 3.2,
    fontSize: 40,
  })
  growthLabel.position.set(0, stats.height + 6, 0)
  root.add(growthLabel)

  const cityBanner = makeTextSprite(cityLabel.toUpperCase(), accent, {
    scaleX: 28,
    scaleY: 5,
    fontSize: 48,
  })
  cityBanner.position.set(0, 28, cityHalfZ + 8)
  root.add(cityBanner)

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
    let nearestDist = 28
    for (const [, entry] of buildingsById) {
      const d = Math.hypot(cameraPos.x - entry.x, cameraPos.z - entry.z)
      entry.label.visible = d < 36
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

  console.log(
    `[edu city:${cityId}] ${topicMarkers.length} topics · ${fillers.length} fillers · streets=${streetNames.length}${
      park ? ` · park @ (${park.center.x.toFixed(0)}, ${park.center.z.toFixed(0)})` : ''
    }`,
  )

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
    applyProgress(list) {
      progressById.clear()
      for (const row of list) progressById.set(row.building_id, row)
      setGrowthTower(growthStatsFromProgress(list, topics.length), { animate: true })
    },
    setGrowthTower,
    updateApproachLabels,
    update(time, delta) {
      park?.update(time, delta)
      if (waterfallFx?.waterMats) {
        for (const mat of waterfallFx.waterMats) {
          if (mat.map) {
            mat.map.offset.y = (mat.map.offset.y + delta * 0.55) % 1
          }
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
