/**
 * Load and cache the Sketchfab fantasy island GLB for roadmap clones.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const ISLAND_URL = '/assets/fantasy_mystical_island.glb'

/** @type {THREE.Object3D | null} */
let template = null
/** @type {Promise<THREE.Object3D | null> | null} */
let loadPromise = null

function prepareTemplate(root) {
  root.updateMatrixWorld(true)
  root.traverse((obj) => {
    if (!obj.isMesh) return
    obj.castShadow = true
    obj.receiveShadow = true
    if (!obj.material) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const m of mats) {
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace
    }
  })
  return root
}

/**
 * Deep-clone the cached island, with unique materials per instance.
 * @param {THREE.Object3D} source
 * @returns {THREE.Object3D}
 */
export function cloneIslandModel(source) {
  const clone = source.clone(true)
  clone.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => m.clone())
    } else {
      obj.material = obj.material.clone()
    }
  })
  return clone
}

/**
 * Desaturate / darken every mesh color on a cloned island (locked state).
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
 * Load the fantasy island GLB once and cache it.
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
