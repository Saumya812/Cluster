/**
 * Gamified New York mode — real OSM Midtown footprints, Cluster night look.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createWindowTextures, WINDOW_TILE_CELLS, hashStringToSeed } from './windowTexture.js'

const WINDOW_UNIT_SIZE = 1.15
const MIN_UV_REPEAT = 0.35
const BATCH_SIZE = 40
const ROAD_COLOR = 0x14161f
const SIDEWALK_COLOR = 0x3a4052

const DISTRICT_TINTS = [
  '#ff6b4a', '#ffb347', '#3de7ff', '#ff4d8d', '#34d399',
  '#a78bfa', '#f0b429', '#63b3ed', '#ff5c5c', '#c77dff',
]

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

function patchUvRepeat(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 instanceUvRepeat;')
      .replace(
        '#include <uv_vertex>',
        `
        #include <uv_vertex>
        #ifdef USE_MAP
          vMapUv = uv * instanceUvRepeat;
        #endif
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = uv * instanceUvRepeat;
        #endif
        `,
      )
  }
}

function buildNycBuildings(scene, buildings) {
  const dummy = new THREE.Object3D()
  const tileWorld = WINDOW_TILE_CELLS * WINDOW_UNIT_SIZE
  const index = new Map()

  for (let start = 0; start < buildings.length; start += BATCH_SIZE) {
    const batch = buildings.slice(start, start + BATCH_SIZE)
    const seed = hashStringToSeed(String(batch[0]?.id ?? start))
    const { colorTexture, emissiveTexture } = createWindowTextures({
      seed,
      minLitRatio: 0.22,
      maxLitRatio: 0.4,
    })
    const material = new THREE.MeshStandardMaterial({
      map: colorTexture,
      emissiveMap: emissiveTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.55,
      roughness: 0.7,
      metalness: 0.2,
    })
    patchUvRepeat(material)

    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, batch.length)
    const uvRepeat = new Float32Array(batch.length * 2)

    batch.forEach((b, i) => {
      const h = Math.max(b.height || 12, 4)
      const w = Math.max(b.width || 5, 2.5)
      const d = Math.max(b.depth || 5, 2.5)
      dummy.position.set(b.x, h / 2, b.z)
      dummy.scale.set(w, h, d)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      const tint = new THREE.Color(DISTRICT_TINTS[Math.abs(b.id || i) % DISTRICT_TINTS.length])
      mesh.setColorAt(i, tint)

      uvRepeat[i * 2] = Math.max(((w + d) / 2) / tileWorld, MIN_UV_REPEAT)
      uvRepeat[i * 2 + 1] = Math.max(h / tileWorld, MIN_UV_REPEAT)

      index.set(b.name || `bldg-${b.id}`, { mesh, localIndex: i, building: b })
    })

    mesh.geometry.setAttribute('instanceUvRepeat', new THREE.InstancedBufferAttribute(uvRepeat, 2))
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    scene.add(mesh)
  }

  return index
}

function roadWidthFor(highway) {
  switch (highway) {
    case 'motorway':
    case 'trunk':
      return 5.5
    case 'primary':
      return 4.4
    case 'secondary':
      return 3.6
    case 'tertiary':
      return 3.0
    case 'pedestrian':
      return 2.4
    default:
      return 2.6
  }
}

function buildNycStreets(scene, streets) {
  const roadGeos = []
  const sidewalkGeos = []

  for (const street of streets) {
    const pts = street.points || []
    if (pts.length < 2) continue
    const width = roadWidthFor(street.highway)
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len = Math.hypot(dx, dz)
      if (len < 0.4) continue
      const yaw = Math.atan2(dx, dz)
      const mx = (a.x + b.x) / 2
      const mz = (a.z + b.z) / 2

      const road = new THREE.PlaneGeometry(width, len)
      road.rotateX(-Math.PI / 2)
      road.rotateY(yaw)
      road.translate(mx, 0.01, mz)
      roadGeos.push(road)

      for (const sign of [-1, 1]) {
        const sw = new THREE.PlaneGeometry(0.7, len)
        sw.rotateX(-Math.PI / 2)
        sw.rotateY(yaw)
        const ox = Math.cos(yaw) * sign * (width / 2 + 0.45)
        const oz = -Math.sin(yaw) * sign * (width / 2 + 0.45)
        sw.translate(mx + ox, 0.015, mz + oz)
        sidewalkGeos.push(sw)
      }
    }
  }

  if (roadGeos.length) {
    scene.add(
      new THREE.Mesh(
        mergeGeometries(roadGeos),
        new THREE.MeshStandardMaterial({ color: ROAD_COLOR, roughness: 0.95 }),
      ),
    )
  }
  if (sidewalkGeos.length) {
    scene.add(
      new THREE.Mesh(
        mergeGeometries(sidewalkGeos),
        new THREE.MeshStandardMaterial({ color: SIDEWALK_COLOR, roughness: 0.88 }),
      ),
    )
  }
}

function buildGround(scene, buildings) {
  const xs = buildings.map((b) => b.x)
  const zs = buildings.map((b) => b.z)
  const minX = Math.min(...xs) - 40
  const maxX = Math.max(...xs) + 40
  const minZ = Math.min(...zs) - 40
  const maxZ = Math.max(...zs) + 40
  const w = maxX - minX
  const d = maxZ - minZ
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: 0x060810, roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set((minX + maxX) / 2, -0.05, (minZ + maxZ) / 2)
  scene.add(ground)
  return { minX, maxX, minZ, maxZ }
}

function buildSimpleNeon(scene, buildings) {
  const count = Math.min(90, Math.floor(buildings.length / 8))
  if (count <= 0) return { update() {} }
  const step = Math.max(1, Math.floor(buildings.length / count))
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 2.6,
      roughness: 0.4,
    }),
    count,
  )
  const colors = new Float32Array(count * 3)
  const tmp = new THREE.Color()
  const dummy = new THREE.Object3D()
  const neon = [0xff4d8d, 0x3de7ff, 0xffb347, 0xff5c5c]

  let i = 0
  for (let idx = 0; idx < buildings.length && i < count; idx += step) {
    const b = buildings[idx]
    const rng = mulberry32(b.id || idx)
    dummy.position.set(b.x + (rng() - 0.5) * b.width, 4 + rng() * Math.min(b.height * 0.6, 30), b.z)
    dummy.scale.set(0.35 + rng() * 0.5, 3 + rng() * 8, 0.18)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    tmp.set(neon[i % neon.length])
    tmp.toArray(colors, i * 3)
    i++
  }
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
  mesh.userData.dynamic = true
  scene.add(mesh)
  return {
    update(time) {
      mesh.material.emissiveIntensity = 2.2 + Math.sin(time * 2) * 0.5
    },
  }
}

/**
 * @returns {{
 *   bounds: object,
 *   buildings: array,
 *   meta: object,
 *   update: (t:number)=>void,
 *   flyTargets: array
 * }}
 */
