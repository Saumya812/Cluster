import './style.css'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { createWindowTextures, WINDOW_TILE_CELLS, hashStringToSeed } from './windowTexture.js'
import { createLiveFeed } from './liveFeed.js'
import { buildCityscape } from './cityscape.js'
import { setupDistanceCulling } from './culling.js'
import { createHud } from './hud.js'
import { createSubjectGlobe } from './subjectGlobe.js'
import { buildEduCity, growthStatsFromProgress } from './eduCity.js'
import { CITY_LABELS } from './cities.js'
import { topicsForLevel } from './levelCurriculum.js'
import { createIslandRoadmap, animateCameraTo } from './islandRoadmap.js'
import { loadKenneyAssets } from './kenneyAssets.js'
import { loadIslandModels } from './fantasyIslandModel.js'
import { createDistrictPicker } from './districtPicker.js'
import { createTopicPanel } from './topicPanel.js'
import { createBuildingSidePanel } from './buildingSidePanel.js'
import { fetchCareerOutcomes, formatSalary, getCachedCareerOutcomes } from './careerOutcomes.js'
import { createPlaneRig } from './planeRig.js'
import { narrate } from './narrate.js'

// Height/footprint are fully random per building, deliberately decoupled
// from repo.height/width. The data-driven version amplified real star
// counts, but repos within a district are stored sorted by stars
// descending and laid out in grid order (see export_city_json.py) -- so
// height still lined up with grid position as a visible gradient (tallest
// at one corner, shortest at the other), reading as "arranged" rather than
// an organic skyline. Pure randomness (seeded per building, so it's still
// reproducible across reloads) breaks that correlation entirely.
const RANDOM_MIN_HEIGHT = 8
const RANDOM_MAX_HEIGHT = 78
// export_city_json.py spaces building centers ASSUMED_MAX_FOOTPRINT(6.5) +
// BUILDING_GAP(3.5) = 10 units apart, and local streets/sidewalks need
// ~1.55 units of clearance on each side of that gap -- so footprints up to
// ~6.9 are safe. The old range (1.5-6.5) let footprint swing all the way
// down to 1.5, so a "small roll" building sat in the same 10-unit cell as
// a "big roll" one and looked lost in a lot of empty pavement. Narrowing
// the range keeps buildings consistently filling their cell (with real
// size variety still visible) instead of leaving that space empty.
const RANDOM_MIN_FOOTPRINT = 4.5
const RANDOM_MAX_FOOTPRINT = 6.5

// Fraction of buildings that render as cylindrical towers instead of
// rectangular ones, for shape variety.
const CYLINDER_SHAPE_CHANCE = 0.22

// Buildings are rendered in small batches, each with its own uniquely
// seeded window texture (see windowTexture.js). A FIXED batch size had to
// be hand-retuned every time the city grew (8 at 503 buildings, then 35 at
// 4180 -- each retuning was a "why did FPS drop" investigation from
// scratch). With a ~30x crawl underway toward ~125,000 buildings, that
// pattern doesn't scale: instead, size batches so the draw-call count
// (not the per-batch size) stays roughly constant -- draw-call overhead is
// what actually costs FPS, not triangle count, so this is the dimension
// worth holding steady. 120 batches held 60fps at both 503 and 4180
// buildings; TOWER_BATCH_COUNT computes the batch size needed to hit that
// same target regardless of how many buildings actually exist.
const TARGET_TOWER_BATCH_COUNT = 120
const MIN_BATCH_SIZE = 8

// Rooftop variety thresholds. NYC Art Deco setbacks + Chongqing spires.
const SPIRE_HEIGHT_PERCENTILE = 0.88
const RECESSED_CAP_CHANCE = 0.22
const SETBACK_CHANCE = 0.38 // mid/tall towers get a stepped setback tier

// Real-world size of a single window pane, in the same world units as
// building height/width. UV repeat is building_dimension / (cells-per-tile
// * this), so a fixed physical window size -- not an arbitrary multiplier --
// drives how many times the texture tiles across each face.
const WINDOW_UNIT_SIZE = 1.2
const MIN_REPEAT = 0.4

// Chongqing valley haze: cool blue-black, dense enough that distant
// districts dissolve into atmosphere like layered mountain city fog.
const NIGHT_FOG_COLOR = 0x070b16

// Live push-event flash: added on top of a building's normal emissive/
// diffuse output (see patchMaterialForInstancing), scaled by each
// instance's own instanceFlash value (1 = just triggered, fading to 0).
const FLASH_EMISSIVE_BOOST = 4.2
const FLASH_DIFFUSE_BOOST = 1.0

const app = document.querySelector('#app')

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x050814)
// Chongqing-style valley haze: denser than before so far towers melt into
// layered fog instead of reading as a flat silhouette wall. Still low
// enough that district tint survives at mid-range.
scene.fog = new THREE.FogExp2(NIGHT_FOG_COLOR, 0.00115)

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  5000,
)
// Placeholder start position; moved to a street-level spot inside the
// city once city.json loads and we know its actual layout.
camera.position.set(0, 5, 0)

// logarithmicDepthBuffer: the city's world coordinates now span thousands
// of units (and keep growing with the ongoing data crawl) while lots of
// surfaces sit stacked only hundredths of a unit apart in Y (park grass/
// shore/lake/trail, road/lane/sidewalk/crosswalk layers). Standard WebGL
// depth buffers concentrate almost all their precision near the camera and
// have very little left at distance, so from far enough away those
// close-together surfaces start fighting for which one wins the depth
// test -- and which one wins shifts slightly every time the camera moves,
// which is exactly what read as parks "distorting"/"vanishing" when
// flying around. A logarithmic depth buffer distributes precision far more
// evenly across the whole camera range, fixing this at the source instead
// of just pushing every surface further apart (which only bought a little
// headroom and doesn't scale as the city keeps growing).
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
// Bloom accumulates HDR light additively; with hundreds of lit windows
// packed into a skyline, that adds up fast. Tone mapping rolls off
// highlights gracefully instead of hard-clipping to a flat white wash,
// and is applied at the composer's final OutputPass, not mid-pipeline.
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.92
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
app.appendChild(renderer.domElement)

const CITY_PIXEL_RATIO = Math.min(window.devicePixelRatio, 2)
const ROADMAP_PIXEL_RATIO = Math.min(window.devicePixelRatio, 2)

// Dark ground plane(s) so buildings sit on something instead of appearing
// to float in pure void. Slightly bluer/darker than the buildings' own
// wall color, close to the fog/background color so it blends rather than
// reading as a hard-edged disc at the horizon.
//
// This used to be a single 20000x20000 plane at y=-0.05 -- just below
// streets/sidewalks (~0.01-0.02) as intended, but also ABOVE the river's
// water surface (y=-3.2, see WATER_Y in cityscape.js). Since it's opaque
// and spans the entire world, from any distant/shallow viewing angle where
// the sightline to the water dipped below y=-0.05 before reaching it, it
// occluded the water completely (the whole river read as solid black
// void). Simply lowering the plane below the water fixed that occlusion
// but broke grounding for anything relying on it (any decorative building
// with no pavement of its own, e.g. the far-shore skyline) -- they ended
// up floating over a visible gap, which right next to the river read as
// "buildings sitting in the water". Building two ground planes instead,
// split at the exact Z range the river's own promenade/garden/water
// surfaces already cover (see groundGapMinZ/MaxZ, computed once city data
// loads and passed back from buildCityscape), fixes both: correct
// grounding everywhere it's actually needed, water visible because
// there's simply no ground plane over it to occlude.
const GROUND_COLOR = 0x060810
const groundMaterial = new THREE.MeshStandardMaterial({
  color: GROUND_COLOR,
  roughness: 1,
  metalness: 0,
})

function buildGroundPlanes(gapMinZ, gapMaxZ) {
  const size = 20000
  for (const centerZ of [gapMinZ - size / 2, gapMaxZ + size / 2]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), groundMaterial)
    plane.rotation.x = -Math.PI / 2
    plane.position.set(0, -0.05, centerZ)
    scene.add(plane)
  }
}

// Night lighting: cool moonlight from above + warm street-level fill so
// facades read as Chongqing/NYC neon canyons instead of flat blue wash.
const ambientLight = new THREE.AmbientLight(0x8a9abb, 0.88)
scene.add(ambientLight)

const hemiLight = new THREE.HemisphereLight(0x1a2848, 0x1a1008, 0.85)
scene.add(hemiLight)

const directionalLight = new THREE.DirectionalLight(0xb8c8ff, 0.95)
directionalLight.position.set(8, 28, 12)
scene.add(directionalLight)

// Soft warm up-light (street / neon bounce) so canyon floors aren't pure black.
const neonBounce = new THREE.DirectionalLight(0xff9a5c, 0.35)
neonBounce.position.set(-4, -2, 6)
scene.add(neonBounce)

/**
 * Flight on/off state for the keyboard-flown plane. Keeps the old
 * lock/unlock event API, but never grabs the pointer — the cursor stays
 * free so topic towers can be clicked straight from the plane.
 */
class FlightControls extends THREE.EventDispatcher {
  constructor() {
    super()
    this.enabled = true
    this.isLocked = false
  }

  lock() {
    if (!this.enabled || this.isLocked) return
    this.isLocked = true
    this.dispatchEvent({ type: 'lock' })
  }

  unlock() {
    if (!this.isLocked) return
    this.isLocked = false
    this.dispatchEvent({ type: 'unlock' })
  }
}

const controls = new FlightControls()

const blocker = document.getElementById('blocker')
const resumeFlightBtn = document.getElementById('resume-flight')
let cityFlightStarted = false

function showTakeoffOverlay({ paused = false } = {}) {
  if (document.body.dataset.appMode !== 'ml') return
  blocker.style.display = 'flex'
  blocker.classList.toggle('flight-paused', paused)
  const title = blocker.querySelector('h1')
  const cta = blocker.querySelector('.cta')
  if (paused) {
    if (title) title.textContent = 'Flight paused'
    if (cta) cta.textContent = 'Click here to resume'
    if (resumeFlightBtn) resumeFlightBtn.hidden = true
  } else {
    if (title) title.textContent = 'Edu City · Board your plane'
    if (cta) cta.textContent = 'Click here to take off'
    if (resumeFlightBtn) resumeFlightBtn.hidden = true
  }
}

function hideFlightOverlays() {
  blocker.style.display = 'none'
  blocker.classList.remove('flight-paused')
  if (resumeFlightBtn) resumeFlightBtn.hidden = true
}

