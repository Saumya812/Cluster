/**
 * Load and cache the roadmap island GLBs (three Sketchfab models, rotated by level).
 * Heavy models (40–100MB): downsample textures, disable shadows, and instance
 * merged geometry so 10 islands ≠ 10 full scene-graph clones.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const MAX_TEXTURE_SIZE = 1024

/**
 * Levels 1/4/7/10 → fantasy, 2/5/8 → temple, 3/6/9 → mine house.
 * `exclude` drops non-island meshes (watermark badges); `alphaCutout` turns
 * blended foliage cards into alpha-tested, double-sided geometry so they sort
 * correctly when instanced; `surfaceQuantile` picks the walkable height out of
 * the top-down height samples (lower = ignore roofs/temples in the middle).
 */
export const ISLAND_MODEL_DEFS = [
  {
    key: 'fantasy',
    url: '/assets/fantasy_mystical_island.glb',
    surfaceQuantile: 0.5,
    decorate: true,
  },
  {
    key: 'temple',
    url: '/assets/floating_island_temple_-_hunyuan_3d_vs_supavoxel.glb',
    exclude: /badge/i,
    surfaceQuantile: 0.3,
    decorate: false,
  },
  {
    key: 'mine',
    url: '/assets/stylized_3d_floating_island_and_mine_house.glb',
    alphaCutout: true,
    groundMaterial: /Grass_Mat|Island_Mat/,
    surfaceQuantile: 0.5,
    decorate: false,
  },
]

/**
 * @typedef {{
 *   key: string,
 *   url: string,
 *   def: typeof ISLAND_MODEL_DEFS[number],
 *   template: THREE.Object3D,
 *   parts: { geometry: THREE.BufferGeometry, material: THREE.Material, name: string }[],
 *   bounds: { box: THREE.Box3, size: THREE.Vector3, surfaceTop: number },
 * }} IslandModel
 */

/** @type {Map<string, IslandModel>} */
const models = new Map()
/** @type {Map<string, Promise<IslandModel | null>>} */
const loadPromises = new Map()

function downsampleTexture(tex, maxSize = MAX_TEXTURE_SIZE) {
  const img = tex?.image
  if (!img?.width || !img?.height) return
  const maxDim = Math.max(img.width, img.height)
  if (maxDim <= maxSize) return
  const scale = maxSize / maxDim
  const cw = Math.max(1, Math.floor(img.width * scale))
  const ch = Math.max(1, Math.floor(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, cw, ch)
  tex.image = canvas
  tex.needsUpdate = true
}

function simplifyMaterial(src, def) {
  const cutout = Boolean(def.alphaCutout && src.transparent && src.map)
  // MeshStandard is expensive at island scale; Lambert keeps maps/lighting cheap.
  const mat = new THREE.MeshLambertMaterial({
    color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
    map: src.map || null,
    emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0x000000),
    emissiveMap: src.emissiveMap || null,
    emissiveIntensity: src.emissiveIntensity ?? 1,
    transparent: cutout ? false : Boolean(src.transparent),
    alphaTest: cutout ? 0.5 : src.alphaTest || 0,
    opacity: src.opacity ?? 1,
    side: cutout ? THREE.DoubleSide : def.alphaCutout ? src.side : THREE.FrontSide,
    fog: true,
  })
  mat.name = src.name || ''
  if (mat.map) {
    mat.map.colorSpace = THREE.SRGBColorSpace
    mat.map.anisotropy = 8
  }
  return mat
}

/**
 * Bake every mesh in the GLB into as few geometries as possible (one per
 * unique map/color signature) so N islands become N instances × few draws.
 */
