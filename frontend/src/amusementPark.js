/**
 * Edu-city amusement park — merry-go-round, Ferris wheel, booths, lights.
 */
import * as THREE from 'three'

const RIDE_COLORS = [0xff4d6d, 0xffb347, 0x3de7ff, 0xa78bfa, 0x34d399, 0xff6b4a]

function makeParkLabel(text, colorHex) {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 640, 128)
  ctx.fillStyle = 'rgba(8, 6, 18, 0.8)'
  ctx.fillRect(24, 28, 592, 72)
  ctx.font = '700 48px Bebas Neue, Sora, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = colorHex
  ctx.fillText(text, 320, 64)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
  )
  sprite.scale.set(28, 5.5, 1)
  return sprite
}

function buildMerryGoRound(scale = 1) {
  const group = new THREE.Group()
  group.name = 'merryGoRound'

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2 * scale, 4.4 * scale, 0.35 * scale, 24),
    new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.7, metalness: 0.2 }),
  )
  base.position.y = 0.18 * scale
  group.add(base)

  const platform = new THREE.Group()
  platform.position.y = 0.4 * scale
  group.add(platform)

  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(3.8 * scale, 3.8 * scale, 0.2 * scale, 24),
    new THREE.MeshStandardMaterial({
      color: 0xff6b8a,
      emissive: 0x4a1020,
      emissiveIntensity: 0.35,
      roughness: 0.45,
      metalness: 0.25,
    }),
  )
  platform.add(deck)

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22 * scale, 0.28 * scale, 5.2 * scale, 10),
    new THREE.MeshStandardMaterial({ color: 0xffd27a, metalness: 0.55, roughness: 0.3 }),
  )
  pole.position.y = 2.6 * scale
  platform.add(pole)

  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(4.4 * scale, 1.6 * scale, 10),
    new THREE.MeshStandardMaterial({
      color: 0x3de7ff,
      emissive: 0x0a3a48,
      emissiveIntensity: 0.4,
      roughness: 0.5,
    }),
  )
  canopy.position.y = 5.5 * scale
  platform.add(canopy)

  const horseMat = RIDE_COLORS.map(
    (c) =>
      new THREE.MeshStandardMaterial({
        color: c,
        emissive: c,
        emissiveIntensity: 0.22,
        roughness: 0.45,
      }),
  )

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const r = 2.6 * scale
    const horse = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.35 * scale, 0.45 * scale, 0.7 * scale), horseMat[i % horseMat.length])
    body.position.y = 0.85 * scale
    horse.add(body)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22 * scale, 0.28 * scale, 0.28 * scale), horseMat[i % horseMat.length])
    head.position.set(0, 1.15 * scale, -0.4 * scale)
    horse.add(head)
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04 * scale, 0.04 * scale, 3.2 * scale, 6),
      new THREE.MeshStandardMaterial({ color: 0xd8dee8, metalness: 0.7, roughness: 0.3 }),
    )
    rod.position.y = 2.0 * scale
    horse.add(rod)
    horse.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
    horse.rotation.y = -a + Math.PI / 2
    horse.userData.phase = i * 0.7
    platform.add(horse)
  }

  // rim lights
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.1 * scale, 6, 6),
      new THREE.MeshBasicMaterial({ color: RIDE_COLORS[i % RIDE_COLORS.length] }),
    )
    bulb.position.set(Math.cos(a) * 3.7 * scale, 0.55 * scale, Math.sin(a) * 3.7 * scale)
    platform.add(bulb)
  }

  group.userData.platform = platform
  group.userData.horses = platform.children.filter((c) => c.userData.phase != null)
  return group
}

function buildFerrisWheel(scale = 1) {
  const group = new THREE.Group()
  group.name = 'ferrisWheel'

  const standMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b5, metalness: 0.65, roughness: 0.35 })
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25 * scale, 7 * scale, 0.25 * scale), standMat)
    leg.position.set(side * 2.2 * scale, 3.5 * scale, 0)
    leg.rotation.z = side * 0.28
    group.add(leg)
  }

  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * scale, 0.2 * scale, 1.2 * scale, 10), standMat)
  axle.rotation.z = Math.PI / 2
  axle.position.y = 6.2 * scale
  group.add(axle)

  const wheel = new THREE.Group()
  wheel.position.y = 6.2 * scale
  group.add(wheel)

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(4.5 * scale, 0.12 * scale, 8, 32),
    new THREE.MeshStandardMaterial({
      color: 0xffb347,
      emissive: 0xff8c3a,
      emissiveIntensity: 0.45,
      metalness: 0.5,
      roughness: 0.35,
    }),
  )
  rim.rotation.y = Math.PI / 2
  wheel.add(rim)

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.08 * scale, 9 * scale, 0.08 * scale),
      standMat,
    )
    spoke.rotation.z = a
    wheel.add(spoke)

    const gondola = new THREE.Mesh(
      new THREE.BoxGeometry(0.7 * scale, 0.55 * scale, 0.55 * scale),
      new THREE.MeshStandardMaterial({
        color: RIDE_COLORS[i % RIDE_COLORS.length],
        emissive: RIDE_COLORS[i % RIDE_COLORS.length],
        emissiveIntensity: 0.3,
        roughness: 0.4,
      }),
    )
    gondola.position.set(0, Math.sin(a) * 4.5 * scale, Math.cos(a) * 4.5 * scale)
    gondola.userData.keepUpright = true
    gondola.userData.baseAngle = a
    wheel.add(gondola)
  }

  group.userData.wheel = wheel
  return group
}