function requestFlightLock() {
  if (document.body.dataset.appMode !== 'ml') return
  if (buildingSidePanel?.isOpen || topicPanel?.isOpen) return
  controls.lock()
}

blocker.addEventListener('click', (event) => {
  if (event.target.closest('.district-launch-btn')) return
  requestFlightLock()
})
resumeFlightBtn?.addEventListener('click', (event) => {
  event.stopPropagation()
  requestFlightLock()
})
controls.addEventListener('lock', () => {
  cityFlightStarted = true
  hideFlightOverlays()
})
controls.addEventListener('unlock', () => {
  if (
    document.body.classList.contains('topic-open') ||
    document.body.classList.contains('side-panel-open') ||
    document.body.classList.contains('picker-open')
  ) {
    hideFlightOverlays()
    return
  }
  if (document.body.dataset.appMode === 'ml') {
    // Esc frees the cursor; keep the city clickable (map, HUD, buildings).
    showTakeoffOverlay({ paused: cityFlightStarted })
  }
})

const move = { forward: false, backward: false, left: false, right: false, up: false, down: false }

document.addEventListener('keydown', (event) => {
  if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return
  switch (event.code) {
    case 'KeyW': case 'ArrowUp': move.forward = true; break
    case 'KeyS': case 'ArrowDown': move.backward = true; break
    case 'KeyA': case 'ArrowLeft': move.left = true; break
    case 'KeyD': case 'ArrowRight': move.right = true; break
    case 'Space': move.up = true; break
    case 'ShiftLeft': case 'ShiftRight': move.down = true; break
  }
})

// A keyup lost to alt-tab or a focused panel would otherwise leave the plane
// flying on its own.
window.addEventListener('blur', () => {
  for (const key of Object.keys(move)) move[key] = false
})

document.addEventListener('keyup', (event) => {
  switch (event.code) {
    case 'KeyW': case 'ArrowUp': move.forward = false; break
    case 'KeyS': case 'ArrowDown': move.backward = false; break
    case 'KeyA': case 'ArrowLeft': move.left = false; break
    case 'KeyD': case 'ArrowRight': move.right = false; break
    case 'Space': move.up = false; break
    case 'ShiftLeft': case 'ShiftRight': move.down = false; break
  }
})

// Post-processing: bloom so lit windows glow softly instead of rendering
// as flat bright squares. Threshold keeps it from blooming the (much
// dimmer) tinted walls or ground -- only genuinely bright pixels (the
// emissive windows) should catch it.
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))

// Started from an initial 0.8/0.4/0.3, but with hundreds of densely packed
// lit windows the additive glow washed out the whole scene into flat white
// blocks, even with tone mapping. Pulled strength/radius down and
// threshold up so only genuinely bright lit-window pixels bloom, and the
// glow stays tight around each window instead of smearing across faces.
// Soft bloom — windows glow gently; no white blast (≈60% weaker than prior)
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.22, // strength (was 0.55)
  0.22, // radius
  0.62, // threshold — only brighter emissives bloom
)
composer.addPass(bloomPass)
composer.addPass(new OutputPass())

function setRoadmapRenderBudget(enabled) {
  // Roadmap: kill shadow maps + bloom — GLB islands dominate GPU cost.
  const dpr = enabled ? ROADMAP_PIXEL_RATIO : CITY_PIXEL_RATIO
  renderer.setPixelRatio(dpr)
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setPixelRatio(dpr)
  composer.setSize(window.innerWidth, window.innerHeight)
  bloomPass.resolution.set(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = !enabled
  bloomPass.enabled = !enabled
}

function setBloomForMode(mode) {
  if (mode === 'roadmap' || mode === 'globe') {
    bloomPass.strength = 0.06
    bloomPass.threshold = 0.85
    setRoadmapRenderBudget(true)
  } else {
    bloomPass.strength = 0.22
    bloomPass.threshold = 0.62
    setRoadmapRenderBudget(false)
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  const dpr = appMode === 'roadmap' || appMode === 'globe' ? ROADMAP_PIXEL_RATIO : CITY_PIXEL_RATIO
  renderer.setPixelRatio(dpr)
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setPixelRatio(dpr)
  composer.setSize(window.innerWidth, window.innerHeight)
  bloomPass.resolution.set(window.innerWidth, window.innerHeight)
})

// Hand-picked palette instead of an evenly-spaced HSL hue wheel: plain HSL
// at one fixed saturation/lightness looks wildly uneven across hues --
// yellows come out pale and near-white while blues/purples come out rich
// and dark at the *same* S/L values (a well-known HSL perceptual-uniformity
// issue). That made roughly a third of districts look untinted even though
// their instance color was being applied correctly. These are tuned by eye
// for roughly consistent vividness. Falls back to HSL generation only if
// there are ever more districts than swatches.
const DISTRICT_PALETTE = [
  '#ff6b4a', '#ff8f3d', '#f0b429', '#7ec850', '#3ecf8e',
  '#2ec4b6', '#3aa0ff', '#5b7cfa', '#8b6cff', '#d45cff',
  '#ff4d8d', '#ff5c5c', '#e8a838', '#4fd1c5', '#63b3ed',
  '#c05621', '#38a169', '#3182ce', '#805ad5', '#d53f8c',
]

// This is multiplied onto the window texture per-instance (via setColorAt
// below) rather than through material.color: material.color is shared by
// every instance on an InstancedMesh, so it can't vary by district -- the
// instance-color attribute is the InstancedMesh equivalent of "multiply
// the map by this color" on a per-building basis.
function buildDistrictColorMap(districts) {
  const sorted = [...districts].sort()
  const colorMap = new Map()
  sorted.forEach((district, i) => {
    const swatch = DISTRICT_PALETTE[i % DISTRICT_PALETTE.length]
    colorMap.set(district, new THREE.Color(swatch))
  })
  return colorMap
}

// Drop the camera at street level right next to the first building, inside
// the city, so flight mode starts somewhere worth exploring instead of a
// bird's-eye view. Looks toward the district's middle.
function placeCameraAtStreetLevel(repos) {
  const first = repos[0]
  const xs = repos.map((repo) => repo.x)
  const zs = repos.map((repo) => repo.z)
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2
  const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1)

  camera.far = Math.max(5000, span * 4)
  camera.updateProjectionMatrix()

  // A bit further back than the district grid spacing itself now that
  // buildings sit closer together -- otherwise the very first frame starts
  // pressed up against a wall of bloom.
  camera.position.set(first.x - 28, 14, first.z + 32)
  camera.lookAt(centerX, 18, centerZ)
}

// Jumps to a specific building -- used by the HUD search box. In a level
// city the plane is parked on the street with its nose toward the tower.
function flyToRepo(repo) {
  if (planeRig?.object.visible) {
    const entry = [...(mlCity?.buildingsById?.values() || [])].find(
      (e) => e.x === repo.x && e.z === repo.z,
    )
    if (entry?.approach) {
      planeRig.placeAt(entry.approach.position, entry.approach.lookAt, mlCity.flightBounds)
    } else {
      flyToPoint(repo.x, repo.z)
    }
    return
  }
  camera.position.set(repo.x - 18, 16, repo.z + 22)
  camera.lookAt(repo.x, 14, repo.z)
}

function flyToPoint(x, z, _label = '') {
  if (planeRig?.object.visible) {
    planeRig.placeAt(
      new THREE.Vector3(x, 40, z + 50),
      new THREE.Vector3(x, 12, z),
      mlCity?.flightBounds,
    )
    return
  }
  camera.position.set(x - 28, 22, z + 36)
  camera.lookAt(x, 12, z)
}