export function buildNycWorld(scene, nycData) {
  const buildings = nycData.buildings || []
  const streets = nycData.streets || []
  if (!buildings.length) {
    throw new Error('NYC data has no buildings — run python nyc_osm.py')
  }

  const bounds = buildGround(scene, buildings)
  buildNycStreets(scene, streets)
  buildNycBuildings(scene, buildings)
  const neon = buildSimpleNeon(scene, buildings)

  // Landmark-ish fly targets: tallest buildings + named ones.
  const flyTargets = [...buildings]
    .sort((a, b) => (b.height || 0) - (a.height || 0))
    .slice(0, 40)
    .map((b) => ({
      name: b.name,
      x: b.x,
      z: b.z,
      height: b.height,
      kind: 'nyc',
    }))

  console.log(
    `NYC mode: ${buildings.length} buildings, ${streets.length} streets ` +
      `(${nycData.meta?.place || 'New York'})`,
  )

  return {
    bounds,
    buildings,
    meta: nycData.meta || {},
    flyTargets,
    update(time) {
      neon.update(time)
    },
  }
}

export async function fetchNycData(onProgress) {
  onProgress?.(0.15, 'Downloading Midtown NYC map…')
  const response = await fetch('/nyc.json')
  if (!response.ok) {
    throw new Error(
      'nyc.json missing — run `python nyc_osm.py` from the project root, then refresh.',
    )
  }
  onProgress?.(0.45, 'Parsing OpenStreetMap data…')
  return response.json()
}
