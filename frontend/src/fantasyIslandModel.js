/**
 * Load and cache the Sketchfab fantasy island GLB for roadmap instances.
 * Heavy model (~40MB): downsample textures, disable shadows, and instance
 * merged geometry so 10 islands ≠ 10 full scene-graph clones.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const ISLAND_URL = '/assets/fantasy_mystical_island.glb'
const MAX_TEXTURE_SIZE = 1024

/** @type {THREE.Object3D | null} */
let template = null
/** @type {Promise<THREE.Object3D | null> | null} */
let loadPromise = null
/** @type {{ box: THREE.Box3, size: THREE.Vector3, surfaceTop: number } | null} */
let templateBounds = null
/** @type {{ geometry: THREE.BufferGeometry, material: THREE.Material }[] | null} */
let bakedParts = null

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

function simplifyMaterial(src) {
  // MeshStandard is expensive at island scale; Lambert keeps maps/lighting cheap.
  const mat = new THREE.MeshLambertMaterial({
    color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
    map: src.map || null,
    emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0x000000),
    emissiveMap: src.emissiveMap || null,
    emissiveIntensity: src.emissiveIntensity ?? 1,
    transparent: Boolean(src.transparent),
    opacity: src.opacity ?? 1,
    side: THREE.FrontSide,
    fog: true,
  })
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
function bakeMergedParts(root) {
  root.updateMatrixWorld(true)
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  /** @type {Map<string, { geos: THREE.BufferGeometry[], material: THREE.Material }>} */
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
      bucket = { geos: [], material: simplifyMaterial(srcMat) }
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
    bucket.geos.push(geo)
  })

  const parts = []
  for (const bucket of buckets.values()) {
    if (!bucket.geos.length) continue
    const merged = mergeGeometries(bucket.geos, false)
    for (const g of bucket.geos) g.dispose()
    if (!merged) continue
    merged.computeBoundingSphere()
    parts.push({ geometry: merged, material: bucket.material })
  }

  // Prefer a single draw call when merges collapse to one bucket.
  console.log(`[island] baked ${parts.length} merged mesh part(s) for instancing`)
  return parts
}

function prepareTemplate(root) {
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
  bakedParts = bakeMergedParts(root)
  // Bounds must be in the same root-local space as the baked instance geometry,
  // and ignore faint FX (light beams, auras) that extend far above the ground.
  const solidParts = bakedParts.filter(({ material }) => (material.opacity ?? 1) >= 0.9)
  const box = new THREE.Box3()
  for (const { geometry } of solidParts) {
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    box.union(geometry.boundingBox)
  }
  if (box.isEmpty()) box.setFromObject(root)
  const size = new THREE.Vector3()
  box.getSize(size)
  templateBounds = { box, size, surfaceTop: measureSurfaceTop(solidParts, box) }
  return root
}

/**
 * Height of the walkable top: median of downward ray hits over the inner
 * footprint, so trees/spires poking up don't count as ground.
 */
function measureSurfaceTop(parts, box) {
  const meshes = parts.map(
    ({ geometry }) => new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })),
  )
  const center = new THREE.Vector3()
  const size = new THREE.Vector3()
  box.getCenter(center)
  box.getSize(size)
  const raycaster = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  const origin = new THREE.Vector3()
  const hits = []
  const STEPS = 7
  for (let ix = 0; ix < STEPS; ix++) {
    for (let iz = 0; iz < STEPS; iz++) {
      const fx = (ix / (STEPS - 1) - 0.5) * 0.5
      const fz = (iz / (STEPS - 1) - 0.5) * 0.5
      origin.set(center.x + fx * size.x, box.max.y + 1, center.z + fz * size.z)
      raycaster.set(origin, down)
      const hit = raycaster.intersectObjects(meshes, false)[0]
      if (hit) hits.push(hit.point.y)
    }
  }
  for (const m of meshes) m.material.dispose()
  if (!hits.length) return box.max.y
  hits.sort((a, b) => a - b)
  return hits[Math.floor(hits.length / 2)]
}

/**
 * Grounding metrics for a given uniform scale (island top near surfaceY).
 * @param {number} scale
 * @param {number} surfaceY
 */
export function getIslandPlacementMetrics(scale, surfaceY = 1.32) {
  if (!templateBounds) {
    return { yLift: 0, topR: 12, surfaceY, size: new THREE.Vector3(20, 20, 20) }
  }
  const { size, surfaceTop } = templateBounds
  const yLift = surfaceY - surfaceTop * scale
  const topR = Math.max(Math.max(size.x, size.z) * scale * 0.42, 8)
  return {
    yLift,
    topR,
    surfaceY,
    size: size.clone().multiplyScalar(scale),
  }
}

/**
 * Deep-clone fallback (used only if instancing unavailable / ?islands=clone).
 * @param {THREE.Object3D} source
 */
export function cloneIslandModel(source) {
  const clone = source.clone(true)
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
 * Few InstancedMeshes (ideally 1) for all island copies.
 * @param {THREE.Object3D} parent
 * @param {THREE.Object3D} source
 * @param {number} count
 */
export function createInstancedIslandBodies(parent, source, count) {
  const partsSrc =
    bakedParts && bakedParts.length
      ? bakedParts
      : bakeMergedParts(source)

  const parts = []
  const tmpColor = new THREE.Color()
  const identity = new THREE.Matrix4()

  for (let i = 0; i < partsSrc.length; i++) {
    const { geometry, material } = partsSrc[i]
    const baseMat = material.clone()
    const mesh = new THREE.InstancedMesh(geometry, baseMat, count)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.frustumCulled = false
    mesh.name = `island-instance-${i}`
    parent.add(mesh)
    const baseColor = baseMat.color ? baseMat.color.clone() : new THREE.Color(0xffffff)
    // Geometry already in root-local space — world matrix is the island pose.
    parts.push({ mesh, local: identity, baseColor })
  }

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

/**
 * @param {(fraction: number, label?: string) => void} [onProgress]
 * @returns {Promise<THREE.Object3D | null>}
 */
export async function loadFantasyIslandModel(onProgress) {
  if (template) return template
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    onProgress?.(0.1, 'Loading island model…')
    const loader = new GLTFLoader()
    const gltf = await new Promise((resolve, reject) => {
      loader.load(
        ISLAND_URL,
        resolve,
        (evt) => {
          if (evt.total) onProgress?.(0.1 + 0.8 * (evt.loaded / evt.total), 'Loading island model…')
        },
        reject,
      )
    })
    template = prepareTemplate(gltf.scene)
    onProgress?.(1, 'Island model ready')
    return template
  })().catch((err) => {
    console.warn('[island] failed to load fantasy_mystical_island.glb', err)
    loadPromise = null
    return null
  })

  return loadPromise
}

export function getCachedIslandModel() {
  return template
}