// InstancedMesh shares one geometry/material across every building, so it
// has no built-in way to give each instance its own texture repeat or its
// own temporary "flash" boost. We add two per-instance attributes and patch
// both shader stages to read them:
//   - instanceUvRepeat: window density reflects each building's real
//     height/width (see WINDOW_UNIT_SIZE).
//   - instanceFlash: 0 normally, spiked to 1 by liveFeed.js on a push event
//     and lerped back down over ~1.5s, adding a bright white boost to that
//     one building's emissive glow (so it reliably blooms) and diffuse
//     color (so it's visible even before bloom kicks in).
function patchMaterialForInstancing(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 instanceUvRepeat;
        attribute float instanceFlash;
        varying float vInstanceFlash;`,
      )
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
        vInstanceFlash = instanceFlash;
        `,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vInstanceFlash;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `
        #include <emissivemap_fragment>
        totalEmissiveRadiance += vInstanceFlash * vec3(${FLASH_EMISSIVE_BOOST.toFixed(2)});
        `,
      )
      .replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        diffuseColor.rgb += vInstanceFlash * ${FLASH_DIFFUSE_BOOST.toFixed(2)};
        `,
      )
  }
}

// Sanity check requested: read each batch's actual per-instance Y-scale
// back out of its GPU-bound instanceMatrix buffer (not just the source
// repo data) to confirm every building really did get its own height, not
// a shared or default value.
function logInstanceHeightRange(buildingBatches, totalCount) {
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()

  let min = Infinity
  let max = -Infinity

  for (const batch of buildingBatches) {
    for (let i = 0; i < batch.count; i++) {
      batch.getMatrixAt(i, matrix)
      matrix.decompose(position, quaternion, scale)
      min = Math.min(min, scale.y)
      max = Math.max(max, scale.y)
    }
  }

  console.log(
    `Instance height sanity check -- min Y-scale: ${min.toFixed(3)}, max Y-scale: ${max.toFixed(3)} ` +
      `(read directly from instanceMatrix across ${buildingBatches.length} batches, ${totalCount} instances)`,
  )
}

// Deterministic per-building PRNG (same mulberry32 approach as the window
// textures) so footprint jitter and rooftop-style choice are reproducible
// across reloads instead of reshuffling every render.
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

// The 30x data crawl underway will make city.json a genuinely large
// download (and a genuinely slow JSON.parse + spec computation on top of
// that) -- a blank canvas for several seconds with no feedback reads as
// broken. This overlay covers loadCity() end to end: real byte-progress
// while city.json downloads, then a few coarse checkpoint updates through
// the CPU-bound setup work that follows (that part can't report smooth
// progress without chunking it across frames, which isn't worth the
// complexity for what's normally a one-time few-second wait).
const loadingOverlay = document.getElementById('loading-overlay')
const loadingBarFill = document.getElementById('loading-bar-fill')
const loadingStatus = document.getElementById('loading-status')

function setLoadingProgress(fraction, label) {
  loadingBarFill.style.width = `${Math.round(Math.min(Math.max(fraction, 0), 1) * 100)}%`
  if (label) loadingStatus.textContent = label
}

function hideLoadingOverlay() {
  loadingOverlay.classList.add('hidden')
  if (document.body.dataset.appMode === 'ml') {
    cityFlightStarted = false
    showTakeoffOverlay({ paused: false })
  }
}

function setCityLightsVisible(visible) {
  ambientLight.visible = visible
  hemiLight.visible = visible
  directionalLight.visible = visible
  neonBounce.visible = visible
}

function setCityUiVisible(visible) {
  const hudEl = document.getElementById('hud')
  const mapEl = document.getElementById('map-wrap')
  const compass = document.getElementById('compass-btn')
  const crosshair = document.getElementById('crosshair')
  if (hudEl) hudEl.style.display = visible ? '' : 'none'
  if (crosshair) crosshair.style.display = visible ? '' : 'none'
  if (compass) {
    compass.style.display = visible ? '' : 'none'
    if (visible) compass.classList.remove('is-hidden')
  }
  // Map stays closed until compass is clicked.
  if (mapEl) {
    mapEl.hidden = true
    mapEl.style.display = ''
  }
}

function restoreCityAtmosphere() {
  scene.background = new THREE.Color(0x050814)
  scene.fog = new THREE.FogExp2(NIGHT_FOG_COLOR, 0.00115)
  camera.far = 5000
  camera.updateProjectionMatrix()
  setCityLightsVisible(true)
}

function applySunsetAtmosphere() {
  scene.background = new THREE.Color(0xff9a5c)
  scene.fog = new THREE.FogExp2(0xffb080, 0.00045)
  camera.far = 6000
  camera.updateProjectionMatrix()
  setCityLightsVisible(true)
}

const DEFAULT_LIGHTS = {
  ambient: { color: ambientLight.color.clone(), intensity: ambientLight.intensity },
  hemiSky: hemiLight.color.clone(),
  hemiGround: hemiLight.groundColor.clone(),
  hemiIntensity: hemiLight.intensity,
  sun: { color: directionalLight.color.clone(), intensity: directionalLight.intensity },
  bounce: { color: neonBounce.color.clone(), intensity: neonBounce.intensity },
}
let levelThemeApplied = false

/** Per-level city look: fog + background + light colours from levelThemes.js. */
function applyLevelTheme(theme) {
  if (!theme) {
    applySunsetAtmosphere()
    return
  }
  scene.background = new THREE.Color(theme.fogColor)
  scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity)
  camera.far = 6000
  camera.updateProjectionMatrix()
  ambientLight.color.set(theme.ambient.color)
  ambientLight.intensity = theme.ambient.intensity
  hemiLight.color.set(theme.hemi.sky)
  hemiLight.groundColor.set(theme.hemi.ground)
  hemiLight.intensity = theme.hemi.intensity
  directionalLight.color.set(theme.sun.color)
  directionalLight.intensity = theme.sun.intensity
  neonBounce.color.set(theme.bounce)
  neonBounce.intensity = DEFAULT_LIGHTS.bounce.intensity * 1.4
  setCityLightsVisible(true)
  levelThemeApplied = true
}

function resetLevelTheme() {
  if (!levelThemeApplied) return
  levelThemeApplied = false
  ambientLight.color.copy(DEFAULT_LIGHTS.ambient.color)
  ambientLight.intensity = DEFAULT_LIGHTS.ambient.intensity
  hemiLight.color.copy(DEFAULT_LIGHTS.hemiSky)
  hemiLight.groundColor.copy(DEFAULT_LIGHTS.hemiGround)
  hemiLight.intensity = DEFAULT_LIGHTS.hemiIntensity
  directionalLight.color.copy(DEFAULT_LIGHTS.sun.color)
  directionalLight.intensity = DEFAULT_LIGHTS.sun.intensity
  neonBounce.color.copy(DEFAULT_LIGHTS.bounce.color)
  neonBounce.intensity = DEFAULT_LIGHTS.bounce.intensity
  applySunsetAtmosphere()
}

async function fetchRoadmapPrefs(cityId) {
  try {
    const response = await fetch('/api/roadmap/prefs?city=' + encodeURIComponent(cityId))
    if (!response.ok) throw new Error('Prefs API ' + response.status)
    return await response.json()
  } catch (err) {
    console.warn('[roadmap] prefs unavailable', err)
    return { city: cityId, tutorial_dismissed: false, last_level_id: null }
  }
}

async function saveRoadmapPrefs(cityId, patch) {
  try {
    const response = await fetch('/api/roadmap/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: cityId, ...patch }),
    })
    if (!response.ok) throw new Error('Prefs save ' + response.status)
    return await response.json()
  } catch (err) {
    console.warn('[roadmap] prefs save failed', err)
    return null
  }
}

function setRoadmapTutorialVisible(visible) {
  const el = document.getElementById('roadmap-tutorial')
  if (el) el.hidden = !visible
}

function hideRoadmapTutorial() {
  setRoadmapTutorialVisible(false)
}

let waterfallAudioCtx = null
let waterfallGain = null
let waterfallNodes = []

function stopWaterfallAudio() {
  for (const node of waterfallNodes) {
    try {
      node.stop?.()
      node.disconnect?.()
    } catch {
      /* ignore */
    }
  }
  waterfallNodes = []
  try {
    waterfallGain?.disconnect()
  } catch {
    /* ignore */
  }
  waterfallGain = null
  if (waterfallAudioCtx) {
    waterfallAudioCtx.close().catch(() => {})
    waterfallAudioCtx = null
  }
}

function startWaterfallAudio() {
  stopWaterfallAudio()
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    waterfallAudioCtx = ctx
    const master = ctx.createGain()
    master.gain.value = 0.045
    master.connect(ctx.destination)
    waterfallGain = master

    // Soft filtered noise loop as ambient waterfall
    const seconds = 2
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.55
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 900
    filter.Q.value = 0.6
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.15
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.008
    lfo.connect(lfoGain)
    lfoGain.connect(master.gain)
    src.connect(filter)
    filter.connect(master)
    src.start()
    lfo.start()
    waterfallNodes = [src, lfo, filter]
  } catch (err) {
    console.warn('[audio] waterfall ambient failed', err)
  }
}

async function fetchCityData() {
  const response = await fetch('/city.json')
  const totalBytes = Number(response.headers.get('Content-Length')) || 0

  // Content-Length can be missing (e.g. a dev server sending chunked
  // transfer encoding) -- fall back to an indeterminate wait rather than
  // a progress bar that never moves.
  if (!response.body || !totalBytes) {
    setLoadingProgress(0.25, 'Loading city data…')
    return response.json()
  }

  const reader = response.body.getReader()
  const chunks = []
  let receivedBytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    receivedBytes += value.length
    setLoadingProgress(
      (receivedBytes / totalBytes) * 0.6, // downloading is the first 60% of the bar
      `Loading city data… ${(receivedBytes / 1024 / 1024).toFixed(1)} / ${(totalBytes / 1024 / 1024).toFixed(1)} MB`,
    )
  }
  const text = await new Blob(chunks).text()
  return JSON.parse(text)
}

async function loadCity() {
  // city.json now carries dedicated park-block positions and the exact
  // street geometry alongside the repo list (see export_city_json.py) --
  // parks used to be stamped directly on top of avenue intersections
  // (looked absurd), and roads used to be re-derived in the frontend by
  // clustering scattered building positions into an approximate grid,
  // which didn't match the real block layout and left unpaved gaps. Both
  // are now computed once, exactly, by the same packer that lays out the
  // buildings.
  const { repos, parks, streets } = await fetchCityData()
  setLoadingProgress(0.65, `Preparing ${repos.length.toLocaleString()} buildings…`)

  const districts = new Set(repos.map((repo) => repo.district))
  const colorMap = buildDistrictColorMap(districts)
  hud = createHud({
    repos,
    colorMap,
    camera,
    flyTo: flyToRepo,
    flyToPoint,
  })

  // Precompute every building's final render spec up front: fully random
  // height/footprint/shape, and a per-building PRNG (seeded from its own
  // full_name, so it's reproducible across reloads) for rooftop choice.
  // Needed before batching so the top-10%-by-height threshold and
  // rooftop-variety subsets can be determined across the whole city.
  const specs = repos.map((repo) => {
    const random = mulberry32(hashStringToSeed(repo.full_name))

    const height = RANDOM_MIN_HEIGHT + random() * (RANDOM_MAX_HEIGHT - RANDOM_MIN_HEIGHT)
    const width = RANDOM_MIN_FOOTPRINT + random() * (RANDOM_MAX_FOOTPRINT - RANDOM_MIN_FOOTPRINT)
    const depth = RANDOM_MIN_FOOTPRINT + random() * (RANDOM_MAX_FOOTPRINT - RANDOM_MIN_FOOTPRINT)
    const shape = random() < CYLINDER_SHAPE_CHANCE ? 'cylinder' : 'box'

    return {
      repo,
      height,
      width,
      depth,
      shape,
      rooftopRoll: random(), // consumed below once we know the height threshold
    }
  })

  const sortedHeights = specs.map((s) => s.height).slice().sort((a, b) => a - b)
  const spireHeightThreshold = sortedHeights[Math.floor(sortedHeights.length * SPIRE_HEIGHT_PERCENTILE)]

  const spireSpecs = []
  const capSpecsBox = []
  const capSpecsCylinder = []
  const setbackSpecs = []

  for (const spec of specs) {
    if (spec.height >= spireHeightThreshold) {
      spireSpecs.push(spec)
    } else if (spec.rooftopRoll < RECESSED_CAP_CHANCE) {
      ;(spec.shape === 'cylinder' ? capSpecsCylinder : capSpecsBox).push(spec)
    }
    // NYC Art Deco setbacks on mid/tall box towers -- a second narrower
    // tier stacked on the crown so silhouettes read as stepped canyons.
    if (
      spec.shape === 'box' &&
      spec.height > 28 &&
      spec.rooftopRoll > 0.4 &&
      spec.rooftopRoll < 0.4 + SETBACK_CHANCE
    ) {
      setbackSpecs.push(spec)
    }
  }

  setLoadingProgress(0.75, 'Building the skyline…')

  const dummy = new THREE.Object3D()

  // full_name -> { mesh, localIndex }, so the live feed can find exactly
  // which instance to flash when a push event names a repo.
  const buildingIndex = new Map()

  const batchSize = Math.max(Math.round(specs.length / TARGET_TOWER_BATCH_COUNT), MIN_BATCH_SIZE)

  // Main towers, batched (box-shaped and cylinder-shaped separately, since
  // an InstancedMesh can only hold one geometry) so each small batch gets
  // its own uniquely seeded window texture instead of many buildings
  // sharing one tiled pattern.
  function buildTowerBatches(shapeSpecs, geometryFactory) {
    const tileWorldSize = WINDOW_TILE_CELLS * WINDOW_UNIT_SIZE
    const meshes = []

    for (let batchStart = 0; batchStart < shapeSpecs.length; batchStart += batchSize) {
      const batch = shapeSpecs.slice(batchStart, batchStart + batchSize)
      const seed = hashStringToSeed(batch[0].repo.full_name)
      const { colorTexture, emissiveTexture } = createWindowTextures({ seed })

      const geometry = geometryFactory()
      const material = new THREE.MeshStandardMaterial({
        map: colorTexture,
        emissiveMap: emissiveTexture,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 1.55,
        roughness: 0.72,
        metalness: 0.18,
      })
      patchMaterialForInstancing(material)

      const mesh = new THREE.InstancedMesh(geometry, material, batch.length)
      const uvRepeat = new Float32Array(batch.length * 2)
      const flash = new Float32Array(batch.length) // all zero until a push event fires

      batch.forEach((spec, i) => {
        const { repo, height, width, depth } = spec

        dummy.position.set(repo.x, height / 2, repo.z)
        dummy.scale.set(width, height, depth)
        dummy.updateMatrix()

        mesh.setMatrixAt(i, dummy.matrix)
        mesh.setColorAt(i, colorMap.get(repo.district))

        const footprintForUv = (width + depth) / 2
        uvRepeat[i * 2] = Math.max(footprintForUv / tileWorldSize, MIN_REPEAT)
        uvRepeat[i * 2 + 1] = Math.max(height / tileWorldSize, MIN_REPEAT)

        buildingIndex.set(repo.full_name, { mesh, localIndex: i })
      })

      geometry.setAttribute('instanceUvRepeat', new THREE.InstancedBufferAttribute(uvRepeat, 2))
      geometry.setAttribute('instanceFlash', new THREE.InstancedBufferAttribute(flash, 1))
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

      scene.add(mesh)
      meshes.push(mesh)
    }
    return meshes
  }

  const boxSpecs = specs.filter((s) => s.shape === 'box')
  const cylinderSpecs = specs.filter((s) => s.shape === 'cylinder')
  const buildingBatches = [
    ...buildTowerBatches(boxSpecs, () => new THREE.BoxGeometry(1, 1, 1)),
    ...buildTowerBatches(cylinderSpecs, () => new THREE.CylinderGeometry(0.5, 0.5, 1, 12)),
  ]

  // Rooftop variety: plain (non-window) material, still district-tinted so
  // it reads as part of the same building rather than a foreign object.
  // Dark base color (rather than white) keeps the tint muted -- these read
  // as mechanical/rooftop equipment sections, not glowing solid blocks.
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1e2c, roughness: 0.55, metalness: 0.55 })

  if (spireSpecs.length > 0) {
    const spireGeometry = new THREE.CylinderGeometry(0.06, 0.18, 1, 6)
    const spireMesh = new THREE.InstancedMesh(spireGeometry, roofMaterial.clone(), spireSpecs.length)
    spireSpecs.forEach((spec, i) => {
      const spireHeight = spec.height * (0.15 + spec.rooftopRoll * 0.15)
      dummy.position.set(spec.repo.x, spec.height + spireHeight / 2, spec.repo.z)
      dummy.scale.set(1, spireHeight, 1)
      dummy.updateMatrix()
      spireMesh.setMatrixAt(i, dummy.matrix)
      spireMesh.setColorAt(i, colorMap.get(spec.repo.district))
    })
    spireMesh.instanceMatrix.needsUpdate = true
    if (spireMesh.instanceColor) spireMesh.instanceColor.needsUpdate = true
    scene.add(spireMesh)
  }

  // Recessed roof caps match their parent building's shape (a box cap on a
  // round tower reads as an obvious mismatch), so box and cylinder parents
  // get their own cap InstancedMesh.
  function buildCaps(capSpecs, geometryFactory) {
    if (capSpecs.length === 0) return
    const capMesh = new THREE.InstancedMesh(geometryFactory(), roofMaterial.clone(), capSpecs.length)
    capSpecs.forEach((spec, i) => {
      const capHeight = spec.height * (0.08 + spec.rooftopRoll * 0.08)
      const capWidth = spec.width * 0.65
      const capDepth = spec.depth * 0.65
      dummy.position.set(spec.repo.x, spec.height + capHeight / 2, spec.repo.z)
      dummy.scale.set(capWidth, capHeight, capDepth)
      dummy.updateMatrix()
      capMesh.setMatrixAt(i, dummy.matrix)
      capMesh.setColorAt(i, colorMap.get(spec.repo.district))
    })
    capMesh.instanceMatrix.needsUpdate = true
    if (capMesh.instanceColor) capMesh.instanceColor.needsUpdate = true
    scene.add(capMesh)
  }

  buildCaps(capSpecsBox, () => new THREE.BoxGeometry(1, 1, 1))
  buildCaps(capSpecsCylinder, () => new THREE.CylinderGeometry(0.5, 0.5, 1, 10))

  // Art Deco setback tiers — same windowed material family as the towers,
  // slightly brighter so the crown reads against fog.
  if (setbackSpecs.length > 0) {
    const setbackBatchSize = Math.max(Math.round(setbackSpecs.length / 24), MIN_BATCH_SIZE)
    for (let start = 0; start < setbackSpecs.length; start += setbackBatchSize) {
      const batch = setbackSpecs.slice(start, start + setbackBatchSize)
      const seed = hashStringToSeed(`setback:${batch[0].repo.full_name}`)
      const { colorTexture, emissiveTexture } = createWindowTextures({ seed, minLitRatio: 0.28, maxLitRatio: 0.45 })
      const material = new THREE.MeshStandardMaterial({
        map: colorTexture,
        emissiveMap: emissiveTexture,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 1.7,
        roughness: 0.65,
        metalness: 0.25,
      })
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, batch.length)
      batch.forEach((spec, i) => {
        const tierH = spec.height * (0.18 + spec.rooftopRoll * 0.12)
        const tierW = spec.width * 0.72
        const tierD = spec.depth * 0.72
        dummy.position.set(spec.repo.x, spec.height + tierH / 2, spec.repo.z)
        dummy.scale.set(tierW, tierH, tierD)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        mesh.setColorAt(i, colorMap.get(spec.repo.district))
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      scene.add(mesh)
    }
  }

  setLoadingProgress(0.9, 'Placing streets, trees & parks…')
  placeCameraAtStreetLevel(repos)
  logInstanceHeightRange(buildingBatches, repos.length)

  console.log(
    `Rendered ${repos.length} buildings (${boxSpecs.length} box, ${cylinderSpecs.length} cylinder) across ` +
      `${districts.size} districts in ${buildingBatches.length} batches (~${batchSize}/batch, each with its ` +
      `own window texture). ${spireSpecs.length} spires, ${capSpecsBox.length + capSpecsCylinder.length} recessed caps, ` +
      `${setbackSpecs.length} Art Deco setbacks.`,
  )

  liveFeed = createLiveFeed(buildingIndex, hud.recordPush)
  cityscape = buildCityscape(scene, repos, parks, streets)
  buildGroundPlanes(cityscape.groundGapMinZ, cityscape.groundGapMaxZ)
  // Set up once everything (buildings + cityscape) is in the scene, so it
  // sees every static InstancedMesh there is to cull, not just buildings.
  cullController = setupDistanceCulling(scene, camera, scene.fog.density)

  setLoadingProgress(1, 'Done')
  hideLoadingOverlay()
}

async function fetchCityProgress(cityId) {
  const response = await fetch(`/api/progress/${encodeURIComponent(cityId)}`)
  if (!response.ok) throw new Error(`Progress API ${response.status}`)
  const data = await response.json()
  return data.progress || []
}

async function fetchCityTopics(cityId) {
  const response = await fetch('/api/topics?city=' + encodeURIComponent(cityId))
  if (!response.ok) throw new Error('Topics API ' + response.status)
  const data = await response.json()
  if (data.error) throw new Error(data.error)
  return data
}

async function fetchCityLevels(cityId) {
  const response = await fetch('/api/levels?city=' + encodeURIComponent(cityId))
  if (!response.ok) throw new Error('Levels API ' + response.status)
  const data = await response.json()
  if (data.error) throw new Error(data.error)
  return data
}

function setBackToIslandsVisible(visible) {
  const btn = document.getElementById('back-to-islands')
  if (btn) btn.hidden = !visible
}

function setRoadmapHintVisible(visible) {
  const el = document.getElementById('roadmap-hint')
  if (el) el.hidden = !visible
  const tip = document.getElementById('roadmap-orbit-tip')
  if (tip) tip.hidden = !visible
  const scroller = document.getElementById('roadmap-scroller')
  if (scroller) scroller.hidden = !visible
}

function disposeRoadmapOrbit() {
  roadmapDragging = false
  roadmapPointerDown = null
  roadmapTween = null
  // Hand canvas input back to the plane for city flight.
  controls.enabled = true
}

/** Manual roadmap camera — raw mouse events, no Three.js control helpers. */
const ROADMAP_ROTATE_SPEED = 0.003 // radians per pixel
const ROADMAP_ZOOM_PER_TICK = 0.18 // fraction of radius per wheel notch
const ROADMAP_MIN_DIST = 35
const ROADMAP_MAX_DIST = 1800
const roadmapCamTarget = new THREE.Vector3()
const roadmapSpherical = new THREE.Spherical()
const roadmapOffset = new THREE.Vector3()
let roadmapDragging = false
let roadmapLastX = 0
let roadmapLastY = 0
let roadmapPointerDown = null

function syncRoadmapSphericalFromCamera() {
  roadmapOffset.copy(camera.position).sub(roadmapCamTarget)
  roadmapSpherical.setFromVector3(roadmapOffset)
}

function applyRoadmapCamera() {
  roadmapSpherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, roadmapSpherical.phi))
  roadmapSpherical.radius = Math.max(
    ROADMAP_MIN_DIST,
    Math.min(ROADMAP_MAX_DIST, roadmapSpherical.radius),
  )
  roadmapOffset.setFromSpherical(roadmapSpherical)
  camera.position.copy(roadmapCamTarget).add(roadmapOffset)
  camera.lookAt(roadmapCamTarget)
}

function enableRoadmapCamera(target) {
  roadmapCamTarget.copy(target)
  syncRoadmapSphericalFromCamera()
  applyRoadmapCamera()
  controls.enabled = false
  if (controls.isLocked) controls.unlock()
  renderer.domElement.style.cursor = 'grab'
}

function onRoadmapPointerDown(event) {
  if (appMode !== 'roadmap') return
  // Accept clicks from overlays that sit over the canvas (hint is pointer-events:none,
  // but some browsers still report a non-canvas target for captured events).
  if (event.button !== 0) return
  if (event.target?.closest?.('#district-picker, #hud, #blocker, .side-panel, #topic-panel, button, a, input')) {
    return
  }
  roadmapDragging = true
  roadmapTween = null
  roadmapLastX = event.clientX
  roadmapLastY = event.clientY
  roadmapPointerDown = { x: event.clientX, y: event.clientY }
  hideIslandTooltip()
  hideCareerTip()
  renderer.domElement.style.cursor = 'grabbing'
  try {
    renderer.domElement.setPointerCapture(event.pointerId)
  } catch {
    /* ignore */
  }
}

function onRoadmapPointerMove(event) {
  if (appMode !== 'roadmap') return
  if (!roadmapDragging) {
    if (event.target?.closest?.('#district-picker, #hud, #blocker, .side-panel, #topic-panel, button, a, input')) {
      hideCareerTip()
    } else {
      roadmapHoverPointer = { x: event.clientX, y: event.clientY }
    }
    return
  }
  const dx = event.clientX - roadmapLastX
  const dy = event.clientY - roadmapLastY
  roadmapLastX = event.clientX
  roadmapLastY = event.clientY
  // 1:1 — apply immediately, no damping / momentum
  roadmapSpherical.theta -= dx * ROADMAP_ROTATE_SPEED
  roadmapSpherical.phi -= dy * ROADMAP_ROTATE_SPEED
  applyRoadmapCamera()
}

function onRoadmapPointerUp(event) {
  if (appMode !== 'roadmap') return
  const wasDragging = roadmapDragging
  roadmapDragging = false
  renderer.domElement.style.cursor = 'grab'
  try {
    renderer.domElement.releasePointerCapture(event.pointerId)
  } catch {
    /* ignore */
  }
  if (!wasDragging || !roadmapPointerDown) return

  const dx = event.clientX - roadmapPointerDown.x
  const dy = event.clientY - roadmapPointerDown.y
  roadmapPointerDown = null
  // Short click (not a drag) → pick island
  if (Math.hypot(dx, dy) > 6) return

  cityPointer.x = (event.clientX / window.innerWidth) * 2 - 1
  cityPointer.y = -(event.clientY / window.innerHeight) * 2 + 1
  cityRaycaster.setFromCamera(cityPointer, camera)
  const hit = islandRoadmap?.pick(cityRaycaster)
  if (!hit) {
    hideIslandTooltip()
    return
  }
  if (hit.locked) {
    const prev = Math.max(1, (hit.level.level || 1) - 1)
    showIslandTooltip(`Complete Level ${prev} to unlock`, event.clientX, event.clientY)
    return
  }
  hideIslandTooltip()
  enterLevelFromRoadmap(hit.level)
}

/** Dev/test helper: pick island under NDC coords (or screen center). */
window.__clusterPickRoadmap = (nx = 0, ny = 0) => {
  cityPointer.set(nx, ny)
  cityRaycaster.setFromCamera(cityPointer, camera)
  const hit = islandRoadmap?.pick(cityRaycaster)
  return hit
    ? { name: hit.level?.name, level: hit.level?.level, locked: hit.locked, state: hit.state }
    : null
}

window.__clusterRoadmapDebug = () => {
  const entries = islandRoadmap?.islandEntries || []
  const clickables = islandRoadmap?.clickables || []
  const first = entries[0]
  let aimed = null
  if (first) {
    const world = new THREE.Vector3(first.off.x, first.y + 8, first.off.z)
    const ndc = world.clone().project(camera)
    cityPointer.set(ndc.x, ndc.y)
    cityRaycaster.setFromCamera(cityPointer, camera)
    aimed = {
      ndc: { x: ndc.x, y: ndc.y, z: ndc.z },
      hit: (() => {
        const h = islandRoadmap.pick(cityRaycaster)
        return h ? { name: h.level?.name, locked: h.locked, state: h.state } : null
      })(),
      rawHits: cityRaycaster.intersectObjects(clickables, true).slice(0, 5).map((h) => ({
        name: h.object?.name,
        kind: h.object?.userData?.kind,
        instanceId: h.instanceId,
        dist: h.distance,
        type: h.object?.type,
      })),
    }
  }
  return {
    mode: appMode,
    clickableCount: clickables.length,
    islandCount: entries.length,
    levels: islandRoadmap?.levels?.map((l) => ({ id: l.id, name: l.name, state: l.state })),
    cam: { x: camera.position.x, y: camera.position.y, z: camera.position.z, radius: roadmapSpherical.radius },
    aimed,
  }
}

if (import.meta.env.DEV) {
  // Preview any level's city theme, even locked ones. Restores last_level_id afterwards.
  window.__clusterPreviewLevel = async (n) => {
    const entry = islandRoadmap?.islandEntries?.find((e) => e.level.level === n)
    if (!entry) return 'open a subject roadmap first'
    const { last_level_id } = await fetchRoadmapPrefs(activeCityId)
    appMode = 'ml'
    document.body.dataset.appMode = 'ml'
    setBloomForMode('ml')
    await loadLevelCity(activeCityId, entry.level)
    // The city's own save isn't awaited and can land late; restore until it sticks.
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, 1000))
      await saveRoadmapPrefs(activeCityId, { last_level_id })
      if ((await fetchRoadmapPrefs(activeCityId)).last_level_id === last_level_id) break
    }
    return mlCity?.theme?.name
  }
  window.__clusterScene = scene
  window.__clusterOpenTopic = (i = 0) => {
    const id = [...(mlCity?.buildingsById?.keys() || [])][i]
    openBuildingTopic(id)
    return id || null
  }
  // Orbit the roadmap camera around one island (keeps the current viewing angle).
  window.__clusterRoadmapFocus = (n, dist = 120) => {
    const entry = islandRoadmap?.islandEntries?.find((e) => e.level.level === n)
    if (!entry) return false
    roadmapCamTarget.set(entry.off.x, entry.y + 6, entry.off.z)
    roadmapSpherical.radius = dist
    applyRoadmapCamera()
    return true
  }
}

window.__clusterCityDebug = () => {
  if (!mlCity) return null
  const dir = new THREE.Vector3()
  camera.getWorldDirection(dir)
  const r = (v) => Math.round(v * 10) / 10
  return {
    cam: { x: r(camera.position.x), y: r(camera.position.y), z: r(camera.position.z) },
    dir: { x: r(dir.x), y: r(dir.y), z: r(dir.z) },
    plane: planeRig && {
      x: r(planeRig.position.x),
      y: r(planeRig.position.y),
      z: r(planeRig.position.z),
      view: planeRig.view,
      flying: controls.isLocked,
    },
    buildings: [...mlCity.buildingsById.entries()].map(([id, e]) => {
      const world = new THREE.Vector3()
      e.mesh.getWorldPosition(world)
      let visible = true
      e.mesh.traverseAncestors((a) => { if (!a.visible) visible = false })
      return {
        id,
        name: e.topic?.name,
        x: r(world.x), y: r(world.y), z: r(world.z),
        height: r(e.height),
        visible: visible && e.mesh.visible,
        inScene: Boolean(e.mesh.parent),
        dist: r(camera.position.distanceTo(world)),
      }
    }),
  }
}

function onRoadmapWheel(event) {
  if (appMode === 'ml') {
    onCityAltitudeWheel(event)
    return
  }
  if (appMode !== 'roadmap') return
  if (event.target?.closest?.('#district-picker, #hud, #blocker, .side-panel, #topic-panel, input, textarea')) {
    return
  }
  event.preventDefault()
  // Ctrl+wheel (also trackpad pinch) zooms; plain wheel scrolls through the levels.
  if (event.ctrlKey) {
    zoomRoadmapBy(Math.sign(event.deltaY))
    return
  }
  let dy = event.deltaY
  if (event.deltaMode === 1) dy *= 16
  else if (event.deltaMode === 2) dy *= window.innerHeight
  const zoomFactor = THREE.MathUtils.clamp(roadmapSpherical.radius / ROADMAP_FOCUS_RADIUS, 0.5, 1.5)
  const speed = ROADMAP_SCROLL_PER_PIXEL * zoomFactor
  scrollRoadmapBy(-dy * speed)
}

const ROADMAP_SCROLL_PER_PIXEL = 0.18 // world units per wheel pixel at focus distance
const ROADMAP_FOCUS_RADIUS = 280 // camera distance when jumping to a level
const ROADMAP_FOCUS_LIFT = 6 // aim a little above the island surface
let roadmapTween = null
let roadmapScrollerIndex = -1

function zoomRoadmapBy(tick) {
  if (!tick) return
  roadmapTween = null
  roadmapSpherical.radius *= 1 + tick * ROADMAP_ZOOM_PER_TICK
  applyRoadmapCamera()
}

function roadmapLevelFocusYs() {
  return (islandRoadmap?.islandEntries || []).map((e) => e.y + ROADMAP_FOCUS_LIFT)
}

function scrollRoadmapBy(dy) {
  const ys = roadmapLevelFocusYs()
  if (!ys.length) return
  roadmapTween = null
  roadmapCamTarget.y = Math.max(ys[0] - 10, Math.min(ys[ys.length - 1] + 10, roadmapCamTarget.y + dy))
  applyRoadmapCamera()
  updateRoadmapScroller()
}

function currentRoadmapLevelIndex() {
  const ys = roadmapLevelFocusYs()
  let best = 0
  let bestD = Infinity
  ys.forEach((y, i) => {
    const d = Math.abs(y - roadmapCamTarget.y)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

function focusRoadmapLevel(index) {
  const ys = roadmapLevelFocusYs()
  if (!ys.length) return
  const i = Math.max(0, Math.min(ys.length - 1, index))
  roadmapTween = {
    fromY: roadmapCamTarget.y,
    toY: ys[i],
    fromR: roadmapSpherical.radius,
    toR: Math.min(roadmapSpherical.radius, ROADMAP_FOCUS_RADIUS),
    t0: performance.now(),
    dur: 450,
  }
}

function stepRoadmapTween(now) {
  if (!roadmapTween) return
  const t = roadmapTween
  const u = Math.min((now - t.t0) / t.dur, 1)
  const s = u * u * (3 - 2 * u)
  roadmapCamTarget.y = t.fromY + (t.toY - t.fromY) * s
  roadmapSpherical.radius = t.fromR + (t.toR - t.fromR) * s
  applyRoadmapCamera()
  updateRoadmapScroller()
  if (u >= 1) roadmapTween = null
}

function buildRoadmapScroller() {
  const dotsEl = document.getElementById('roadmap-level-dots')
  if (!dotsEl) return
  dotsEl.innerHTML = ''
  const entries = islandRoadmap?.islandEntries || []
  // Top of the bar = highest level, matching the tower.
  for (let i = entries.length - 1; i >= 0; i--) {
    const { level } = entries[i]
    const dot = document.createElement('button')
    dot.type = 'button'
    dot.className = `rl-dot rl-${level.state || 'locked'}`
    dot.dataset.index = String(i)
    dot.title = `Level ${level.level}: ${level.name}`
    dot.setAttribute('aria-label', dot.title)
    dot.addEventListener('click', () => focusRoadmapLevel(i))
    dotsEl.appendChild(dot)
  }
  roadmapScrollerIndex = -1
  updateRoadmapScroller()
}

function updateRoadmapScroller() {
  const entries = islandRoadmap?.islandEntries || []
  if (!entries.length) return
  const i = currentRoadmapLevelIndex()
  if (i === roadmapScrollerIndex) return
  roadmapScrollerIndex = i
  const level = entries[i].level
  const num = document.querySelector('#roadmap-level-label .rl-num')
  const name = document.querySelector('#roadmap-level-label .rl-name')
  if (num) num.textContent = `Level ${level.level}`
  if (name) name.textContent = level.name
  document.querySelectorAll('#roadmap-level-dots .rl-dot').forEach((dot) => {
    dot.classList.toggle('is-active', Number(dot.dataset.index) === i)
  })
  const up = document.getElementById('roadmap-level-up')
  const down = document.getElementById('roadmap-level-down')
  if (up) up.disabled = i >= entries.length - 1
  if (down) down.disabled = i <= 0
}

document.getElementById('roadmap-level-up')?.addEventListener('click', () => {
  focusRoadmapLevel(currentRoadmapLevelIndex() + 1)
})
document.getElementById('roadmap-level-down')?.addEventListener('click', () => {
  focusRoadmapLevel(currentRoadmapLevelIndex() - 1)
})

document.addEventListener('keydown', (event) => {
  if (appMode !== 'roadmap') return
  if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return
  const last = (islandRoadmap?.islandEntries?.length || 1) - 1
  const cur = currentRoadmapLevelIndex()
  let handled = true
  switch (event.code) {
    case 'ArrowUp':
    case 'PageUp':
      focusRoadmapLevel(cur + 1)
      break
    case 'ArrowDown':
    case 'PageDown':
      focusRoadmapLevel(cur - 1)
      break
    case 'Home':
      focusRoadmapLevel(0)
      break
    case 'End':
      focusRoadmapLevel(last)
      break
    case 'Equal':
    case 'NumpadAdd':
      zoomRoadmapBy(-1)
      break
    case 'Minus':
    case 'NumpadSubtract':
      zoomRoadmapBy(1)
      break
    default:
      handled = false
  }
  if (handled) event.preventDefault()
})

const CITY_SCROLL_ALTITUDE = 9 // units per wheel notch

function onCityAltitudeWheel(event) {
  // Don't steal scroll from HUD / search / side panels
  if (event.target !== renderer.domElement && !renderer.domElement.contains(event.target)) {
    if (event.target?.closest?.('#hud, #blocker, .side-panel, #topic-panel')) return
  }
  event.preventDefault()
  const tick = Math.sign(event.deltaY)
  if (!tick) return
  // Scroll up → climb · scroll down → descend
  if (planeRig?.object.visible) {
    planeRig.nudgeAltitude(-tick * CITY_SCROLL_ALTITUDE, mlCity?.flightBounds)
    return
  }
  camera.position.y -= tick * CITY_SCROLL_ALTITUDE
  const b = mlCity?.flightBounds
  if (b) {
    camera.position.y = Math.min(b.maxY, Math.max(b.minY, camera.position.y))
  } else {
    camera.position.y = Math.min(220, Math.max(4, camera.position.y))
  }
}

function hideIslandTooltip() {
  const tip = document.getElementById('island-tooltip')
  if (tip) tip.hidden = true
}

function showIslandTooltip(message, clientX, clientY) {
  const tip = document.getElementById('island-tooltip')
  if (!tip) return
  tip.textContent = message
  tip.hidden = false
  tip.style.left = `${clientX}px`
  tip.style.top = `${clientY}px`
}

const careerTipEl = document.getElementById('island-career-tip')
const careerTipAnchor = new THREE.Vector3()
const careerTipScale = new THREE.Vector3()
let roadmapHoverPointer = null
let careerTipEntry = null

function hideCareerTip() {
  roadmapHoverPointer = null
  careerTipEntry = null
  if (careerTipEl) careerTipEl.hidden = true
}

/** Hover tooltip under the island label: "Leads to: … · Avg salary $…". */
function updateRoadmapCareerTip() {
  if (!careerTipEl) return
  if (roadmapHoverPointer) {
    const { x, y } = roadmapHoverPointer
    roadmapHoverPointer = null
    cityPointer.x = (x / window.innerWidth) * 2 - 1
    cityPointer.y = -(y / window.innerHeight) * 2 + 1
    cityRaycaster.setFromCamera(cityPointer, camera)
    const hit = islandRoadmap?.pick(cityRaycaster)
    const entry = hit && islandRoadmap.islandEntries.find((e) => e.level.id === hit.level.id)
    const data = getCachedCareerOutcomes(activeCityId)
    if (!entry?.island?.userData?.levelLabel || !data) {
      hideCareerTip()
      return
    }
    if (entry !== careerTipEntry) {
      careerTipEntry = entry
      const titles = (data.top_job_titles || []).slice(0, 2).join(', ')
      careerTipEl.textContent = `Leads to: ${titles} · Avg salary ${formatSalary(data.avg_first_salary)}`
    }
  }
  if (!careerTipEntry) return

  const label = careerTipEntry.island.userData.levelLabel
  label.getWorldPosition(careerTipAnchor)
  label.getWorldScale(careerTipScale)
  careerTipAnchor.y -= careerTipScale.y * 0.5
  careerTipAnchor.project(camera)
  if (careerTipAnchor.z > 1) {
    careerTipEl.hidden = true
    return
  }
  careerTipEl.style.left = `${((careerTipAnchor.x + 1) / 2) * window.innerWidth}px`
  careerTipEl.style.top = `${((1 - careerTipAnchor.y) / 2) * window.innerHeight}px`
  careerTipEl.hidden = false
}

function disposeIslandRoadmap() {
  disposeRoadmapOrbit()
  hideIslandTooltip()
  hideCareerTip()
  hideRoadmapTutorial()
  islandRoadmap?.dispose?.()
  islandRoadmap = null
}

function disposeMlCity() {
  if (mlCity?.root) scene.remove(mlCity.root)
  mlCity?.dispose?.()
  mlCity = null
  resetLevelTheme()
}

async function loadIslandRoadmap(cityId) {
  const cityLabel = CITY_LABELS[cityId] || cityId
  setLoadingProgress(0.05, 'Building your world…')
  loadingOverlay.classList.remove('hidden')
  stopWaterfallAudio()
  hideRoadmapTutorial()
  fetchCareerOutcomes(cityId)

  let kenneyAssets = null
  try {
    kenneyAssets = await loadKenneyAssets((fraction, label) => {
      setLoadingProgress(0.05 + fraction * 0.35, label || 'Building your world…')
    })
  } catch (err) {
    console.warn('[roadmap] Kenney assets unavailable, using procedural fallback', err)
  }

  let islandModels = []
  try {
    islandModels = await loadIslandModels((fraction, label) => {
      setLoadingProgress(0.4 + fraction * 0.15, label || 'Loading island models…')
    })
  } catch (err) {
    console.warn('[roadmap] Island GLBs unavailable, using procedural islands', err)
  }

  setLoadingProgress(0.55, 'Loading ' + cityLabel + ' islands…')

  let payload = { levels: [], label: cityLabel, accent: DISTRICT_ACCENTS[cityId] }
  try {
    payload = await fetchCityLevels(cityId)
  } catch (err) {
    console.warn('[roadmap] levels API unavailable', err)
  }

  const prefs = await fetchRoadmapPrefs(cityId)
  const focusLevelId = prefs.last_level_id || null

  setLoadingProgress(0.7, 'Building island stack…')
  disposeMlCity()
  disposeIslandRoadmap()
  planeRig?.hide()
  setCityUiVisible(false)
  setBackToIslandsVisible(false)
  hideFlightOverlays()

  activeCityId = cityId
  activeLevel = null
  const forceCloneIslands =
    new URLSearchParams(window.location.search).get('islands') === 'clone'
  islandRoadmap = createIslandRoadmap(scene, {
    cityId,
    cityLabel: payload.label || cityLabel,
    accent: payload.accent || DISTRICT_ACCENTS[cityId] || '#3de7ff',
    levels: payload.levels || [],
    lastLevelId: focusLevelId,
    assets: kenneyAssets,
    islandModels,
    forceCloneIslands,
  })
  window.__clusterIslandMode = forceCloneIslands ? 'clone' : 'instanced'

  applySunsetAtmosphere()
  setBloomForMode('roadmap')

  const pose = islandRoadmap.cameraStartPose(focusLevelId)
  camera.position.copy(pose.position)
  camera.lookAt(pose.lookAt)

  disposeRoadmapOrbit()
  enableRoadmapCamera(pose.target || pose.lookAt)
  buildRoadmapScroller()

  setCityLightsVisible(true)
  setRoadmapHintVisible(true)
  renderer.domElement.style.cursor = 'grab'
  const hintTitle = document.querySelector('#roadmap-hint .roadmap-title')
  if (hintTitle) hintTitle.textContent = (CITY_LABELS[cityId] || cityId) + ' Roadmap'
  const hintTip = document.getElementById('roadmap-orbit-tip')
  if (hintTip) hintTip.hidden = false
  setLoadingProgress(1, 'Roadmap ready')
  hideLoadingOverlay()
  loadingOverlay.classList.add('hidden')

  if (!prefs.tutorial_dismissed) {
    setRoadmapTutorialVisible(true)
  }
}

async function loadLevelCity(cityId, level) {
  const cityLabel = CITY_LABELS[cityId] || cityId
  const levelLabel = 'Level ' + level.level + ': ' + level.name
  setLoadingProgress(0.12, 'Entering ' + levelLabel + '…')
  setRoadmapHintVisible(false)
  hideRoadmapTutorial()
  renderer.domElement.style.cursor = ''

  let progress = []
  try {
    progress = await fetchCityProgress(cityId)
  } catch (err) {
    console.warn('[level city] progress unavailable', err)
  }

  const topics = topicsForLevel(cityId, level)
  setLoadingProgress(0.45, 'Building level streets…')

  if (islandRoadmap) islandRoadmap.hide()
  disposeMlCity()

  try {
    await document.fonts?.load('700 64px "Bebas Neue"')
  } catch {
    /* canvas falls back to Sora */
  }

  mlCity = buildEduCity(scene, {
    cityId,
    cityLabel: cityLabel + ' · ' + levelLabel,
    streets: ['Level ' + level.level + ' Street', level.name + ' Ave'],
    topics,
    accent: DISTRICT_ACCENTS[cityId] || '#3de7ff',
    progress,
    includePark: false,
    levelId: level.id,
  })
  activeCityId = cityId
  activeLevel = level
  mlProgressByBuilding = new Map(progress.map((p) => [p.building_id, p]))

  void saveRoadmapPrefs(cityId, { last_level_id: level.id })

  const streetNames = new Set(mlCity.reposForHud.map((r) => r.district))
  const colorMap = buildDistrictColorMap(streetNames)
  hud = createHud({
    repos: mlCity.reposForHud,
    colorMap,
    camera,
    player: planeRig,
    flyTo: flyToRepo,
    flyToPoint,
    mode: 'ml',
    mapLayout: mlCity.mapLayout,
    growthInfo: growthStatsFromProgress(progress, mlCity.totalBuildings, mlCity.buildingsById),
  })

  const brand = document.querySelector('#hud-title')
  if (brand) brand.textContent = levelLabel.toUpperCase()
  const mapLabel = document.getElementById('map-label')
  if (mapLabel) mapLabel.textContent = levelLabel.toUpperCase() + ' · click to fly'
  const search = document.getElementById('hud-search-input')
  if (search) search.placeholder = 'Fly to a subtopic…'
  const location = document.getElementById('hud-location')
  if (location) {
    const stats = growthStatsFromProgress(progress, mlCity.totalBuildings, mlCity.buildingsById)
    location.textContent =
      'Level tower · ' +
      stats.completed +
      '/' +
      stats.totalBuildings +
      ' quizzes · milestone ' +
      stats.milestone +
      '%'
  }

  applyLevelTheme(mlCity.theme)
  const spawn = mlCity.spawnPose
  planeRig?.show()
  planeRig?.placeAt(
    spawn?.position || new THREE.Vector3(0, 40, 140),
    spawn?.lookAt || new THREE.Vector3(0, 16, 0),
    mlCity.flightBounds,
  )
  // Hide subject-globe chrome while flying the level city
  const globeHint = document.getElementById('globe-hint')
  if (globeHint) globeHint.hidden = true

  setBloomForMode('ml')
  cullController = setupDistanceCulling(scene, camera, scene.fog?.density || 0.00045)
  setCityUiVisible(true)
  setBackToIslandsVisible(true)
  startWaterfallAudio()
  setLoadingProgress(1, levelLabel + ' ready')
  hideLoadingOverlay()
  narrate(`Welcome to Level ${level.level}: ${level.name}`)
}

function openBuildingTopic(buildingId) {
  if (!buildingId || buildingSidePanel?.isOpen) return
  const entry = mlCity?.buildingsById?.get(buildingId)
  if (!entry) return
  if (controls.isLocked) controls.unlock()
  hideFlightOverlays()
  const topicName = entry.topic?.name || entry.building?.name || buildingId
  narrate(`Exploring: ${topicName}`)
  buildingSidePanel.open({
    id: buildingId,
    name: topicName,
    streetName: entry.street?.name || '',
    cityId: activeCityId || mlCity?.cityId || 'ml',
    cityLabel: mlCity?.cityLabel || CITY_LABELS[activeCityId] || activeCityId,
    topic: entry.topic,
  })
}

function refreshGrowthHud(progressList) {
  if (!mlCity) return
  mlCity.applyProgress(progressList)
  const stats = growthStatsFromProgress(
    progressList,
    mlCity.totalBuildings,
    mlCity.buildingsById,
  )
  hud?.setGrowthInfo?.(stats)
  const location = document.getElementById('hud-location')
  if (location) {
    location.textContent =
      'Level tower · ' +
      stats.completed +
      '/' +
      stats.totalBuildings +
      ' quizzes · milestone ' +
      stats.milestone +
      '%'
  }
}

// Runtime scene state
let liveFeed = null
let cityscape = null
let cullController = null
let hud = null
let subjectGlobe = null
let mlCity = null
let islandRoadmap = null
let districtPicker = null
let topicPanel = null
let buildingSidePanel = null
let planeRig = null
let mlProgressByBuilding = new Map()
let activeCityId = 'ml'
let activeLevel = null
let appMode = 'globe' // 'globe' | 'picker' | 'roadmap' | 'ml'
let mlCityLoaded = false
let escArmedForBack = false
let roadmapSelecting = false

const DISTRICT_ACCENTS = {
  ml: '#3de7ff',
  ai: '#a78bfa',
  programming: '#ffb347',
  web: '#34d399',
}

const nearPrompt = document.getElementById('near-prompt')
let targetBuildingId = null
const aimRaycaster = new THREE.Raycaster()
aimRaycaster.far = 150
const SCREEN_CENTER = new THREE.Vector2(0, 0)
const cityRaycaster = new THREE.Raycaster()
const cityPointer = new THREE.Vector2()

planeRig = createPlaneRig(scene, camera)

buildingSidePanel = createBuildingSidePanel({
  getThemeColor: () => mlCity?.theme?.windowGlow?.[0] || null,
  async onQuizComplete(data) {
    if (data?.building_id) {
      mlProgressByBuilding.set(data.building_id, data)
    }
    try {
      const list = await fetchCityProgress(activeCityId)
      mlProgressByBuilding = new Map(list.map((p) => [p.building_id, p]))
      refreshGrowthHud(list)
    } catch {
      refreshGrowthHud([...mlProgressByBuilding.values()])
    }
    narrate('Well done! Your tower has grown.')
    if (data?.level?.completed) {
      narrate('New level unlocked. Keep going!')
    }
  },
  onClose() {
    if (appMode === 'ml') {
      showTakeoffOverlay({ paused: true })
      escArmedForBack = true
    }
  },
})

// Quiz/lecture panel kept intact for progress APIs; building click uses side panel.
topicPanel = createTopicPanel({
  async onSubtopicProgress(buildingId, subtopicsDone) {
    const response = await fetch(`/api/progress/ml/${buildingId}/subtopic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subtopics_done: subtopicsDone }),
    })
    const data = await response.json()
    if (data.error) return data
    mlProgressByBuilding.set(buildingId, data)
    return data
  },
  async onQuizSubmit(buildingId, answers) {
    const response = await fetch(`/api/progress/ml/${buildingId}/quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    })
    const data = await response.json()
    if (data.error) return data
    mlProgressByBuilding.set(buildingId, data)
    const list = [...mlProgressByBuilding.values()]
    refreshGrowthHud(list)
    return data
  },
  onClose() {
    if (appMode === 'ml') {
      showTakeoffOverlay({ paused: true })
      escArmedForBack = true
    }
  },
})

districtPicker = createDistrictPicker({
  onSelectDistrict(districtId) {
    if (!CITY_LABELS[districtId]) return
    enterCityRoadmap(districtId)
  },
  onBack() {
    returnToGlobe()
  },
})

document.getElementById('back-to-islands')?.addEventListener('click', () => {
  if (appMode === 'ml') returnToRoadmap()
})

document.getElementById('roadmap-tutorial-dismiss')?.addEventListener('click', () => {
  hideRoadmapTutorial()
  if (activeCityId) {
    void saveRoadmapPrefs(activeCityId, { tutorial_dismissed: true })
  }
})

function showDistrictPicker() {
  appMode = 'picker'
  document.body.dataset.appMode = 'picker'
  subjectGlobe?.hide()
  disposeMlCity()
  disposeIslandRoadmap()
  planeRig?.hide()
  setCityUiVisible(false)
  setBackToIslandsVisible(false)
  setRoadmapHintVisible(false)
  renderer.domElement.style.cursor = ''
  nearPrompt.hidden = true
  hideFlightOverlays()
  loadingOverlay.classList.add('hidden')
  setCityLightsVisible(false)
  scene.background = new THREE.Color(0x050814)
  districtPicker.show()
}

function enterCityRoadmap(cityId) {
  districtPicker.hide()
  subjectGlobe?.hide()
  appMode = 'roadmap'
  document.body.dataset.appMode = 'roadmap'
  nearPrompt.hidden = true
  loadingOverlay.classList.remove('hidden')
  const label = CITY_LABELS[cityId] || cityId
  setLoadingProgress(0.05, `Opening ${label} roadmap…`)
  setCityLightsVisible(true)

  loadIslandRoadmap(cityId)
    .then(() => {
      mlCityLoaded = false
      escArmedForBack = true
    })
    .catch((err) => {
      console.error(err)
      setLoadingProgress(0, String(err.message || err))
      showDistrictPicker()
    })
}

async function enterLevelFromRoadmap(level) {
  if (!level || roadmapSelecting) return
  if (level.state === 'locked') return
  roadmapSelecting = true
  hideIslandTooltip()
  hideCareerTip()
  hideRoadmapTutorial()
  try {
    if (controls.isLocked) controls.unlock()
    hideFlightOverlays()
    disposeRoadmapOrbit()
    const entry = islandRoadmap?.islandEntries?.find((e) => e.level.id === level.id)
    if (entry) {
      await animateCameraTo(
        camera,
        {
          position: new THREE.Vector3(entry.off.x + 8, entry.y + 12, entry.off.z + 18),
          lookAt: new THREE.Vector3(entry.off.x, entry.y + 2, entry.off.z),
        },
        900,
      )
    }
    appMode = 'ml'
    document.body.dataset.appMode = 'ml'
    setBloomForMode('ml')
    loadingOverlay.classList.remove('hidden')
    await loadLevelCity(activeCityId, level)
    cityFlightStarted = false
    escArmedForBack = false
  } catch (err) {
    console.error(err)
    appMode = 'roadmap'
    document.body.dataset.appMode = 'roadmap'
    setBloomForMode('roadmap')
  } finally {
    roadmapSelecting = false
  }
}

async function returnToRoadmap() {
  if (buildingSidePanel?.isOpen) buildingSidePanel.close()
  if (topicPanel?.isOpen) topicPanel.close()
  if (controls.isLocked) controls.unlock()
  hideFlightOverlays()
  stopWaterfallAudio()
  cityFlightStarted = false
  planeRig?.hide()
  setCityUiVisible(false)
  setBackToIslandsVisible(false)
  nearPrompt.hidden = true
  const level = activeLevel
  disposeMlCity()
  loadingOverlay.classList.remove('hidden')
  setLoadingProgress(0.2, 'Returning to islands…')

  appMode = 'roadmap'
  document.body.dataset.appMode = 'roadmap'
  try {
    await loadIslandRoadmap(activeCityId)
    // Resume camera already points at last_level from prefs; optional gentle pull-back for overview
    if (level && islandRoadmap) {
      const overview = islandRoadmap.cameraStartPose(level.id)
      await animateCameraTo(camera, overview, 900)
      enableRoadmapCamera(overview.target || overview.lookAt)
    }
    escArmedForBack = true
  } catch (err) {
    console.error(err)
    showDistrictPicker()
  }
}

function returnToPicker() {
  if (buildingSidePanel?.isOpen) buildingSidePanel.close()
  if (topicPanel?.isOpen) topicPanel.close()
  if (controls.isLocked) controls.unlock()
  stopWaterfallAudio()
  hideRoadmapTutorial()
  disposeMlCity()
  disposeIslandRoadmap()
  planeRig?.hide()
  setCityUiVisible(false)
  setBackToIslandsVisible(false)
  setRoadmapHintVisible(false)
  nearPrompt.hidden = true
  hideFlightOverlays()
  cityFlightStarted = false
  escArmedForBack = false
  activeLevel = null
  showDistrictPicker()
}

function returnToGlobe() {
  if (buildingSidePanel?.isOpen) buildingSidePanel.close()
  if (topicPanel?.isOpen) topicPanel.close()
  districtPicker?.hide()
  if (controls.isLocked) controls.unlock()
  stopWaterfallAudio()
  hideRoadmapTutorial()
  disposeMlCity()
  disposeIslandRoadmap()
  planeRig?.hide()
  setCityUiVisible(false)
  setBackToIslandsVisible(false)
  setRoadmapHintVisible(false)
  nearPrompt.hidden = true
  hideFlightOverlays()
  cityFlightStarted = false
  escArmedForBack = false
  activeLevel = null
  document.body.dataset.appMode = 'globe'
  bootGlobe()
}

function onSelectSubject(subjectId) {
  if (subjectId !== 'cs') return
  if (appMode === 'picker' || appMode === 'ml' || appMode === 'roadmap') return
  loadingOverlay.classList.add('hidden')
  showDistrictPicker()
}

function bootGlobe() {
  appMode = 'globe'
  document.body.dataset.appMode = 'globe'
  districtPicker?.hide()
  disposeMlCity()
  disposeIslandRoadmap()
  setCityUiVisible(false)
  setBackToIslandsVisible(false)
  setRoadmapHintVisible(false)
  setCityLightsVisible(false)
  document.getElementById('blocker').style.display = 'none'
  nearPrompt.hidden = true
  planeRig?.hide()

  if (!subjectGlobe) {
    subjectGlobe = createSubjectGlobe(scene, camera, renderer, { onSelectSubject })
  } else {
    subjectGlobe.show()
    scene.background = new THREE.Color(0x04060f)
    if (scene.fog) scene.fog.density = 0.0025
    camera.far = 200
    camera.updateProjectionMatrix()
  }

  loadingOverlay.classList.add('hidden')
}

controls.addEventListener('unlock', () => {
  if (appMode === 'ml' && !topicPanel?.isOpen && !buildingSidePanel?.isOpen) {
    escArmedForBack = true
  }
})

controls.addEventListener('lock', () => {
  escArmedForBack = false
})

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Escape') return

  if (appMode === 'picker') {
    returnToGlobe()
    event.preventDefault()
    return
  }

  if (appMode === 'roadmap') {
    returnToPicker()
    event.preventDefault()
    return
  }

  if (appMode !== 'ml') return

  if (buildingSidePanel?.isOpen) {
    buildingSidePanel.close()
    event.preventDefault()
    return
  }

  if (topicPanel?.isOpen) {
    topicPanel.close()
    event.preventDefault()
    return
  }

  if (controls.isLocked) {
    controls.unlock()
    event.preventDefault()
    return
  }

  if (escArmedForBack) {
    returnToRoadmap()
    event.preventDefault()
  }
})

window.addEventListener('pointerdown', (event) => {
  if (event.target !== renderer.domElement) return
  if (appMode === 'roadmap') return // handled by onRoadmapPointerDown

  if (appMode !== 'ml' || topicPanel?.isOpen || buildingSidePanel?.isOpen) return
  cityPointer.x = (event.clientX / window.innerWidth) * 2 - 1
  cityPointer.y = -(event.clientY / window.innerHeight) * 2 + 1
  cityRaycaster.setFromCamera(cityPointer, camera)
  const hits = cityRaycaster.intersectObjects(mlCity?.clickables || [], false)
  const hit = hits[0]?.object
  if (hit?.userData?.buildingId) {
    openBuildingTopic(hit.userData.buildingId)
  } else if (!controls.isLocked) {
    requestFlightLock()
  }
})

// V swaps between the chase camera and the cockpit view.
document.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyV' || event.repeat) return
  if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return
  if (appMode !== 'ml' || !planeRig?.object.visible) return
  planeRig.toggleView()
})

// Roadmap orbit + zoom: listen on window so scroll/click still work when
// the event target isn't the canvas (overlays, body, etc.).
window.addEventListener('pointerdown', onRoadmapPointerDown)
window.addEventListener('pointermove', onRoadmapPointerMove)
renderer.domElement.addEventListener('pointerleave', hideCareerTip)
window.addEventListener('pointerup', onRoadmapPointerUp)
window.addEventListener('pointercancel', onRoadmapPointerUp)
window.addEventListener('wheel', onRoadmapWheel, { passive: false })

// E opens whatever the near-prompt is showing (crosshair target, else nearest building).
document.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyE' || event.repeat) return
  if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return
  if (appMode !== 'ml' || topicPanel?.isOpen || buildingSidePanel?.isOpen) return
  if (targetBuildingId) {
    event.preventDefault()
    openBuildingTopic(targetBuildingId)
  }
})

setCityUiVisible(false)
setCityLightsVisible(false)
setLoadingProgress(1, 'Ready')
bootGlobe()

// Warm Kenney nature/city kits + all island GLBs in the background so the first roadmap is faster
void loadKenneyAssets(() => {}).catch((err) => {
  console.warn('[boot] Kenney preload skipped', err)
})
void loadIslandModels(() => {}).catch((err) => {
  console.warn('[boot] Island GLB preload skipped', err)
})

let prevTime = performance.now()
let fpsFrames = 0
let fpsLast = performance.now()
let fpsValue = 0
const fpsEl = document.getElementById('fps-counter')
window.__clusterFps = () => fpsValue

function animate() {
  requestAnimationFrame(animate)
  renderFrame()
}

function renderFrame() {
  const time = performance.now()
  const delta = Math.min((time - prevTime) / 1000, 0.1)
  prevTime = time

  fpsFrames += 1
  if (time - fpsLast >= 500) {
    fpsValue = Math.round((fpsFrames * 1000) / (time - fpsLast))
    if (fpsEl) fpsEl.textContent = `${fpsValue} FPS`
    fpsFrames = 0
    fpsLast = time
  }

  if (appMode === 'globe') {
    subjectGlobe?.update(time / 1000, delta)
  } else if (appMode === 'roadmap') {
    stepRoadmapTween(time)
    islandRoadmap?.update(time / 1000, delta)
    updateRoadmapCareerTip()
  } else if (appMode === 'ml') {
    planeRig?.update(delta, move, {
      flying: controls.isLocked,
      bounds: mlCity?.flightBounds,
    })
    liveFeed?.update()
    cullController?.update()
    hud?.update()
    cityscape?.update(time / 1000)

    if (mlCity && !topicPanel?.isOpen && !buildingSidePanel?.isOpen) {
      const near = mlCity.updateApproachLabels(
        planeRig?.object.visible ? planeRig.position : camera.position,
      )
      aimRaycaster.setFromCamera(SCREEN_CENTER, camera)
      const aimedId = aimRaycaster.intersectObjects(mlCity.clickables || [], false)[0]?.object
        ?.userData?.buildingId
      targetBuildingId = aimedId || near?.id || null
      const target = targetBuildingId && mlCity.buildingsById?.get(targetBuildingId)
      if (target) {
        nearPrompt.hidden = false
        nearPrompt.innerHTML = `<strong>${target.building.name}</strong> · ${target.street.name} — press <kbd>E</kbd> or click to learn`
      } else {
        nearPrompt.hidden = true
      }
    }
    mlCity?.update?.(time / 1000, delta)
  }
  composer.render()
}

if (import.meta.env.DEV) {
  // Hidden webviews pause requestAnimationFrame; lets automation render frames anyway.
  window.__clusterRenderFrames = (n = 1) => {
    for (let i = 0; i < n; i++) renderFrame()
  }
  // Render one frame from an arbitrary viewpoint (flight camera untouched) → JPEG data URL.
  window.__clusterSnapFrom = (pos, look, width = 1100) => {
    const cam = camera.clone()
    cam.position.set(pos[0], pos[1], pos[2])
    cam.lookAt(look[0], look[1], look[2])
    cam.updateMatrixWorld()
    renderer.render(scene, cam)
    const src = renderer.domElement
    const out = document.createElement('canvas')
    out.width = width
    out.height = Math.round((width * src.height) / src.width)
    out.getContext('2d').drawImage(src, 0, 0, out.width, out.height)
    return out.toDataURL('image/jpeg', 0.85)
  }
}

animate()