function bakeMergedParts(root, def) {
  root.updateMatrixWorld(true)
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  /** @type {Map<string, { geos: THREE.BufferGeometry[], material: THREE.Material, name: string }>} */
  const buckets = new Map()

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    const srcMat = materials[0]
    if (!srcMat) return

    const key = [
      srcMat.map?.uuid || 'nomap',
      srcMat.color?.getHexString?.() || 'ffffff',
      srcMat.emissiveMap?.uuid || 'noem',
      srcMat.transparent ? 't' : 'o',
    ].join('|')

    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { geos: [], material: simplifyMaterial(srcMat, def), name: srcMat.name || '' }
      buckets.set(key, bucket)
    }

    const geo = obj.geometry.clone()
    const local = new THREE.Matrix4().copy(rootInv).multiply(obj.matrixWorld)
    geo.applyMatrix4(local)
    // Keep only attributes mergeGeometries + Lambert need; drop tangents/uv2/etc.
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') {
        geo.deleteAttribute(name)
      }
    }
    geo.morphAttributes = {}
    if (!geo.getAttribute('normal')) geo.computeVertexNormals()
    if (!geo.getAttribute('uv')) {
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2))
    }
    bucket.geos.push(geo)
  })

  const parts = []
  for (const bucket of buckets.values()) {
    if (!bucket.geos.length) continue
    // mergeGeometries needs all-indexed or all-non-indexed inputs.
    const allIndexed = bucket.geos.every((g) => g.index)
    const geos = allIndexed ? bucket.geos : bucket.geos.map((g) => (g.index ? g.toNonIndexed() : g))
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
    if (geos.length > 1) {
      for (const g of new Set([...bucket.geos, ...geos])) g.dispose()
    }
    if (!merged) continue
    merged.computeBoundingSphere()
    parts.push({ geometry: merged, material: bucket.material, name: bucket.name })
  }

  return parts
}

function stripExcluded(root, pattern) {
  if (!pattern) return
  const drop = []
  root.traverse((obj) => {
    if (!obj.isMesh) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    const names = [obj.name, obj.parent?.name, ...mats.map((m) => m?.name)]
    if (names.some((n) => n && pattern.test(n))) drop.push(obj)
  })
  for (const obj of drop) obj.removeFromParent()
}

/** @returns {IslandModel} */
function prepareModel(root, def) {
  stripExcluded(root, def.exclude)
  root.updateMatrixWorld(true)
  root.traverse((obj) => {
    if (!obj.isMesh) return
    obj.castShadow = false
    obj.receiveShadow = false
    if (!obj.material) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const m of mats) {
      if (m.map) {
        m.map.colorSpace = THREE.SRGBColorSpace
        downsampleTexture(m.map)
      }
      if (m.normalMap) downsampleTexture(m.normalMap)
      if (m.roughnessMap) downsampleTexture(m.roughnessMap)
      if (m.metalnessMap) downsampleTexture(m.metalnessMap)
      if (m.emissiveMap) downsampleTexture(m.emissiveMap)
      if (m.aoMap) downsampleTexture(m.aoMap)
      // Drop expensive secondary maps after downsample — Lambert path ignores most.
      if (m.normalMap) {
        m.normalMap.dispose?.()
        m.normalMap = null
      }
    }
  })
  const parts = bakeMergedParts(root, def)
  // Bounds must be in the same root-local space as the baked instance geometry,
  // and ignore faint FX (light beams, auras) that extend far above the ground.
  const solidParts = parts.filter(({ material }) => (material.opacity ?? 1) >= 0.9)
  const box = new THREE.Box3()
  for (const { geometry } of solidParts) {
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    box.union(geometry.boundingBox)
  }
  if (box.isEmpty()) box.setFromObject(root)

  // Center the footprint on the island anchor so labels/bridges sit mid-island.
  const cx = (box.min.x + box.max.x) / 2
  const cz = (box.min.z + box.max.z) / 2
  for (const { geometry } of parts) {
    geometry.translate(-cx, 0, -cz)
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
  }
  box.translate(new THREE.Vector3(-cx, 0, -cz))
  const pivot = new THREE.Group()
  pivot.name = `island-template-${def.key}`
  root.position.set(-cx, 0, -cz)
  pivot.add(root)

  const size = new THREE.Vector3()
  box.getSize(size)
  const groundParts = def.groundMaterial
    ? solidParts.filter((p) => def.groundMaterial.test(p.name))
    : solidParts
  const surfaceTop = measureSurfaceTop(groundParts.length ? groundParts : solidParts, box, def)
  return {
    key: def.key,
    url: def.url,
    def,
    template: pivot,
    parts,
    bounds: { box, size, surfaceTop },
  }
}

