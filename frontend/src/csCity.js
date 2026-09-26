/**
 * Scene 2 — CS Subject City (MVP).
 * 3 districts, content towers + one learner plot/tower each.
 * Reuses Cluster night materials / window textures / fog aesthetic.
 */
import * as THREE from 'three'
import { createWindowTextures, WINDOW_TILE_CELLS, hashStringToSeed } from './windowTexture.js'
import { CS_DISTRICTS } from './curriculum.js'

const WINDOW_UNIT = 1.2
const CONTENT_HEIGHTS = [18, 24, 30, 22]
const PLOT_SIZE = 8
const DISTRICT_SPACING = 55
const TOWER_GAP = 10

function makeDistrictLabel(text, colorHex) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 512, 96)
  ctx.fillStyle = 'rgba(5, 8, 20, 0.55)'
  ctx.fillRect(24, 16, 464, 64)
  ctx.font = '700 42px Bebas Neue, Sora, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = colorHex
  ctx.fillText(text.toUpperCase(), 256, 50)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  )
  sprite.scale.set(18, 3.4, 1)
  return sprite
}

function learnerHeightFromProgress(row) {
  if (!row) return 2
  const lectures = row.lectures_done || 0
  const score = row.quiz_score || 0
  let bonus = 0
  if (score >= 90) bonus = 30
  else if (score >= 85) bonus = 20
  else if (score >= 75) bonus = 10
  return 2 + lectures * 10 + bonus
}

/**
 * @param {THREE.Scene} scene
 * @param {{ progress?: Array<{district:string,lectures_done:number,quiz_score:number,tower_height?:number}> }} opts
 */
