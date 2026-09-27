/**
 * Load Kenney nature + city kit assets once, then clone for islands.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const NATURE_BASE = '/assets/nature/'
const CITY_BASE = '/assets/city/'
const CITY_TEXTURE = '/assets/city/Textures/colormap.png'

const TREE_FILES = [
  'tree_oak.glb',
  'tree_default.glb',
  'tree_cone.glb',
  'tree_detailed.glb',
  'tree_simple.glb',
  'tree_tall.glb',
  'tree_pineTallA.glb',
  'tree_pineSmallA.glb',
  'tree_pineRoundA.glb',
  'tree_fat.glb',
]

const ROCK_FILES = [
  'rock_smallA.glb',
  'rock_smallB.glb',
  'rock_smallC.glb',
  'rock_smallD.glb',
  'rock_smallE.glb',
  'rock_largeA.glb',
  'rock_largeB.glb',
  'rock_largeC.glb',
]

const STATUE_FILES = ['statue_obelisk.glb', 'statue_column.glb']

const BUILDING_FILES = [
  'building-a.glb',
  'building-b.glb',
  'building-c.glb',
  'building-d.glb',
  'building-e.glb',
  'building-f.glb',
  'building-g.glb',
  'building-h.glb',
  'building-i.glb',
  'building-j.glb',
  'building-k.glb',
  'building-l.glb',
  'building-m.glb',
  'building-n.glb',
]

/** @type {null | { trees: THREE.Object3D[], rocks: THREE.Object3D[], buildings: THREE.Object3D[], statues: THREE.Object3D[], cityTexture: THREE.Texture }} */
let cache = null
/** @type {Promise<typeof cache> | null} */
let loadPromise = null

function prepareTemplate(root, targetHeight) {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const size = new THREE.Vector3()
  box.getSize(size)
  const h = Math.max(size.y, 0.001)
  const s = targetHeight / h
  root.scale.setScalar(s)
  root.updateMatrixWorld(true)
  box.setFromObject(root)
  root.position.y -= box.min.y
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true
      obj.receiveShadow = true
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const m of mats) {
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace
          m.side = THREE.FrontSide
        }
      }
    }
  })
  return root
}

function applyCityTexture(root, texture) {
  root.traverse((obj) => {
    if (!obj.isMesh) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    const next = mats.map((m) => {
      const cloned = m.clone()
      cloned.map = texture
      cloned.color = new THREE.Color(0xffffff)
      cloned.roughness = 0.85
      cloned.metalness = 0.05
      cloned.needsUpdate = true
      return cloned
    })
    obj.material = next.length === 1 ? next[0] : next
  })
}

function loadOne(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject)
  })
}

/**
 * @param {(fraction: number, label?: string) => void} [onProgress]
 */
export async function loadKenneyAssets(onProgress) {
  if (cache) return cache
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const loader = new GLTFLoader()
    const texLoader = new THREE.TextureLoader()
    const report = (f, label) => onProgress?.(f, label)

    report(0.05, 'Building your world…')
    const cityTexture = await new Promise((resolve, reject) => {
      texLoader.load(
        CITY_TEXTURE,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          tex.flipY = false
          resolve(tex)
        },
        undefined,
        reject,
      )
    })
    report(0.15, 'Building your world…')

    const total = TREE_FILES.length + ROCK_FILES.length + STATUE_FILES.length + BUILDING_FILES.length
    let done = 0
    const bump = () => {
      done += 1
      report(0.15 + (done / total) * 0.8, 'Building your world…')
    }

    const trees = []
    for (const file of TREE_FILES) {
      try {
        const scene = await loadOne(loader, NATURE_BASE + file)
        trees.push(prepareTemplate(scene, 5.5))
      } catch (err) {
        console.warn('[kenney] tree failed', file, err)
      }
      bump()
    }

    const rocks = []
    for (const file of ROCK_FILES) {
      try {
        const scene = await loadOne(loader, NATURE_BASE + file)
        rocks.push(prepareTemplate(scene, 1.8))
      } catch (err) {
        console.warn('[kenney] rock failed', file, err)
      }
      bump()
    }

    const statues = []
    for (const file of STATUE_FILES) {
      try {
        const scene = await loadOne(loader, NATURE_BASE + file)
        statues.push(prepareTemplate(scene, 1))
      } catch (err) {
        console.warn('[kenney] statue failed', file, err)
      }
      bump()
    }

    const buildings = []
    for (const file of BUILDING_FILES) {
      try {
        const scene = await loadOne(loader, CITY_BASE + file)
        applyCityTexture(scene, cityTexture)
        buildings.push(prepareTemplate(scene, 4.2))
      } catch (err) {
        console.warn('[kenney] building failed', file, err)
      }
      bump()
    }

    cache = { trees, rocks, buildings, statues, cityTexture }
    report(1, 'Building your world…')
    return cache
  })()

  try {
    return await loadPromise
  } catch (err) {
    loadPromise = null
    throw err
  }
}

export function getKenneyAssets() {
  return cache
}

/** Clone a random template; optional locked tint. */
export function cloneKenneyProp(templates, rng, { scale = 1, locked = false, yRot = null } = {}) {
  if (!templates?.length) return null
  const src = templates[Math.floor(rng() * templates.length)]
  const clone = src.clone(true)
  const s = scale * (0.85 + rng() * 0.35)
  clone.scale.multiplyScalar(s)
  clone.rotation.y = yRot == null ? rng() * Math.PI * 2 : yRot

  if (locked) {
    clone.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      const next = mats.map((m) => {
        const c = m.clone()
        if (c.color) c.color.multiplyScalar(0.55)
        c.transparent = true
        c.opacity = 0.72
        c.needsUpdate = true
        return c
      })
      obj.material = next.length === 1 ? next[0] : next
    })
  }

  return clone
}

/** Place clone so its base rests on y = surfaceY at (x,z). */
export function placeOnSurface(clone, x, z, surfaceY = 1.3) {
  if (!clone) return
  clone.position.set(x, surfaceY, z)
  clone.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(clone)
  clone.position.y += surfaceY - box.min.y
}