const RAYCAST_TRI_LIMIT = 200_000
const SURFACE_STEPS = 7

function triangleCount(parts) {
  let tris = 0
  for (const { geometry } of parts) {
    tris += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3
  }
  return tris
}

/**
 * Height of the walkable top over the inner footprint, so trees/spires poking
 * up don't count as ground. Small models are ray-cast; dense scans use a
 * per-cell max-vertex height grid (ray-casting 1M+ tris would stall the tab).
 */
function measureSurfaceTop(parts, box, def) {
  const center = new THREE.Vector3()
  const size = new THREE.Vector3()
  box.getCenter(center)
  box.getSize(size)
  const hits =
    triangleCount(parts) > RAYCAST_TRI_LIMIT
      ? sampleHeightGrid(parts, center, size)
      : sampleRaycast(parts, box, center, size)
  if (!hits.length) return box.max.y
  hits.sort((a, b) => a - b)
  const q = def.surfaceQuantile ?? 0.5
  return hits[Math.min(hits.length - 1, Math.floor(hits.length * q))]
}

function sampleRaycast(parts, box, center, size) {
  const meshes = parts.map(
    ({ geometry }) => new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })),
  )
  const raycaster = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  const origin = new THREE.Vector3()
  const hits = []
  for (let ix = 0; ix < SURFACE_STEPS; ix++) {
    for (let iz = 0; iz < SURFACE_STEPS; iz++) {
      const fx = (ix / (SURFACE_STEPS - 1) - 0.5) * 0.5
      const fz = (iz / (SURFACE_STEPS - 1) - 0.5) * 0.5
      origin.set(center.x + fx * size.x, box.max.y + 1, center.z + fz * size.z)
      raycaster.set(origin, down)
      const hit = raycaster.intersectObjects(meshes, false)[0]
      if (hit) hits.push(hit.point.y)
    }
  }
  for (const m of meshes) m.material.dispose()
  return hits
}

function sampleHeightGrid(parts, center, size) {
  const cells = new Float32Array(SURFACE_STEPS * SURFACE_STEPS).fill(-Infinity)
  const halfX = size.x * 0.25
  const halfZ = size.z * 0.25
  for (const { geometry } of parts) {
    const pos = geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - center.x
      const dz = pos.getZ(i) - center.z
      if (Math.abs(dx) > halfX || Math.abs(dz) > halfZ) continue
      const ix = Math.min(SURFACE_STEPS - 1, Math.floor(((dx + halfX) / (2 * halfX)) * SURFACE_STEPS))
      const iz = Math.min(SURFACE_STEPS - 1, Math.floor(((dz + halfZ) / (2 * halfZ)) * SURFACE_STEPS))
      const k = ix * SURFACE_STEPS + iz
      const y = pos.getY(i)
      if (y > cells[k]) cells[k] = y
    }
  }
  return Array.from(cells).filter(Number.isFinite)
}

/**
 * Uniform scale that makes this model's footprint `targetWidth` world units.
 * @param {IslandModel} model
 * @param {number} targetWidth
 */
export function islandScaleFor(model, targetWidth) {
  const { size } = model.bounds
  return targetWidth / Math.max(size.x, size.z, 1e-6)
}

/**
 * Grounding metrics for a model at a given uniform scale (island top near surfaceY).
 * @param {IslandModel | null} model
 * @param {number} scale
 * @param {number} surfaceY
 */
export function getIslandPlacementMetrics(model, scale, surfaceY = 1.32) {
  if (!model) {
    return { yLift: 0, topR: 12, surfaceY, scale, size: new THREE.Vector3(20, 20, 20) }
  }
  const { size, surfaceTop } = model.bounds
  const yLift = surfaceY - surfaceTop * scale
  const topR = Math.max(Math.max(size.x, size.z) * scale * 0.42, 8)
  return {
    yLift,
    topR,
    surfaceY,
    scale,
    size: size.clone().multiplyScalar(scale),
  }
}

/**
 * Deep-clone fallback (used only if instancing unavailable / ?islands=clone).
 * @param {IslandModel} model
 */