export function buildCsCity(scene, { progress = [] } = {}) {
  const root = new THREE.Group()
  root.name = 'csCity'
  scene.add(root)

  const progressByDistrict = new Map(progress.map((p) => [p.district, p]))
  const clickables = []
  const learnerMeshes = new Map()
  const learnerTargets = new Map()
  const districtCenters = []
  const reposForHud = []

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 140),
    new THREE.MeshStandardMaterial({ color: 0x060810, roughness: 1, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.05
  root.add(ground)

  // Soft avenue strip under districts
  const avenue = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 14),
    new THREE.MeshStandardMaterial({ color: 0x12131a, roughness: 0.95, metalness: 0.05 }),
  )
  avenue.rotation.x = -Math.PI / 2
  avenue.position.set(0, 0.01, 8)
  root.add(avenue)

  const { colorTexture, emissiveTexture } = createWindowTextures({
    seed: hashStringToSeed('cs-city-content'),
    minLitRatio: 0.28,
    maxLitRatio: 0.45,
  })
  const contentMat = new THREE.MeshStandardMaterial({
    map: colorTexture,
    emissiveMap: emissiveTexture,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.55,
    roughness: 0.72,
    metalness: 0.18,
  })

  CS_DISTRICTS.forEach((district, di) => {
    const originX = (di - 1) * DISTRICT_SPACING
    const originZ = 0
    const color = new THREE.Color(district.color)
    districtCenters.push({
      id: district.id,
      label: district.label,
      cx: originX,
      cz: originZ,
      color: district.color,
    })

    // District plaza
    const plaza = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 36),
      new THREE.MeshStandardMaterial({ color: 0x101624, roughness: 0.9, metalness: 0.08 }),
    )
    plaza.rotation.x = -Math.PI / 2
    plaza.position.set(originX, 0.02, originZ)
    root.add(plaza)

    const label = makeDistrictLabel(district.label, district.color)
    label.position.set(originX, 36, originZ - 14)
    root.add(label)

    // Content towers (fixed heights)
    district.contentTopics.forEach((topic, ti) => {
      const height = CONTENT_HEIGHTS[ti % CONTENT_HEIGHTS.length]
      const width = 5.2
      const depth = 5.2
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), contentMat.clone())
      mesh.material.color = color.clone()
      // Tint via material color multiply on map
      mesh.material.color.copy(color)
      const x = originX + (ti - 1.5) * TOWER_GAP
      const z = originZ - 6
      mesh.position.set(x, height / 2, z)
      mesh.scale.set(width, height, depth)
      mesh.userData = {
        kind: 'content',
        districtId: district.id,
        topic,
      }
      root.add(mesh)
      clickables.push(mesh)

      // Tiny topic sprite
      const topicCanvas = document.createElement('canvas')
      topicCanvas.width = 256
      topicCanvas.height = 64
      const tctx = topicCanvas.getContext('2d')
      tctx.fillStyle = 'rgba(5,8,20,0.6)'
      tctx.fillRect(0, 0, 256, 64)
      tctx.font = '600 28px Sora, sans-serif'
      tctx.fillStyle = '#e8eef8'
      tctx.textAlign = 'center'
      tctx.textBaseline = 'middle'
      tctx.fillText(topic, 128, 34)
      const topicTex = new THREE.CanvasTexture(topicCanvas)
      topicTex.colorSpace = THREE.SRGBColorSpace
      const topicSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: topicTex, transparent: true, depthWrite: false }),
      )
      topicSprite.scale.set(6, 1.5, 1)
      topicSprite.position.set(x, height + 2, z)
      root.add(topicSprite)

      reposForHud.push({
        full_name: `${district.id}/${topic}`,
        district: district.label,
        x,
        z,
        stars: Math.round(height * 40),
        contributor_count: 0,
      })
    })

    // Learner plot (pad) + tower
    const plotX = originX
    const plotZ = originZ + 10
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(PLOT_SIZE, 0.35, PLOT_SIZE),
      new THREE.MeshStandardMaterial({
        color: 0x1a2238,
        emissive: color,
        emissiveIntensity: 0.25,
        roughness: 0.6,
        metalness: 0.3,
      }),
    )
    pad.position.set(plotX, 0.18, plotZ)
    pad.userData = { kind: 'plot', districtId: district.id }
    root.add(pad)
    clickables.push(pad)

    const row = progressByDistrict.get(district.id)
    const height = row?.tower_height ?? learnerHeightFromProgress(row)
    const learnerMat = new THREE.MeshStandardMaterial({
      color: color.clone().multiplyScalar(0.85),
      emissive: color,
      emissiveIntensity: height > 3 ? 1.8 : 0.35,
      roughness: 0.35,
      metalness: 0.45,
    })
    const learner = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), learnerMat)
    learner.position.set(plotX, Math.max(height, 0.4) / 2, plotZ)
    learner.scale.set(4.2, Math.max(height, 0.4), 4.2)
    learner.userData = { kind: 'learner', districtId: district.id }
    root.add(learner)
    clickables.push(learner)
    learnerMeshes.set(district.id, learner)
    learnerTargets.set(district.id, { x: plotX, z: plotZ, color })

    // Ring marker for empty plots
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 3.6, 32),
      new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(plotX, 0.4, plotZ)
    root.add(ring)

    reposForHud.push({
      full_name: `${district.id}/learner`,
      district: district.label,
      x: plotX,
      z: plotZ,
      stars: Math.round(height * 100),
      contributor_count: 0,
    })
  })

  // Ambient street lamps (simple)
  for (let i = -2; i <= 2; i++) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 6, 8),
      new THREE.MeshStandardMaterial({ color: 0x1c1f28, roughness: 0.7 }),
    )
    pole.position.set(i * 28, 3, 18)
    root.add(pole)
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffc878 }),
    )
    glow.position.set(i * 28, 6.2, 18)
    root.add(glow)
  }

  function setLearnerTowerHeight(districtId, height, { animate = true } = {}) {
    const mesh = learnerMeshes.get(districtId)
    if (!mesh) return
    const targetH = Math.max(height, 0.4)
    mesh.material.emissiveIntensity = targetH > 3 ? 1.8 : 0.35
    if (!animate) {
      mesh.scale.y = targetH
      mesh.position.y = targetH / 2
      return
    }
    const startH = mesh.scale.y
    const startY = mesh.position.y
    const endY = targetH / 2
    const t0 = performance.now()
    const duration = 900
    function step(now) {
      const u = Math.min((now - t0) / duration, 1)
      const s = u * u * (3 - 2 * u)
      const h = startH + (targetH - startH) * s
      mesh.scale.y = h
      mesh.position.y = startY + (endY - startY) * s
      if (u < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  function nearestDistrict(position, maxDist = 28) {
    let best = null
    let bestD = maxDist
    for (const d of districtCenters) {
      const dist = Math.hypot(position.x - d.cx, position.z - d.cz)
      if (dist < bestD) {
        bestD = dist
        best = d
      }
    }
    return best
  }

  return {
    root,
    clickables,
    districtCenters,
    reposForHud,
    learnerTargets,
    setLearnerTowerHeight,
    nearestDistrict,
    applyProgress(progressList) {
      for (const row of progressList) {
        const h = row.tower_height ?? learnerHeightFromProgress(row)
        setLearnerTowerHeight(row.district, h, { animate: false })
      }
    },
    dispose() {
      scene.remove(root)
    },
  }
}

export { learnerHeightFromProgress, WINDOW_UNIT, WINDOW_TILE_CELLS }