function buildBooth(x, z, labelColor) {
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 2.4, 2.4),
    new THREE.MeshStandardMaterial({ color: 0x2a3348, roughness: 0.75 }),
  )
  wall.position.y = 1.2
  g.add(wall)
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.15, 1.2),
    new THREE.MeshStandardMaterial({
      color: 0xff4d6d,
      emissive: 0x661022,
      emissiveIntensity: 0.4,
    }),
  )
  awning.position.set(0, 2.35, 1.1)
  g.add(awning)
  const window = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.0, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xffe08a }),
  )
  window.position.set(0, 1.35, 1.22)
  g.add(window)
  const sign = makeParkLabel('TICKETS', labelColor)
  sign.position.set(0, 3.4, 0)
  sign.scale.set(10, 2.2, 1)
  g.add(sign)
  return g
}

/**
 * @returns {{ root: THREE.Group, update: (t: number, dt: number) => void, center: {x:number,z:number} }}
 */
export function buildAmusementPark({ x, z, accent = '#ffb347' } = {}) {
  const root = new THREE.Group()
  root.name = 'amusementPark'
  root.position.set(x, 0, z)

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(32, 48),
    new THREE.MeshStandardMaterial({
      color: 0x1a1428,
      emissive: 0x12081a,
      emissiveIntensity: 0.35,
      roughness: 0.95,
    }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = 0.04
  root.add(ground)

  const path = new THREE.Mesh(
    new THREE.RingGeometry(6, 14, 48),
    new THREE.MeshStandardMaterial({ color: 0x2c2438, roughness: 0.9 }),
  )
  path.rotation.x = -Math.PI / 2
  path.position.y = 0.05
  root.add(path)

  // colorful fence posts
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 1.4, 0.25),
      new THREE.MeshStandardMaterial({
        color: RIDE_COLORS[i % RIDE_COLORS.length],
        emissive: RIDE_COLORS[i % RIDE_COLORS.length],
        emissiveIntensity: 0.2,
      }),
    )
    post.position.set(Math.cos(a) * 30, 0.7, Math.sin(a) * 30)
    root.add(post)
  }

  const merry = buildMerryGoRound(1.35)
  merry.position.set(-10, 0, 4)
  root.add(merry)

  const wheel = buildFerrisWheel(1.15)
  wheel.position.set(12, 0, -2)
  wheel.rotation.y = -0.4
  root.add(wheel)

  root.add(buildBooth(-2, 18, accent))

  // cotton-candy / snack stalls
  for (const [sx, sz, col] of [
    [-18, -8, 0xff6b4a],
    [18, 10, 0xa78bfa],
    [-14, 14, 0x34d399],
  ]) {
    const stall = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2.0, 2.4),
      new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.25,
        roughness: 0.55,
      }),
    )
    stall.position.set(sx, 1.0, sz)
    root.add(stall)
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.8, 1.0, 4),
      new THREE.MeshStandardMaterial({ color: 0xffe08a, roughness: 0.5 }),
    )
    roof.position.set(sx, 2.5, sz)
    root.add(roof)
  }

  // fountain centerpiece
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.6, 0.5, 20),
    new THREE.MeshStandardMaterial({ color: 0x3a4a68, roughness: 0.4, metalness: 0.4 }),
  )
  fountain.position.set(0, 0.25, 0)
  root.add(fountain)
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1.8, 20),
    new THREE.MeshStandardMaterial({
      color: 0x3de7ff,
      emissive: 0x1a88aa,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.75,
    }),
  )
  water.rotation.x = -Math.PI / 2
  water.position.y = 0.52
  root.add(water)

  const banner = makeParkLabel('AMUSEMENT PARK', accent)
  banner.position.set(0, 14, 28)
  root.add(banner)

  // string lights between poles
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe08a })
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), lightMat)
    bulb.position.set(Math.cos(a) * 22, 3.2 + Math.sin(i * 1.7) * 0.35, Math.sin(a) * 22)
    root.add(bulb)
  }

  function update(time, _delta) {
    const platform = merry.userData.platform
    if (platform) platform.rotation.y = time * 0.55
    for (const horse of merry.userData.horses || []) {
      horse.position.y = Math.sin(time * 2.2 + horse.userData.phase) * 0.22
    }
    const w = wheel.userData.wheel
    if (w) {
      w.rotation.x = time * 0.28
      for (const child of w.children) {
        if (child.userData.keepUpright) {
          // keep gondolas roughly level as wheel turns
          child.rotation.x = -w.rotation.x
        }
      }
    }
  }

  return {
    root,
    update,
    center: { x, z },
    mapMarker: { x, z, name: 'Amusement Park', color: accent },
  }
}