export function cloneIslandModel(model) {
  const clone = model.template.clone(true)
  clone.traverse((obj) => {
    if (!obj.isMesh) return
    obj.castShadow = false
    obj.receiveShadow = false
    if (!obj.material) return
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => m.clone())
    } else {
      obj.material = obj.material.clone()
    }
  })
  return clone
}

/**
 * @param {THREE.Object3D} root
 * @param {number} [factor=0.4]
 */
export function darkenIslandMaterials(root, factor = 0.4) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const m of mats) {
      if (m?.color) m.color.multiplyScalar(factor)
      if (m?.emissive) m.emissive.multiplyScalar(factor)
    }
  })
}

/**
 * Few InstancedMeshes per model for all island copies that use it.
 * @param {THREE.Object3D} parent
 * @param {IslandModel} model
 * @param {number} count
 */
export function createInstancedIslandBodies(parent, model, count) {
  const parts = []
  const tmpColor = new THREE.Color()

  model.parts.forEach(({ geometry, material }, i) => {
    const baseMat = material.clone()
    const mesh = new THREE.InstancedMesh(geometry, baseMat, count)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.frustumCulled = false
    mesh.name = `island-instance-${model.key}-${i}`
    parent.add(mesh)
    const baseColor = baseMat.color ? baseMat.color.clone() : new THREE.Color(0xffffff)
    // Geometry already in centered root-local space — world matrix is the island pose.
    parts.push({ mesh, baseColor })
  })

  return {
    partCount: parts.length,
    meshes: parts.map((p) => p.mesh),
    setInstance(index, worldMatrix, locked) {
      for (const part of parts) {
        part.mesh.setMatrixAt(index, worldMatrix)
        if (locked) tmpColor.copy(part.baseColor).multiplyScalar(0.4)
        else tmpColor.copy(part.baseColor)
        part.mesh.setColorAt(index, tmpColor)
      }
    },
    finalize() {
      for (const part of parts) {
        part.mesh.instanceMatrix.needsUpdate = true
        if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true
      }
    },
  }
}

function loadIslandModel(def, onProgress) {
  const cached = models.get(def.key)
  if (cached) return Promise.resolve(cached)
  const pending = loadPromises.get(def.key)
  if (pending) return pending

  const promise = new GLTFLoader()
    .loadAsync(def.url, (evt) => {
      if (evt.total) onProgress?.(evt.loaded / evt.total)
    })
    .then((gltf) => {
      const model = prepareModel(gltf.scene, def)
      models.set(def.key, model)
      onProgress?.(1)
      return model
    })
    .catch((err) => {
      console.warn(`[island] failed to load ${def.url}`, err)
      loadPromises.delete(def.key)
      return null
    })
  loadPromises.set(def.key, promise)
  return promise
}

/**
 * Load all island models in parallel. Slots that fail resolve to null.
 * @param {(fraction: number, label?: string) => void} [onProgress]
 * @returns {Promise<(IslandModel | null)[]>}
 */
export function loadIslandModels(onProgress) {
  const fractions = ISLAND_MODEL_DEFS.map(() => 0)
  const report = () => {
    const avg = fractions.reduce((a, b) => a + b, 0) / fractions.length
    onProgress?.(0.05 + 0.9 * avg, 'Loading island models…')
  }
  onProgress?.(0.05, 'Loading island models…')
  return Promise.all(
    ISLAND_MODEL_DEFS.map((def, i) =>
      loadIslandModel(def, (f) => {
        fractions[i] = f
        report()
      }),
    ),
  ).then((list) => {
    onProgress?.(1, 'Island models ready')
    return list
  })
}

/**
 * Model for a level (1-based), falling back to any loaded model.
 * @param {(IslandModel | null)[]} list
 * @param {number} levelNum
 */
export function islandModelForLevel(list, levelNum) {
  if (!list?.length) return null
  const n = Math.max(1, levelNum || 1)
  return list[(n - 1) % list.length] || list.find(Boolean) || null
}

export function getCachedIslandModels() {
  return ISLAND_MODEL_DEFS.map((def) => models.get(def.key) || null)
}
