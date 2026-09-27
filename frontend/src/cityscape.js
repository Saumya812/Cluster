import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createWindowTextures, WINDOW_TILE_CELLS } from './windowTexture.js'

// Everything in this module is purely aesthetic environment dressing around
// the data-driven buildings: a full street grid (avenues between district
// blocks AND local streets between individual buildings within a block),
// windowed/colored decorative buildings (background skyline + far shore --
// not tied to real repos, but built with the exact same window-texture
// technique as the real city), a river + bridge with cables/railings, trees
// of a couple of varieties, sidewalks, crosswalks, and a starfield.

const ROAD_WIDTH = 7.2
const LOCAL_ROAD_WIDTH = 3.6
const ROAD_COLOR = 0x12131a
const LOCAL_ROAD_COLOR = 0x1a1c26
const LANE_COLOR = 0x6a7390
const LOCAL_LANE_COLOR = 0x8a92a8
const SIDEWALK_COLOR = 0x454b60
const LOCAL_SIDEWALK_COLOR = 0x3e4458
const CROSSWALK_COLOR = 0xd0d5ea
const CURB_COLOR = 0x6d7388
const SIDEWALK_OFFSET = ROAD_WIDTH / 2 + 2.6 // trees planted this far from the road centerline
const LOCAL_SIDEWALK_OFFSET = LOCAL_ROAD_WIDTH / 2 + 1.15
const TREE_SPACING = 10
const CITY_MARGIN = 28
// Must match DISTRICT_GAP in export_city_json.py
const DISTRICT_GAP = 24

const LAMP_SPACING = 12
const LAMP_COLOR = 0x1c1f28
const LAMP_GLOW_COLOR = 0xffc878

const PLANTER_SPACING = 22
const BOLLARDS_PER_CROSSWALK = 4
const STREET_CAFE_CHANCE = 0.12 // pocket cafe terraces along avenues


const RIVER_GAP = 90 // empty space between the city's edge and the riverbank
const RIVER_DEPTH = 220
const RIVER_SIDE_PADDING = 140

const BG_SKYLINE_MARGIN = 220
const BG_CLUSTER_COUNT = 13

const STAR_COUNT = 1800

// Bridge string lights + tower beacons.
const BRIDGE_LIGHT_SPACING = 9
const BRIDGE_LIGHT_COLOR = 0xffd9a0
const BRIDGE_BEACON_COLOR = 0xff3b30

// Riverfront promenade -- a paved walk + lit gardens along both banks,
// styled after riverfront developments like Sabarmati's: manicured lawns,
// flower beds, a tree-lined path, and lamp posts, not just a bare bank.
const PROMENADE_WIDTH = 5
const GARDEN_COLOR = 0x1f5c2c
const FLOWER_COLORS = ['#e0466e', '#f2b134', '#e0546b', '#9b5de5', '#f15bb5', '#ffd23f']
const FLOWERBED_CLUSTERS_PER_BANK = 10
const FLOWERS_PER_CLUSTER = 14

// The water used to sit at y=-0.02, just fractions of a unit below the
// promenade (0.01) and ground (-0.05) -- everything nearly flush, so the
// bridge (deck at y=3.2) appeared to arc over flat pavement instead of a
// river. Dropping the water into a real channel and building a retaining
// wall down to it from both banks gives the crossing something to actually
// span.
const EMBANKMENT_HEIGHT = 3.2
const WATER_Y = -EMBANKMENT_HEIGHT
const EMBANKMENT_THICKNESS = 1.6
const EMBANKMENT_COLOR = 0x7d766a

// Riverfront decorations -- statues, benches, a fountain plaza, and a
// garden arch at the bridge approach -- so the promenade reads as a real
// riverfront development (Sabarmati-style) rather than a bare walkway.
// Placed at different lateral offsets across the promenade width (lamps at
// the centerline, statues on the garden-side edge, benches on the
// water-side edge) so the three families never collide.
const STATUE_SPACING = 90
const STATUE_PEDESTAL_COLOR = 0x6b6b70
const STATUE_FIGURE_COLOR = 0x9c8054
const BENCH_SPACING = 45
const BENCH_COLOR = 0x4a3524
const FOUNTAIN_RADIUS = 4.5
const ARCH_GAP_WIDTH = 7
const ARCH_HEIGHT = 5.5
const ARCH_COLOR = 0xd8cbb0

// Cars driving the avenue grid.
const CAR_COUNT = 110
const CAR_COLORS = [
  '#f5c518', '#f0b400', '#e8a800', // NYC yellow cabs (weighted)
  '#f5c518', '#f0b400',
  '#d94f4f', '#e0e0e0', '#3a3f4a', '#4f7fd9', '#2a2d38',
]
const CAR_SPEED_MIN = 11
const CAR_SPEED_MAX = 22
const CAR_LANE_OFFSET = 1.4 // distance from road centerline, so opposite-direction cars don't overlap

const ELEVATED_DECK_Y = 9.5
const ELEVATED_DECK_WIDTH = 5.2
const ELEVATED_PILLAR_SPACING = 28
const NEON_COLORS = [0xff4d8d, 0x3de7ff, 0xffb347, 0xff5c5c, 0xa78bfa, 0x34d399]
const NEON_SIGN_COUNT_TARGET = 180
const HAZE_PARTICLE_COUNT = 900

// Parks: dedicated city blocks (see export_city_json.py's PARK_BLOCK_COUNT)
// reserved by the same packer that lays out district blocks, each with its
// own guaranteed non-overlapping footprint. A plain grass circle inset from
// the block left the block's square corners as dead empty space around it,
// so parks now fill the whole block: a square lawn out to a perimeter
// fence (four gated entrances), a small lake with a rocky shore and a loop
// trail around it, and a straight path from each gate in to the lake.
const PARK_TREE_COUNT = 18
const PARK_FLOWER_CLUSTERS = 9
const PARK_BENCH_COUNT = 6
const PARK_FENCE_POST_SPACING = 3
const PARK_GATE_WIDTH = 7
const PARK_PATH_WIDTH = 2.4
const PARK_LAKE_RADIUS_FRACTION = 0.17 // of the park's usable square side
const PARK_LAKE_OFFSET_FRACTION = 0.22 // how far off-center the feature sits
// Every park used to be an identical layout (same lake, same fence, same
// path/fence tone) -- the only thing that varied was which direction the
// lake sat. Two centerpiece types (a lake or a raised fountain plaza) and
// a per-park color tint, both randomly chosen, give each park its own
// identity instead of feeling copy-pasted.
const PARK_FOUNTAIN_CHANCE = 0.4
const PARK_PATH_TINTS = ['#b7ad98', '#c2a688', '#a8b48a', '#a89bb0']
const PARK_FENCE_TINTS = ['#8a7550', '#6b5c3c', '#5c6b4a', '#7a6a6b']
const PLAYGROUND_COLORS = [0xff6b6b, 0xffd93d, 0x6bcbff, 0xff8fab, 0x95e06c, 0xc77dff]
// Riverfront gardens use a shallower footprint than park-block clusters;
// kept just under the gap before the far-shore skyline starts.
// Widened from the original 12 -- a real riverfront park (Brooklyn Bridge
// Park-style: broad lawns, a mature tree canopy, a rocky shore) needs more
// breathing room than a thin decorative strip to actually read as a park.
const GARDEN_DEPTH = 20
const ROCK_COLOR = 0x6f6a5c
const HEDGE_COLOR = 0x1a5c32
const CAFE_WALL = 0xf2e6d8
const CAFE_AWNING = [0xff5c5c, 0xffb347, 0x3de7ff, 0xff4d8d]
const PATIO_COLOR = 0xc4b49a

// Builds every flower bed in the city (riverfront gardens + parks) as one
// shared InstancedMesh -- individual clusters just contribute a center
// point each, keeping the whole city's flower beds to a single draw call.
function buildFlowerBeds(scene, clusterCenters) {
  if (clusterCenters.length === 0) return

  const geometry = new THREE.CylinderGeometry(0.22, 0.28, 0.3, 6)
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 })
  const total = clusterCenters.length * FLOWERS_PER_CLUSTER
  const mesh = new THREE.InstancedMesh(geometry, material, total)
  const colors = new Float32Array(total * 3)
  const dummy = new THREE.Object3D()
  const tmpColor = new THREE.Color()

  let i = 0
  for (const [cx, cz] of clusterCenters) {
    for (let f = 0; f < FLOWERS_PER_CLUSTER; f++) {
      const angle = Math.random() * Math.PI * 2
      const radius = Math.random() * 1.7
      dummy.position.set(cx + Math.cos(angle) * radius, 0.15, cz + Math.sin(angle) * radius)
      dummy.rotation.y = Math.random() * Math.PI * 2
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      tmpColor.set(FLOWER_COLORS[Math.floor(Math.random() * FLOWER_COLORS.length)])
      tmpColor.toArray(colors, i * 3)
      i++
    }
  }
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
  scene.add(mesh)
}

const WINDOW_UNIT_SIZE = 1.2
const MIN_UV_REPEAT = 0.4

// A generic palette for decorative (non-district) buildings -- background
// skyline + far shore -- so they read as a real, colorful city rather than
// one flat silhouette color.
const GENERIC_BUILDING_PALETTE = [
  '#e5534b', '#d9782e', '#c99a2e', '#9aa23c', '#6ea23c', '#4a9d5c', '#3aa88f',
  '#2f9e9e', '#3b8fc4', '#4f74d6', '#6a5fd1', '#8c52d9', '#b34fc2', '#d1499f',
  '#dd4f79', '#c9573f', '#b98a2e', '#348a8a', '#4568b0', '#7a4fb0',
]

// Groups nearly-equal values (e.g. building X coordinates that all sit on
// the same grid column) into single representative positions.
function clusterValues(values, epsilon) {
  const sorted = [...values].sort((a, b) => a - b)
  const clusters = []
  for (const v of sorted) {
    const last = clusters[clusters.length - 1]
    if (last && v - last.sum / last.count < epsilon) {
      last.sum += v
      last.count += 1
    } else {
      clusters.push({ sum: v, count: 1 })
    }
  }
  return clusters.map((c) => c.sum / c.count)
}

function groupByDistrict(repos) {
  const groups = new Map()
  for (const repo of repos) {
    if (!groups.has(repo.district)) groups.set(repo.district, [])
    groups.get(repo.district).push(repo)
  }
  return groups
}

function createAsphaltTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#17181f'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const v = 20 + Math.random() * 14
    ctx.fillStyle = `rgba(${v}, ${v + 2}, ${v + 8}, ${0.12 + Math.random() * 0.2})`
    ctx.fillRect(x, y, 1.4, 1.4)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createWaterTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0b2032'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 36; i++) {
    ctx.strokeStyle = `rgba(130, 190, 230, ${0.08 + Math.random() * 0.14})`
    ctx.lineWidth = 1 + Math.random() * 2
    const y = Math.random() * size
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.bezierCurveTo(size * 0.3, y + 12, size * 0.7, y - 12, size, y)
    ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// ---- Shared road-drawing helper --------------------------------------

// Every road/lane/sidewalk/crosswalk segment used to be its own Mesh --
// fine at 20 districts, but at 50 (each with more internal streets) that
// added up to 3000+ individual draw calls and was the actual bottleneck
// once building batching was already fixed. Instead, each segment
// contributes a small, already-positioned/rotated BufferGeometry to a
// shared collector; flushRoadCollector() merges each category into ONE
// mesh at the end, so the whole road network costs 4 draw calls total
// regardless of how many districts or streets there are.
function createRoadCollector() {
  return {
    road: [],
    lane: [],
    sidewalk: [],
    crosswalk: [],
    curb: [],
    localRoad: [],
    localLane: [],
    localSidewalk: [],
  }
}

// Roads carry a tiled asphalt texture whose repeat used to vary per
// segment (via a cloned texture + different `repeat` per material) --
// merging requires one shared material, so the repeat is baked directly
// into each segment's UV coordinates instead.
function scaleUV(geometry, uScale, vScale) {
  const uv = geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale)
  }
  uv.needsUpdate = true
  return geometry
}

function addRoadSegment(
  collector,
  {
    width,
    length,
    x,
    z,
    vertical,
    withSidewalks,
    sidewalkWidth = 1.35,
    tier = 'arterial', // 'arterial' | 'local'
    dashed = false,
  },
) {
  const roadKey = tier === 'local' ? 'localRoad' : 'road'
  const laneKey = tier === 'local' ? 'localLane' : 'lane'
  const sidewalkKey = tier === 'local' ? 'localSidewalk' : 'sidewalk'

  const roadGeo = new THREE.PlaneGeometry(vertical ? width : length, vertical ? length : width)
  scaleUV(roadGeo, vertical ? 4 : length / 8, vertical ? length / 8 : 4)
  roadGeo.rotateX(-Math.PI / 2)
  roadGeo.translate(x, tier === 'local' ? 0.012 : 0.01, z)
  collector[roadKey].push(roadGeo)

  // Center line / dashed lane marker.
  if (dashed) {
    const dashCount = Math.max(Math.floor(length / 3.2), 1)
    const dashLen = 1.4
    for (let i = 0; i < dashCount; i++) {
      const t = (i + 0.5) / dashCount - 0.5
      const dashGeo = new THREE.PlaneGeometry(
        vertical ? 0.18 : dashLen,
        vertical ? dashLen : 0.18,
      )
      dashGeo.rotateX(-Math.PI / 2)
      if (vertical) dashGeo.translate(x, 0.022, z + t * length)
      else dashGeo.translate(x + t * length, 0.022, z)
      collector[laneKey].push(dashGeo)
    }
  } else {
    const laneGeo = new THREE.PlaneGeometry(vertical ? 0.28 : length, vertical ? length : 0.28)
    laneGeo.rotateX(-Math.PI / 2)
    laneGeo.translate(x, 0.02, z)
    collector[laneKey].push(laneGeo)
  }

  if (withSidewalks) {
    const offset = width / 2 + sidewalkWidth / 2 + 0.08
    for (const sign of [-1, 1]) {
      const sidewalkGeo = new THREE.PlaneGeometry(
        vertical ? sidewalkWidth : length,
        vertical ? length : sidewalkWidth,
      )
      sidewalkGeo.rotateX(-Math.PI / 2)
      if (vertical) sidewalkGeo.translate(x + sign * offset, 0.016, z)
      else sidewalkGeo.translate(x, 0.016, z + sign * offset)
      collector[sidewalkKey].push(sidewalkGeo)

      // Thin curb strip between asphalt and sidewalk.
      const curbGeo = new THREE.PlaneGeometry(
        vertical ? 0.14 : length,
        vertical ? length : 0.14,
      )
      curbGeo.rotateX(-Math.PI / 2)
      const curbOffset = width / 2 + 0.1
      if (vertical) curbGeo.translate(x + sign * curbOffset, 0.018, z)
      else curbGeo.translate(x, 0.018, z + sign * curbOffset)
      collector.curb.push(curbGeo)
    }
  }
}

function addCrosswalk(collector, x, z, roadWidth, vertical = false) {
  const stripeCount = 5
  const stripeLength = roadWidth * 0.82
  for (let i = 0; i < stripeCount; i++) {
    const offset = (i - (stripeCount - 1) / 2) * 1.05
    const stripeGeo = vertical
      ? new THREE.PlaneGeometry(stripeLength, 0.55)
      : new THREE.PlaneGeometry(0.55, stripeLength)
    stripeGeo.rotateX(-Math.PI / 2)
    if (vertical) stripeGeo.translate(x, 0.026, z + offset)
    else stripeGeo.translate(x + offset, 0.026, z)
    collector.crosswalk.push(stripeGeo)
  }
}

function addIntersectionPad(collector, x, z, size) {
  // Slightly raised darker pad so crossings read as managed junctions.
  const pad = new THREE.PlaneGeometry(size, size)
  scaleUV(pad, size / 6, size / 6)
  pad.rotateX(-Math.PI / 2)
  pad.translate(x, 0.014, z)
  collector.road.push(pad)
}

function flushRoadCollector(scene, collector, asphaltTexture) {
  const addMerged = (geos, material) => {
    if (geos.length === 0) return
    scene.add(new THREE.Mesh(mergeGeometries(geos), material))
  }

  addMerged(
    collector.road,
    new THREE.MeshStandardMaterial({ map: asphaltTexture, color: ROAD_COLOR, roughness: 0.95 }),
  )
  addMerged(
    collector.localRoad,
    new THREE.MeshStandardMaterial({ map: asphaltTexture, color: LOCAL_ROAD_COLOR, roughness: 0.92 }),
  )
  addMerged(collector.lane, new THREE.MeshStandardMaterial({ color: LANE_COLOR, roughness: 0.8 }))
  addMerged(collector.localLane, new THREE.MeshStandardMaterial({ color: LOCAL_LANE_COLOR, roughness: 0.75 }))
  addMerged(collector.sidewalk, new THREE.MeshStandardMaterial({ color: SIDEWALK_COLOR, roughness: 0.9 }))
  addMerged(
    collector.localSidewalk,
    new THREE.MeshStandardMaterial({ color: LOCAL_SIDEWALK_COLOR, roughness: 0.88 }),
  )
  addMerged(collector.curb, new THREE.MeshStandardMaterial({ color: CURB_COLOR, roughness: 0.7, metalness: 0.05 }))
  addMerged(collector.crosswalk, new THREE.MeshStandardMaterial({ color: CROSSWALK_COLOR, roughness: 0.65 }))
}

// ---- Main avenues (between district blocks) + local streets (between
// individual buildings within a block) ---------------------------------

// streets: { avenueZs, rows } computed exactly by export_city_json.py's
// packer (see the comment there) -- this used to be re-derived in the
// frontend by clustering scattered building positions into a fixed 5x5
// grid, which was only ever an approximation and broke once the packer
// stopped producing a uniform grid (irregular row counts/widths): roads
// didn't line up with real block edges, cutting through some blocks and
// leaving wide unpaved gaps at others. Drawing from the exact geometry
// instead fixes both.
//
// Horizontal avenues span the full city width, one per row boundary.
// Vertical connector streets are local to a single row (each row has its
// own column layout, so there's no one vertical position valid for every
// row) -- bounded to that row's own band, widened a little into the
// DISTRICT_GAP on each side so they visibly meet the avenues bordering it.
function buildAvenues(collector, minX, maxX, minZ, maxZ, streets) {
  const roadMinX = minX - CITY_MARGIN
  const roadMaxX = maxX + CITY_MARGIN
  const roadMinZ = minZ - CITY_MARGIN
  const roadMaxZ = maxZ + CITY_MARGIN

  const treePositions = []
  const lampPositions = []
  const planterPositions = []
  const bollardPositions = []
  const streetCafeSpots = []
  const lampOffset = ROAD_WIDTH / 2 + 0.8
  const planterOffset = ROAD_WIDTH / 2 + 2.0
  const avenueZs = streets.avenueZs
  const verticalLanes = []

  for (const z of avenueZs) {
    const length = roadMaxX - roadMinX
    addRoadSegment(collector, {
      width: ROAD_WIDTH, length, x: (roadMinX + roadMaxX) / 2, z, vertical: false, withSidewalks: true,
    })
    let lampSide = 1
    for (let x = roadMinX + 4; x < roadMaxX - 4; x += TREE_SPACING) {
      treePositions.push([x, z - SIDEWALK_OFFSET])
      treePositions.push([x, z + SIDEWALK_OFFSET])
    }
    for (let x = roadMinX + 8; x < roadMaxX - 8; x += LAMP_SPACING) {
      lampPositions.push([x, z + lampSide * lampOffset])
      lampSide *= -1
    }
    let planterSide = 1
    for (let x = roadMinX + 12; x < roadMaxX - 12; x += PLANTER_SPACING) {
      planterPositions.push([x, z + planterSide * planterOffset])
      planterSide *= -1
      if (Math.random() < STREET_CAFE_CHANCE) {
        streetCafeSpots.push({
          x: x + 4,
          z: z + planterSide * (planterOffset + 2.2),
          yaw: planterSide > 0 ? 0 : Math.PI,
        })
      }
    }
  }

  const rowOverlap = DISTRICT_GAP / 2 + 2
  for (const row of streets.rows) {
    const zMin = row.topZ - rowOverlap
    const zMax = row.bottomZ + rowOverlap
    const length = zMax - zMin
    for (const x of row.localStreetXs) {
      addRoadSegment(collector, {
        width: ROAD_WIDTH, length, x, z: (zMin + zMax) / 2, vertical: true, withSidewalks: true,
      })
      let lampSide = 1
      for (let z = zMin + 4; z < zMax - 4; z += TREE_SPACING) {
        treePositions.push([x - SIDEWALK_OFFSET, z])
        treePositions.push([x + SIDEWALK_OFFSET, z])
      }
      for (let z = zMin + 8; z < zMax - 8; z += LAMP_SPACING) {
        lampPositions.push([x + lampSide * lampOffset, z])
        lampSide *= -1
      }
      let planterSide = 1
      for (let z = zMin + 12; z < zMax - 12; z += PLANTER_SPACING) {
        planterPositions.push([x + planterSide * planterOffset, z])
        planterSide *= -1
      }
      verticalLanes.push({ x, minZ: zMin + 3, maxZ: zMax - 3 })

      // Crosswalks where this local street actually meets an avenue.
      for (const az of avenueZs) {
        if (az >= zMin && az <= zMax) {
          addCrosswalk(collector, x, az, ROAD_WIDTH)
          for (let b = 0; b < BOLLARDS_PER_CROSSWALK; b++) {
            const side = b < 2 ? -1 : 1
            const along = (b % 2 === 0 ? -1 : 1) * 1.4
            bollardPositions.push([x + side * (ROAD_WIDTH / 2 + 1.1), az + along])
          }
        }
      }
    }
  }

  return { treePositions, lampPositions, avenueZs, verticalLanes, planterPositions, bollardPositions, streetCafeSpots }
}

function buildStreetlights(scene, lampPositions) {
  const poleGeometry = new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6)
  const poleMaterial = new THREE.MeshStandardMaterial({ color: LAMP_COLOR, roughness: 0.6, metalness: 0.4 })
  const armGeometry = new THREE.BoxGeometry(0.7, 0.06, 0.06)
  const lampGeometry = new THREE.SphereGeometry(0.16, 8, 6)
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: LAMP_GLOW_COLOR,
    emissive: LAMP_GLOW_COLOR,
    emissiveIntensity: 3.4,
    roughness: 0.35,
  })

  const poleMesh = new THREE.InstancedMesh(poleGeometry, poleMaterial, lampPositions.length)
  const armMesh = new THREE.InstancedMesh(armGeometry, poleMaterial, lampPositions.length)
  const lampMesh = new THREE.InstancedMesh(lampGeometry, lampMaterial, lampPositions.length)
  const dummy = new THREE.Object3D()

  lampPositions.forEach(([x, z], i) => {
    dummy.position.set(x, 1.6, z)
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    poleMesh.setMatrixAt(i, dummy.matrix)

    dummy.position.set(x + 0.35, 3.15, z)
    dummy.updateMatrix()
    armMesh.setMatrixAt(i, dummy.matrix)

    dummy.position.set(x + 0.7, 3.05, z)
    dummy.updateMatrix()
    lampMesh.setMatrixAt(i, dummy.matrix)
  })

  scene.add(poleMesh, armMesh, lampMesh)
}

// Finer streets weaving between individual buildings *within* each
// district block. Hierarchy: arterial avenues (buildAvenues) → collector
// connectors (also in buildAvenues) → these local grid streets. Each
// district gets a continuous grid with dashed lanes, sidewalks, curbs,
// intersection pads, and sparse lamps so the block reads as managed
// streetscape rather than leftover gaps between towers.
function buildLocalStreets(collector, districtGroups) {
  const treePositions = []
  const lampPositions = []
  const localLanes = [] // driveable lanes for traffic

  for (const group of districtGroups.values()) {
    if (group.length < 2) continue

    const xs = group.map((r) => r.x)
    const zs = group.map((r) => r.z)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minZ = Math.min(...zs)
    const maxZ = Math.max(...zs)

    // Detect building columns / rows. Epsilon ~ half a cell so jittered
    // positions still collapse into the export grid.
    const colXs = clusterValues(xs, 4)
    const rowZs = clusterValues(zs, 4)
    if (colXs.length < 2 && rowZs.length < 2) continue

    // Extend past the outermost buildings so local streets visibly meet
    // the district's bordering collector / avenue roads.
    const pad = 5.5
    const streetMinX = minX - pad
    const streetMaxX = maxX + pad
    const streetMinZ = minZ - pad
    const streetMaxZ = maxZ + pad
    const spanX = streetMaxX - streetMinX
    const spanZ = streetMaxZ - streetMinZ

    const vertStreetXs = []
    for (let i = 0; i < colXs.length - 1; i++) {
      vertStreetXs.push((colXs[i] + colXs[i + 1]) / 2)
    }
    const horizStreetZs = []
    for (let i = 0; i < rowZs.length - 1; i++) {
      horizStreetZs.push((rowZs[i] + rowZs[i + 1]) / 2)
    }

    for (const x of vertStreetXs) {
      addRoadSegment(collector, {
        width: LOCAL_ROAD_WIDTH,
        length: spanZ,
        x,
        z: (streetMinZ + streetMaxZ) / 2,
        vertical: true,
        withSidewalks: true,
        sidewalkWidth: 0.75,
        tier: 'local',
        dashed: true,
      })
      localLanes.push({
        horizontal: false,
        fixedCoord: x,
        minBound: streetMinZ + 1,
        maxBound: streetMaxZ - 1,
      })

      // Trees / lamps only on every other local street to avoid clutter.
      if (vertStreetXs.indexOf(x) % 2 === 0) {
        for (let z = streetMinZ + 3; z < streetMaxZ - 3; z += TREE_SPACING * 1.15) {
          treePositions.push([x - LOCAL_SIDEWALK_OFFSET, z])
        }
        let lampSide = 1
        for (let z = streetMinZ + 6; z < streetMaxZ - 6; z += LAMP_SPACING * 1.4) {
          lampPositions.push([x + lampSide * (LOCAL_ROAD_WIDTH / 2 + 0.55), z])
          lampSide *= -1
        }
      }
    }

    for (const z of horizStreetZs) {
      addRoadSegment(collector, {
        width: LOCAL_ROAD_WIDTH,
        length: spanX,
        x: (streetMinX + streetMaxX) / 2,
        z,
        vertical: false,
        withSidewalks: true,
        sidewalkWidth: 0.75,
        tier: 'local',
        dashed: true,
      })
      localLanes.push({
        horizontal: true,
        fixedCoord: z,
        minBound: streetMinX + 1,
        maxBound: streetMaxX - 1,
      })

      if (horizStreetZs.indexOf(z) % 2 === 0) {
        for (let x = streetMinX + 3; x < streetMaxX - 3; x += TREE_SPACING * 1.15) {
          treePositions.push([x, z - LOCAL_SIDEWALK_OFFSET])
        }
        let lampSide = 1
        for (let x = streetMinX + 6; x < streetMaxX - 6; x += LAMP_SPACING * 1.4) {
          lampPositions.push([x, z + lampSide * (LOCAL_ROAD_WIDTH / 2 + 0.55)])
          lampSide *= -1
        }
      }
    }

    // Managed intersections: pad + zebra at every local crossing.
    for (const x of vertStreetXs) {
      for (const z of horizStreetZs) {
        addIntersectionPad(collector, x, z, LOCAL_ROAD_WIDTH + 0.8)
        addCrosswalk(collector, x, z, LOCAL_ROAD_WIDTH, false)
        addCrosswalk(collector, x, z, LOCAL_ROAD_WIDTH, true)
      }
    }
  }

  return { treePositions, lampPositions, localLanes }
}

// ---- Trees: two rough species for variety -----------------------------

function buildTrees(scene, treePositions) {
  const trunkGeometry = new THREE.CylinderGeometry(0.15, 0.2, 1.4, 6)
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 1 })

  const coneGeometry = new THREE.ConeGeometry(1.1, 2.4, 7)
  const roundGeometry = new THREE.IcosahedronGeometry(1.15, 0)
  const foliageColors = [0x1f4d2b, 0x2c5f34, 0x255a3f, 0x3a6b2e]

  const trunkMesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treePositions.length)

  // Split foliage into cone-type ("pine") and round-type ("deciduous")
  // groups up front since InstancedMesh can't mix geometries.
  const coneIndices = []
  const roundIndices = []
  treePositions.forEach((_, i) => (Math.random() < 0.55 ? coneIndices : roundIndices).push(i))

  // White base color -- per-instance colors below (via instanceColor)
  // are what actually vary the foliage shade, so the material itself
  // shouldn't also tint (that would double up two random colors).
  const foliageMaterial = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })

  const coneMesh = new THREE.InstancedMesh(coneGeometry, foliageMaterial(), coneIndices.length)
  const roundMesh = new THREE.InstancedMesh(roundGeometry, foliageMaterial(), roundIndices.length)
  const coneColors = new Float32Array(coneIndices.length * 3)
  const roundColors = new Float32Array(roundIndices.length * 3)

  const dummy = new THREE.Object3D()
  const tmpColor = new THREE.Color()

  treePositions.forEach(([x, z], i) => {
    const scale = 0.8 + Math.random() * 0.6

    dummy.position.set(x, 0.7 * scale, z)
    dummy.scale.set(scale, scale, scale)
    dummy.rotation.y = Math.random() * Math.PI * 2
    dummy.updateMatrix()
    trunkMesh.setMatrixAt(i, dummy.matrix)
  })

  coneIndices.forEach((i, j) => {
    const [x, z] = treePositions[i]
    const scale = 0.8 + Math.random() * 0.6
    dummy.position.set(x, 2.3 * scale, z)
    dummy.scale.set(scale, scale, scale)
    dummy.rotation.y = Math.random() * Math.PI * 2
    dummy.updateMatrix()
    coneMesh.setMatrixAt(j, dummy.matrix)
    tmpColor.set(foliageColors[Math.floor(Math.random() * foliageColors.length)])
    tmpColor.toArray(coneColors, j * 3)
  })
  coneMesh.instanceColor = new THREE.InstancedBufferAttribute(coneColors, 3)

  roundIndices.forEach((i, j) => {
    const [x, z] = treePositions[i]
    const scale = 0.8 + Math.random() * 0.6
    dummy.position.set(x, 1.9 * scale, z)
    dummy.scale.set(scale, scale, scale)
    dummy.rotation.y = Math.random() * Math.PI * 2
    dummy.updateMatrix()
    roundMesh.setMatrixAt(j, dummy.matrix)
    tmpColor.set(foliageColors[Math.floor(Math.random() * foliageColors.length)])
    tmpColor.toArray(roundColors, j * 3)
  })
  roundMesh.instanceColor = new THREE.InstancedBufferAttribute(roundColors, 3)

  scene.add(trunkMesh, coneMesh, roundMesh)
}

// ---- Windowed decorative buildings (background skyline + far shore) ---
// Same window-texture technique as the real city buildings in main.js, so
// nothing in the skyline reads as a flat, blank box.

function patchMaterialForUvRepeat(material) {
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

// specs: [{x, z, height, width, depth}, ...]
function buildWindowedBuildings(scene, specs, batchSize = 8) {
  const tileWorldSize = WINDOW_TILE_CELLS * WINDOW_UNIT_SIZE
  const dummy = new THREE.Object3D()

  for (let start = 0; start < specs.length; start += batchSize) {
    const batch = specs.slice(start, start + batchSize)
    const { colorTexture, emissiveTexture } = createWindowTextures()

    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshStandardMaterial({
      map: colorTexture,
      emissiveMap: emissiveTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.1,
      roughness: 0.85,
      metalness: 0.05,
    })
    patchMaterialForUvRepeat(material)

    const mesh = new THREE.InstancedMesh(geometry, material, batch.length)
    const uvRepeat = new Float32Array(batch.length * 2)

    batch.forEach((spec, i) => {
      dummy.position.set(spec.x, spec.height / 2, spec.z)
      dummy.scale.set(spec.width, spec.height, spec.depth)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(
        i,
        new THREE.Color(GENERIC_BUILDING_PALETTE[Math.floor(Math.random() * GENERIC_BUILDING_PALETTE.length)]),
      )

      const footprintForUv = (spec.width + spec.depth) / 2
      uvRepeat[i * 2] = Math.max(footprintForUv / tileWorldSize, MIN_UV_REPEAT)
      uvRepeat[i * 2 + 1] = Math.max(spec.height / tileWorldSize, MIN_UV_REPEAT)
    })

    geometry.setAttribute('instanceUvRepeat', new THREE.InstancedBufferAttribute(uvRepeat, 2))
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    scene.add(mesh)
  }
}

// ---- River, bridge (with cables + railings), far-shore skyline --------

function addBeamBetween(scene, material, radius, p1, p2) {
  const direction = new THREE.Vector3().subVectors(p2, p1)
  const length = direction.length()
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 6), material)
  beam.position.copy(p1).addScaledVector(direction, 0.5)
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
  scene.add(beam)
}

function buildRiverAndBridge(scene, minX, maxX, maxZ) {
  const riverCenterZ = maxZ + RIVER_GAP + RIVER_DEPTH / 2
  const riverWidth = maxX - minX + RIVER_SIDE_PADDING * 2

  const waterTexture = createWaterTexture()
  const waterMaterial = new THREE.MeshStandardMaterial({
    map: waterTexture,
    color: 0x2c6a8c,
    // ACES tone mapping (needed to keep bloom under control, see main.js)
    // crushes dark, non-emissive surfaces hard, so a subtle self-glow is
    // needed for the water to read as anything but pure black. The
    // original 0.6 intensity worked fine looking straight down at it, but
    // at a level, near-grazing viewing angle (looking along the bridge
    // rather than across the water) it dropped below the "is this water or
    // just void" threshold entirely. Brighter emissive plus a touch of
    // roughness variation keeps it legible from any angle.
    emissive: 0x11405e,
    emissiveIntensity: 1.1,
    roughness: 0.15,
    metalness: 0.6,
    transparent: true,
    opacity: 0.92,
  })
  const water = new THREE.Mesh(new THREE.PlaneGeometry(riverWidth, RIVER_DEPTH), waterMaterial)
  water.rotation.x = -Math.PI / 2
  water.position.set((minX + maxX) / 2, WATER_Y, riverCenterZ)
  scene.add(water)

  // Suspension bridge crossing the river along the city's central axis:
  // deck, support pillars, towers, railings, and cables strung from each
  // tower down to the deck.
  const bridgeX = (minX + maxX) / 2
  const bridgeSpan = RIVER_DEPTH + 20
  const deckY = 3.2
  const deckHalfWidth = 4

  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0x565f7a, roughness: 0.7, metalness: 0.3 })
  const deck = new THREE.Mesh(new THREE.BoxGeometry(deckHalfWidth * 2, 0.6, bridgeSpan), deckMaterial)
  deck.position.set(bridgeX, deckY, riverCenterZ)
  scene.add(deck)

  const railingMaterial = new THREE.MeshStandardMaterial({ color: 0x8a90a6, roughness: 0.5, metalness: 0.5 })
  for (const sign of [-1, 1]) {
    const railing = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, bridgeSpan), railingMaterial)
    railing.position.set(bridgeX + sign * deckHalfWidth, deckY + 0.7, riverCenterZ)
    scene.add(railing)
  }

  // String lights along both railings, like a real lit bridge at night.
  const bridgeLightGeometry = new THREE.SphereGeometry(0.14, 8, 6)
  const bridgeLightMaterial = new THREE.MeshStandardMaterial({
    color: BRIDGE_LIGHT_COLOR,
    emissive: BRIDGE_LIGHT_COLOR,
    emissiveIntensity: 2.4,
    roughness: 0.4,
  })
  const bridgeLightCount = Math.floor(bridgeSpan / BRIDGE_LIGHT_SPACING) * 2
  const bridgeLightMesh = new THREE.InstancedMesh(bridgeLightGeometry, bridgeLightMaterial, bridgeLightCount)
  {
    const dummy = new THREE.Object3D()
    let i = 0
    for (const sign of [-1, 1]) {
      for (let z = riverCenterZ - bridgeSpan / 2 + 4; z < riverCenterZ + bridgeSpan / 2 - 4; z += BRIDGE_LIGHT_SPACING) {
        dummy.position.set(bridgeX + sign * deckHalfWidth, deckY + 1.15, z)
        dummy.updateMatrix()
        bridgeLightMesh.setMatrixAt(i, dummy.matrix)
        i++
      }
    }
    bridgeLightMesh.count = i
    scene.add(bridgeLightMesh)
  }

  const pillarGeometry = new THREE.CylinderGeometry(0.8, 1, 3.2, 8)
  const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x3d4152, roughness: 0.8 })
  const pillarCount = 5
  for (let i = 0; i < pillarCount; i++) {
    const t = i / (pillarCount - 1)
    const z = riverCenterZ - bridgeSpan / 2 + t * bridgeSpan
    const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial)
    pillar.position.set(bridgeX, 1.4, z)
    scene.add(pillar)
  }

  const towerMaterial = new THREE.MeshStandardMaterial({
    color: 0x7c8398,
    emissive: 0x1a1e2c,
    emissiveIntensity: 0.8,
    roughness: 0.5,
    metalness: 0.6,
  })
  const towerHeight = 15
  const towerGeometry = new THREE.BoxGeometry(1, towerHeight, 1)
  const towerZs = [riverCenterZ - bridgeSpan / 2 + 12, riverCenterZ + bridgeSpan / 2 - 12]
  const cableMaterial = new THREE.MeshStandardMaterial({ color: 0xaab0c4, roughness: 0.4, metalness: 0.7 })

  const beaconGeometry = new THREE.SphereGeometry(0.35, 8, 6)
  const beaconMaterial = new THREE.MeshStandardMaterial({
    color: BRIDGE_BEACON_COLOR,
    emissive: BRIDGE_BEACON_COLOR,
    emissiveIntensity: 3,
    roughness: 0.4,
  })

  for (const z of towerZs) {
    for (const sign of [-1, 1]) {
      const towerX = bridgeX + sign * deckHalfWidth
      const tower = new THREE.Mesh(towerGeometry, towerMaterial)
      tower.position.set(towerX, towerHeight / 2, z)
      scene.add(tower)

      // Aviation-style beacon on top, so the towers read as lit at night
      // from any distance, not just close to the string lights below.
      const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial)
      beacon.position.set(towerX, towerHeight + 0.35, z)
      scene.add(beacon)

      const towerTop = new THREE.Vector3(towerX, towerHeight, z)
      // Cables fanning from the tower top down to points along the deck on
      // both sides of the tower, suspension-bridge style.
      const cableSpan = 26
      const cableCount = 6
      for (let i = 0; i <= cableCount; i++) {
        const t = i / cableCount
        const deckPoint = new THREE.Vector3(towerX, deckY, z - cableSpan / 2 + t * cableSpan)
        addBeamBetween(scene, cableMaterial, 0.06, towerTop, deckPoint)
      }
    }
  }

  // Far-shore silhouette skyline across the water, clustered into a few
  // loose neighborhoods rather than one evenly-spaced row, for a more
  // natural waterfront silhouette.
  // Clusters used to be spaced far enough apart (riverWidth / 8, each only
  // ~56 units wide) that big dark gaps of open water-view showed through
  // between them right where the bridge draws the eye. Packing in more,
  // wider clusters across a couple of staggered depth rows reads as a
  // continuous far-shore skyline instead of a handful of isolated clumps.
  //
  // farShoreZ used to sit only 20 units past the far bank line -- just 3
  // units past where that bank's own promenade+garden actually ends (see
  // bankZs below), so from a distance the garden strip was too thin to
  // read and the buildings looked like they were rising straight out of
  // the water with no shoreline at all ("buildings in the river"). Anchor
  // it to the real garden edge plus a real buffer instead of a number that
  // only happened to clear the water and nothing else.
  const farBankGardenEdge = riverCenterZ + RIVER_DEPTH / 2 + PROMENADE_WIDTH + GARDEN_DEPTH
  const farShoreZ = farBankGardenEdge + 35
  const shoreClusterCount = Math.max(Math.round(riverWidth / 70), 8)
  const shoreClusterSpread = riverWidth / shoreClusterCount
  const shoreSpecs = []
  for (let c = 0; c < shoreClusterCount; c++) {
    const clusterX = minX - RIVER_SIDE_PADDING + shoreClusterSpread * (c + 0.5)
    const buildingsInCluster = 5 + Math.floor(Math.random() * 5)
    for (let b = 0; b < buildingsInCluster; b++) {
      const height = 10 + Math.random() * 35
      const width = 5 + Math.random() * 7
      const depthRow = Math.floor(Math.random() * 3)
      shoreSpecs.push({
        x: clusterX + (Math.random() - 0.5) * shoreClusterSpread * 0.95,
        z: farShoreZ + depthRow * 30 + Math.random() * 22,
        height,
        width,
        depth: width,
      })
    }
  }
  buildWindowedBuildings(scene, shoreSpecs)

  // Riverfront promenade + gardens along both banks -- a paved walk right
  // at the water's edge, a lawn behind it with trees and flower-bed
  // clusters, and lamp posts lighting the path, on the city-side bank and
  // the far-shore bank alike.
  const promenadeMaterial = new THREE.MeshStandardMaterial({ color: 0xa9a08f, roughness: 0.9 })
  const gardenMaterial = new THREE.MeshStandardMaterial({
    color: GARDEN_COLOR,
    emissive: 0x0a1f0e,
    emissiveIntensity: 0.5,
    roughness: 1,
  })
  const embankmentMaterial = new THREE.MeshStandardMaterial({
    color: EMBANKMENT_COLOR,
    emissive: 0x3c352a,
    emissiveIntensity: 1.1,
    roughness: 0.95,
  })

  const treePositions = []
  const flowerClusterCenters = []
  const lampPositions = []
  const statuePositions = []
  const benchPositions = []
  const rockPositions = []

  const bankZs = [riverCenterZ - RIVER_DEPTH / 2, riverCenterZ + RIVER_DEPTH / 2]
  for (const bankZ of bankZs) {
    const towardCity = bankZ < riverCenterZ ? -1 : 1 // which way the garden extends, away from the water

    // Retaining wall dropping from ground/promenade level (y=0) down to the
    // lowered water surface, right at the bank line -- this is what makes
    // the bridge read as crossing an actual river channel.
    const embankment = new THREE.Mesh(
      new THREE.BoxGeometry(riverWidth, EMBANKMENT_HEIGHT, EMBANKMENT_THICKNESS),
      embankmentMaterial
    )
    embankment.position.set((minX + maxX) / 2, WATER_Y / 2, bankZ)
    scene.add(embankment)

    // A scatter of rocks right at the waterline, at the base of the
    // embankment -- softens the sheer retaining wall into something closer
    // to a natural rocky shore (riprap), rather than a bare concrete drop.
    for (let x = minX - RIVER_SIDE_PADDING + 5; x < maxX + RIVER_SIDE_PADDING - 5; x += 3 + Math.random() * 3) {
      rockPositions.push([
        x,
        WATER_Y + 0.2 + Math.random() * 0.8,
        bankZ - towardCity * (EMBANKMENT_THICKNESS / 2 + 0.3 + Math.random() * 0.6),
      ])
    }

    const promenade = new THREE.Mesh(new THREE.PlaneGeometry(riverWidth, PROMENADE_WIDTH), promenadeMaterial)
    promenade.rotation.x = -Math.PI / 2
    promenade.position.set((minX + maxX) / 2, 0.01, bankZ + (towardCity * PROMENADE_WIDTH) / 2)
    scene.add(promenade)

    // Statues along the garden-side edge of the promenade.
    for (let x = minX - RIVER_SIDE_PADDING + 40; x < maxX + RIVER_SIDE_PADDING - 40; x += STATUE_SPACING) {
      statuePositions.push([x, bankZ + towardCity * PROMENADE_WIDTH])
    }

    // Benches along the water-side edge, offset half a spacing from statues.
    for (
      let x = minX - RIVER_SIDE_PADDING + 20 + BENCH_SPACING / 2;
      x < maxX + RIVER_SIDE_PADDING - 20;
      x += BENCH_SPACING
    ) {
      // yaw=0 faces +Z; the near bank (towardCity=-1) faces the water at
      // +Z, the far bank (towardCity=+1) faces it at -Z, i.e. yaw=PI.
      benchPositions.push([x, bankZ, towardCity === 1 ? Math.PI : 0])
    }

    const gardenCenterZ = bankZ + towardCity * (PROMENADE_WIDTH + GARDEN_DEPTH / 2)
    const garden = new THREE.Mesh(new THREE.PlaneGeometry(riverWidth, GARDEN_DEPTH), gardenMaterial)
    garden.rotation.x = -Math.PI / 2
    garden.position.set((minX + maxX) / 2, 0.008, gardenCenterZ)
    scene.add(garden)

    // Trees dotted along the garden strip -- a real riverfront park reads
    // as a mature tree canopy, not a scattering of saplings, so this packs
    // in noticeably denser than a regular street-tree spacing.
    for (let x = minX - RIVER_SIDE_PADDING + 8; x < maxX + RIVER_SIDE_PADDING - 8; x += 6 + Math.random() * 3) {
      treePositions.push([x, gardenCenterZ + (Math.random() - 0.5) * GARDEN_DEPTH * 0.8])
    }

    // Flower-bed clusters scattered along the same strip.
    for (let c = 0; c < FLOWERBED_CLUSTERS_PER_BANK; c++) {
      const x = minX - RIVER_SIDE_PADDING + (riverWidth / FLOWERBED_CLUSTERS_PER_BANK) * (c + 0.5)
      flowerClusterCenters.push([x, gardenCenterZ + (Math.random() - 0.5) * GARDEN_DEPTH * 0.4])
    }

    // Lamp posts lighting the promenade.
    for (let x = minX - RIVER_SIDE_PADDING + 15; x < maxX + RIVER_SIDE_PADDING - 15; x += 22) {
      lampPositions.push([x, bankZ + (towardCity * PROMENADE_WIDTH) / 2])
    }

    // A garden arch at the bridge approach -- a gateway pedestrians would
    // pass through walking along the promenade toward the crossing.
    const archX = bridgeX
    const archZ = bankZ + (towardCity * PROMENADE_WIDTH) / 2
    const archMaterial = new THREE.MeshStandardMaterial({
      color: ARCH_COLOR,
      emissive: 0x71695a,
      emissiveIntensity: 1.4,
      roughness: 0.8,
    })
    for (const sign of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, ARCH_HEIGHT, 0.5), archMaterial)
      post.position.set(archX + sign * (ARCH_GAP_WIDTH / 2), ARCH_HEIGHT / 2, archZ)
      scene.add(post)
    }
    const archBeam = new THREE.Mesh(new THREE.BoxGeometry(ARCH_GAP_WIDTH + 0.6, 0.5, 0.6), archMaterial)
    archBeam.position.set(archX, ARCH_HEIGHT, archZ)
    scene.add(archBeam)

    // A small raised fountain plaza in the garden, a landmark feature near
    // the bridge on each bank.
    const fountainZ = gardenCenterZ
    const fountainBasin = new THREE.Mesh(
      new THREE.CylinderGeometry(FOUNTAIN_RADIUS, FOUNTAIN_RADIUS * 1.05, 0.5, 24),
      promenadeMaterial
    )
    fountainBasin.position.set(bridgeX, 0.25, fountainZ)
    scene.add(fountainBasin)
    const fountainWater = new THREE.Mesh(new THREE.CircleGeometry(FOUNTAIN_RADIUS * 0.8, 24), waterMaterial)
    fountainWater.rotation.x = -Math.PI / 2
    fountainWater.position.set(bridgeX, 0.52, fountainZ)
    scene.add(fountainWater)
    const fountainSpire = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 2.2, 8),
      new THREE.MeshStandardMaterial({
        color: 0xb8bcc9,
        emissive: 0x3a4048,
        emissiveIntensity: 0.6,
        roughness: 0.4,
        metalness: 0.6,
      })
    )
    fountainSpire.position.set(bridgeX, 1.6, fountainZ)
    scene.add(fountainSpire)
  }

  // Statues: pedestal + figure, instanced across both banks.
  if (statuePositions.length > 0) {
    const pedestalGeometry = new THREE.BoxGeometry(0.9, 1, 0.9)
    const pedestalMaterial = new THREE.MeshStandardMaterial({
      color: STATUE_PEDESTAL_COLOR,
      emissive: 0x50505c,
      emissiveIntensity: 1.4,
      roughness: 0.85,
    })
    const figureGeometry = new THREE.ConeGeometry(0.45, 1.8, 6)
    const figureMaterial = new THREE.MeshStandardMaterial({
      color: STATUE_FIGURE_COLOR,
      emissive: 0xa17f3e,
      emissiveIntensity: 1.8,
      roughness: 0.5,
      metalness: 0.4,
    })
    const pedestalMesh = new THREE.InstancedMesh(pedestalGeometry, pedestalMaterial, statuePositions.length)
    const figureMesh = new THREE.InstancedMesh(figureGeometry, figureMaterial, statuePositions.length)
    const dummy = new THREE.Object3D()
    statuePositions.forEach(([x, z], i) => {
      dummy.position.set(x, 0.5, z)
      dummy.updateMatrix()
      pedestalMesh.setMatrixAt(i, dummy.matrix)
      dummy.position.set(x, 1.9, z)
      dummy.updateMatrix()
      figureMesh.setMatrixAt(i, dummy.matrix)
    })
    pedestalMesh.instanceMatrix.needsUpdate = true
    figureMesh.instanceMatrix.needsUpdate = true
    scene.add(pedestalMesh, figureMesh)
  }

  // Rocky shoreline: an irregular scatter of boulders at the waterline,
  // instanced, each with a random scale/rotation so they don't read as
  // copy-pasted.
  if (rockPositions.length > 0) {
    const rockGeometry = new THREE.IcosahedronGeometry(0.6, 0)
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: ROCK_COLOR,
      emissive: 0x1c1a14,
      emissiveIntensity: 0.5,
      roughness: 1,
    })
    const rockMesh = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockPositions.length)
    const dummy = new THREE.Object3D()
    rockPositions.forEach(([x, y, z], i) => {
      dummy.position.set(x, y, z)
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      const scale = 0.5 + Math.random() * 0.9
      dummy.scale.set(scale, scale * (0.6 + Math.random() * 0.5), scale)
      dummy.updateMatrix()
      rockMesh.setMatrixAt(i, dummy.matrix)
    })
    rockMesh.instanceMatrix.needsUpdate = true
    scene.add(rockMesh)
  }

  // Marina: a small T-shaped wooden pier reaching out into the water on
  // the near bank, mooring posts along its crossbar, and a mix of small
  // boats and larger yachts tied up alongside -- a real riverfront isn't
  // just a walking path, it has working water traffic too.
  {
    const nearBankZ = bankZs[0]
    const marinaX = bridgeX - 150
    const dockLength = 34
    const dockWidth = 3.2
    const crossbarLength = 26

    const dockMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b4a30,
      emissive: 0x2a1c10,
      emissiveIntensity: 0.7,
      roughness: 0.85,
    })
    const walkway = new THREE.Mesh(new THREE.BoxGeometry(dockWidth, 0.3, dockLength), dockMaterial)
    walkway.position.set(marinaX, 0.15, nearBankZ + dockLength / 2)
    scene.add(walkway)
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(crossbarLength, 0.3, dockWidth), dockMaterial)
    crossbar.position.set(marinaX, 0.15, nearBankZ + dockLength - dockWidth / 2)
    scene.add(crossbar)

    const postGeometry = new THREE.CylinderGeometry(0.12, 0.12, 1.1, 6)
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x2e2318, roughness: 0.9 })
    const postCount = 9
    const postMesh = new THREE.InstancedMesh(postGeometry, postMaterial, postCount)
    {
      const dummy = new THREE.Object3D()
      for (let i = 0; i < postCount; i++) {
        const t = i / (postCount - 1)
        dummy.position.set(marinaX - crossbarLength / 2 + t * crossbarLength, 0.55, nearBankZ + dockLength)
        dummy.updateMatrix()
        postMesh.setMatrixAt(i, dummy.matrix)
      }
      postMesh.instanceMatrix.needsUpdate = true
      scene.add(postMesh)
    }

    // Boats: hull + small cabin, moored in a row along both sides of the
    // crossbar, each independently sized/colored/rotated for variety.
    const boatCount = 10
    const hullGeometry = new THREE.BoxGeometry(1.6, 0.5, 1)
    const cabinGeometry = new THREE.BoxGeometry(0.9, 0.5, 0.5)
    const hullMaterial = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2 })
    const cabinMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8e8ec,
      emissive: 0x3a3a40,
      emissiveIntensity: 0.6,
      roughness: 0.6,
    })
    const hullMesh = new THREE.InstancedMesh(hullGeometry, hullMaterial, boatCount)
    const cabinMesh = new THREE.InstancedMesh(cabinGeometry, cabinMaterial, boatCount)
    const boatColors = [0xe8e8e8, 0xd94f4f, 0x2c4a6e, 0xf2c14e, 0xffffff, 0x3a6e4a]
    {
      const dummy = new THREE.Object3D()
      for (let i = 0; i < boatCount; i++) {
        const side = i % 2 === 0 ? -1 : 1
        const slot = Math.floor(i / 2)
        const slotCount = Math.ceil(boatCount / 2)
        const bx = marinaX - crossbarLength / 2 + 2.5 + (slot / Math.max(slotCount - 1, 1)) * (crossbarLength - 5)
        const bz = nearBankZ + dockLength + side * (dockWidth / 2 + 1.8)
        const isYacht = Math.random() < 0.35
        const lengthScale = isYacht ? 3.2 + Math.random() * 1.6 : 1.3 + Math.random() * 0.9
        const yaw = (Math.random() - 0.5) * 0.25 // moored roughly parallel to the dock, slight drift

        dummy.position.set(bx, 0.35, bz)
        dummy.rotation.set(0, yaw, 0)
        dummy.scale.set(1, isYacht ? 1.3 : 1, lengthScale)
        dummy.updateMatrix()
        hullMesh.setMatrixAt(i, dummy.matrix)
        hullMesh.setColorAt(i, new THREE.Color(boatColors[Math.floor(Math.random() * boatColors.length)]))

        dummy.position.set(bx, 0.68, bz - (0.15 * lengthScale))
        dummy.updateMatrix()
        cabinMesh.setMatrixAt(i, dummy.matrix)
      }
      hullMesh.instanceMatrix.needsUpdate = true
      if (hullMesh.instanceColor) hullMesh.instanceColor.needsUpdate = true
      cabinMesh.instanceMatrix.needsUpdate = true
      scene.add(hullMesh, cabinMesh)
    }
  }

  // The near and far riverbank gardens already cover their own strip of
  // ground with an explicit surface (see the promenade/garden meshes
  // above), and the water covers the channel between them -- so the
  // shared world "ground" plane in main.js should have a gap exactly here
  // instead of covering it too. It used to just extend straight through:
  // sitting slightly above street level but ABOVE the water's lowered
  // surface, it silently occluded the water from any distant/shallow
  // viewing angle (looked like solid black void). Simply lowering that
  // shared plane below the water fixed the occlusion but broke visual
  // grounding for every building that has no local pavement of its own
  // (the far-shore skyline) -- they end up floating over a visible gap,
  // which right next to the river reads as "buildings sitting in the
  // water". Cutting a precise gap here instead fixes both: ground stays
  // at the correct height everywhere it's actually needed, and is simply
  // absent exactly where the promenade/garden/water already provide their
  // own surface.
  const groundGapMinZ = bankZs[0] - (PROMENADE_WIDTH + GARDEN_DEPTH)
  const groundGapMaxZ = farBankGardenEdge

  return {
    waterTexture,
    treePositions,
    flowerClusterCenters,
    lampPositions,
    benchPositions,
    groundGapMinZ,
    groundGapMaxZ,
  }
}

// Shared bench builder -- riverfront and park benches alike contribute
// [x, z, yaw] entries and get built as one InstancedMesh pair here, the
// same shared-batch pattern as buildTrees/buildStreetlights/buildFlowerBeds.
function buildBenches(scene, benchSpecs) {
  if (benchSpecs.length === 0) return

  const seatGeometry = new THREE.BoxGeometry(1.8, 0.12, 0.5)
  const backGeometry = new THREE.BoxGeometry(1.8, 0.5, 0.1)
  const benchMaterial = new THREE.MeshStandardMaterial({
    color: BENCH_COLOR,
    emissive: 0x5c3d24,
    emissiveIntensity: 1.4,
    roughness: 0.9,
  })
  const seatMesh = new THREE.InstancedMesh(seatGeometry, benchMaterial, benchSpecs.length)
  const backMesh = new THREE.InstancedMesh(backGeometry, benchMaterial, benchSpecs.length)
  const dummy = new THREE.Object3D()
  benchSpecs.forEach(([x, z, yaw], i) => {
    dummy.position.set(x, 0.4, z)
    dummy.rotation.set(0, yaw, 0)
    dummy.updateMatrix()
    seatMesh.setMatrixAt(i, dummy.matrix)

    const [backX, backZ] = rotateYawOffset(0, -0.25, yaw)
    dummy.position.set(x + backX, 0.65, z + backZ)
    dummy.updateMatrix()
    backMesh.setMatrixAt(i, dummy.matrix)
  })
  seatMesh.instanceMatrix.needsUpdate = true
  backMesh.instanceMatrix.needsUpdate = true
  scene.add(seatMesh, backMesh)
}

// ---- Background skyline: clustered into loose "neighborhoods" ---------

function buildBackgroundSkyline(scene, cityCenterX, cityCenterZ, cityRadius) {
  const specs = []
  for (let c = 0; c < BG_CLUSTER_COUNT; c++) {
    const angle = (c / BG_CLUSTER_COUNT) * Math.PI * 2 + Math.random() * 0.2
    const radius = cityRadius + BG_SKYLINE_MARGIN + Math.random() * 100
    const clusterX = cityCenterX + Math.cos(angle) * radius
    const clusterZ = cityCenterZ + Math.sin(angle) * radius
    const buildingsInCluster = 4 + Math.floor(Math.random() * 5)
    for (let b = 0; b < buildingsInCluster; b++) {
      const height = 10 + Math.random() * 50
      const width = 5 + Math.random() * 9
      specs.push({
        x: clusterX + (Math.random() - 0.5) * 40,
        z: clusterZ + (Math.random() - 0.5) * 40,
        height,
        width,
        depth: width * (0.7 + Math.random() * 0.6),
      })
    }
  }
  buildWindowedBuildings(scene, specs)
}

// ---- Cars driving the avenue grid --------------------------------------
// Each car sticks to one avenue, offset to one side of its centerline (so
// opposite-direction traffic doesn't overlap), and loops back to the start
// of its road when it reaches the far end.

// A car is 5 InstancedMeshes (chassis, cabin, wheels x4, headlights x2,
// taillights x2) sharing one geometry each -- 5 draw calls total no matter
// how many cars there are, but reads as an actual car silhouette instead
// of a single glowing rectangle.
const CHASSIS_SIZE = { width: 1.7, height: 0.5, length: 3.5 }
const CABIN_SIZE = { width: 1.3, height: 0.48, length: 1.7 }
const CHASSIS_BOTTOM_Y = 0.3
const WHEEL_RADIUS = 0.34
const WHEEL_THICKNESS = 0.24
const WHEEL_X = CHASSIS_SIZE.width / 2 - 0.02
const WHEEL_Z = CHASSIS_SIZE.length / 2 - 0.55
const CAR_LIGHT_SIZE = { width: 0.28, height: 0.14, depth: 0.06 }
const CAR_LIGHT_X = CHASSIS_SIZE.width / 2 - 0.18
const CAR_LIGHT_Z = CHASSIS_SIZE.length / 2 - 0.02

// Rotates a local (x,z) offset by the car's yaw (rotation around Y) into
// a world-space offset -- used to place wheels/lights correctly regardless
// of which way the car is currently facing.
function rotateYawOffset(localX, localZ, yaw) {
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  return [localX * cos + localZ * sin, -localX * sin + localZ * cos]
}

// avenueZs: full-width horizontal avenue positions. verticalLanes: [{x,
// minZ, maxZ}] -- local vertical streets, each bounded to the row it
// belongs to (see buildAvenues), since columns aren't shared across rows.
// elevatedLanes: optional stacked decks from buildElevatedHighways.
function buildCars(scene, avenueZs, verticalLanes, roadMinX, roadMaxX, elevatedLanes = []) {
  if (avenueZs.length === 0 && verticalLanes.length === 0 && elevatedLanes.length === 0) {
    return { update() {} }
  }

  const chassisGeometry = new THREE.BoxGeometry(CHASSIS_SIZE.width, CHASSIS_SIZE.height, CHASSIS_SIZE.length)
  const chassisMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.5 })

  const cabinGeometry = new THREE.BoxGeometry(CABIN_SIZE.width, CABIN_SIZE.height, CABIN_SIZE.length)
  const cabinMaterial = new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.25, metalness: 0.6 })

  const wheelGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_THICKNESS, 10)
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.8 })

  const lightGeometry = new THREE.BoxGeometry(CAR_LIGHT_SIZE.width, CAR_LIGHT_SIZE.height, CAR_LIGHT_SIZE.depth)
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff6d8, emissive: 0xfff6d8, emissiveIntensity: 2.8, roughness: 0.4,
  })
  const taillightMaterial = new THREE.MeshStandardMaterial({
    color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 2.6, roughness: 0.4,
  })

  const chassisMesh = new THREE.InstancedMesh(chassisGeometry, chassisMaterial, CAR_COUNT)
  const cabinMesh = new THREE.InstancedMesh(cabinGeometry, cabinMaterial, CAR_COUNT)
  const wheelMesh = new THREE.InstancedMesh(wheelGeometry, wheelMaterial, CAR_COUNT * 4)
  const headlightMesh = new THREE.InstancedMesh(lightGeometry, headlightMaterial, CAR_COUNT * 2)
  const taillightMesh = new THREE.InstancedMesh(lightGeometry, taillightMaterial, CAR_COUNT * 2)

  const colors = new Float32Array(CAR_COUNT * 3)
  const tmpColor = new THREE.Color()

  const cars = []
  for (let i = 0; i < CAR_COUNT; i++) {
    const direction = Math.random() < 0.5 ? 1 : -1
    const speed = CAR_SPEED_MIN + Math.random() * (CAR_SPEED_MAX - CAR_SPEED_MIN)
    const useElevated = elevatedLanes.length > 0 && Math.random() < 0.28

    let horizontal, fixedCoord, minBound, maxBound, roadY
    if (useElevated) {
      const lane = elevatedLanes[Math.floor(Math.random() * elevatedLanes.length)]
      horizontal = true
      fixedCoord = lane.fixedCoord
      minBound = lane.minBound
      maxBound = lane.maxBound
      roadY = lane.y
    } else {
      horizontal =
        avenueZs.length > 0 && verticalLanes.length > 0 ? Math.random() < 0.5 : avenueZs.length > 0
      if (horizontal) {
        fixedCoord = avenueZs[Math.floor(Math.random() * avenueZs.length)] + direction * CAR_LANE_OFFSET
        minBound = roadMinX + 3
        maxBound = roadMaxX - 3
      } else {
        const lane = verticalLanes[Math.floor(Math.random() * verticalLanes.length)]
        fixedCoord = lane.x + direction * CAR_LANE_OFFSET
        minBound = lane.minZ
        maxBound = lane.maxZ
      }
      roadY = 0
    }

    const progress = minBound + Math.random() * Math.max(maxBound - minBound, 1)
    cars.push({ horizontal, fixedCoord, minBound, maxBound, direction, speed, progress, roadY })

    tmpColor.set(CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)])
    tmpColor.toArray(colors, i * 3)
  }
  chassisMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
  for (const mesh of [chassisMesh, cabinMesh, wheelMesh, headlightMesh, taillightMesh]) {
    mesh.userData.dynamic = true
  }
  scene.add(chassisMesh, cabinMesh, wheelMesh, headlightMesh, taillightMesh)

  const dummy = new THREE.Object3D()
  const baseChassisY = CHASSIS_BOTTOM_Y + CHASSIS_SIZE.height / 2
  const baseCabinY = CHASSIS_BOTTOM_Y + CHASSIS_SIZE.height + CABIN_SIZE.height / 2
  const wheelCornerOffsets = [
    [WHEEL_X, WHEEL_Z], [-WHEEL_X, WHEEL_Z], [WHEEL_X, -WHEEL_Z], [-WHEEL_X, -WHEEL_Z],
  ]

  function applyCar(i, car) {
    const { horizontal, fixedCoord, progress, direction, roadY = 0 } = car
    const x = horizontal ? progress : fixedCoord
    const z = horizontal ? fixedCoord : progress
    const yaw = horizontal ? (direction > 0 ? Math.PI / 2 : -Math.PI / 2) : direction > 0 ? 0 : Math.PI
    const chassisY = baseChassisY + roadY
    const cabinY = baseCabinY + roadY

    dummy.position.set(x, chassisY, z)
    dummy.rotation.set(0, yaw, 0)
    dummy.updateMatrix()
    chassisMesh.setMatrixAt(i, dummy.matrix)

    dummy.position.set(x, cabinY, z)
    dummy.updateMatrix()
    cabinMesh.setMatrixAt(i, dummy.matrix)

    wheelCornerOffsets.forEach(([lx, lz], w) => {
      const [ox, oz] = rotateYawOffset(lx, lz, yaw)
      dummy.position.set(x + ox, WHEEL_RADIUS + roadY, z + oz)
      dummy.rotation.set(0, yaw, -Math.PI / 2)
      dummy.updateMatrix()
      wheelMesh.setMatrixAt(i * 4 + w, dummy.matrix)
    })

    ;[[CAR_LIGHT_X, CAR_LIGHT_Z], [-CAR_LIGHT_X, CAR_LIGHT_Z]].forEach(([lx, lz], l) => {
      const [ox, oz] = rotateYawOffset(lx, lz, yaw)
      dummy.position.set(x + ox, chassisY, z + oz)
      dummy.rotation.set(0, yaw, 0)
      dummy.updateMatrix()
      headlightMesh.setMatrixAt(i * 2 + l, dummy.matrix)
    })
    ;[[CAR_LIGHT_X, -CAR_LIGHT_Z], [-CAR_LIGHT_X, -CAR_LIGHT_Z]].forEach(([lx, lz], l) => {
      const [ox, oz] = rotateYawOffset(lx, lz, yaw)
      dummy.position.set(x + ox, chassisY, z + oz)
      dummy.rotation.set(0, yaw, 0)
      dummy.updateMatrix()
      taillightMesh.setMatrixAt(i * 2 + l, dummy.matrix)
    })
  }

  const meshes = [chassisMesh, cabinMesh, wheelMesh, headlightMesh, taillightMesh]
  cars.forEach((car, i) => applyCar(i, car))
  meshes.forEach((m) => (m.instanceMatrix.needsUpdate = true))

  return {
    update(delta) {
      cars.forEach((car, i) => {
        car.progress += car.direction * car.speed * delta
        if (car.progress > car.maxBound) car.progress = car.minBound
        if (car.progress < car.minBound) car.progress = car.maxBound
        applyCar(i, car)
      })
      meshes.forEach((m) => (m.instanceMatrix.needsUpdate = true))
    },
  }
}

// ---- Parks + amenities (playgrounds, cafés, formal gardens) -------------

function addPlayground(scene, cx, cz, scale = 1) {
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(5.5 * scale, 24),
    new THREE.MeshStandardMaterial({
      color: 0x3a3f55,
      emissive: 0x141822,
      emissiveIntensity: 0.4,
      roughness: 0.95,
    }),
  )
  pad.rotation.x = -Math.PI / 2
  pad.position.set(cx, 0.035, cz)
  scene.add(pad)

  const rubber = new THREE.Mesh(
    new THREE.CircleGeometry(5.1 * scale, 24),
    new THREE.MeshStandardMaterial({
      color: 0xc45c4a,
      emissive: 0x3a1814,
      emissiveIntensity: 0.35,
      roughness: 1,
    }),
  )
  rubber.rotation.x = -Math.PI / 2
  rubber.position.set(cx, 0.045, cz)
  scene.add(rubber)

  // Swing set
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x4a5568,
    metalness: 0.7,
    roughness: 0.35,
  })
  const swingGroup = new THREE.Group()
  swingGroup.position.set(cx - 2.2 * scale, 0, cz - 1.2 * scale)
  for (const sx of [-1.1, 1.1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.6 * scale, 6), frameMat)
    pole.position.set(sx * scale, 1.3 * scale, 0)
    swingGroup.add(pole)
  }
  const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4 * scale, 6), frameMat)
  topBar.rotation.z = Math.PI / 2
  topBar.position.set(0, 2.55 * scale, 0)
  swingGroup.add(topBar)
  for (const sx of [-0.55, 0.55]) {
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.8 })
    for (const rz of [-0.15, 0.15]) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5 * scale, 4), ropeMat)
      rope.position.set(sx * scale, 1.75 * scale, rz * scale)
      swingGroup.add(rope)
    }
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.5 * scale, 0.06, 0.22 * scale),
      new THREE.MeshStandardMaterial({
        color: PLAYGROUND_COLORS[Math.floor(Math.random() * PLAYGROUND_COLORS.length)],
        roughness: 0.6,
      }),
    )
    seat.position.set(sx * scale, 0.95 * scale, 0)
    swingGroup.add(seat)
  }
  scene.add(swingGroup)

  // Slide
  const slideColor = PLAYGROUND_COLORS[Math.floor(Math.random() * PLAYGROUND_COLORS.length)]
  const slideMat = new THREE.MeshStandardMaterial({
    color: slideColor,
    emissive: slideColor,
    emissiveIntensity: 0.25,
    roughness: 0.45,
    metalness: 0.2,
  })
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.7 * scale, 0.08, 2.8 * scale), slideMat)
  slide.position.set(cx + 2.4 * scale, 0.85 * scale, cz + 0.4 * scale)
  slide.rotation.x = -0.55
  scene.add(slide)
  const ladder = new THREE.Mesh(
    new THREE.BoxGeometry(0.55 * scale, 1.6 * scale, 0.08),
    frameMat,
  )
  ladder.position.set(cx + 2.4 * scale, 0.85 * scale, cz + 1.7 * scale)
  scene.add(ladder)

  // Merry-go-round
  const spinner = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3 * scale, 1.4 * scale, 0.18, 16),
    new THREE.MeshStandardMaterial({
      color: PLAYGROUND_COLORS[Math.floor(Math.random() * PLAYGROUND_COLORS.length)],
      emissive: 0x222033,
      emissiveIntensity: 0.3,
      roughness: 0.5,
      metalness: 0.35,
    }),
  )
  spinner.position.set(cx - 0.4 * scale, 0.2 * scale, cz + 2.4 * scale)
  scene.add(spinner)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9 * scale, 8), frameMat)
  hub.position.set(cx - 0.4 * scale, 0.55 * scale, cz + 2.4 * scale)
  scene.add(hub)
}

function addCafeTerrace(scene, cx, cz, yaw = 0, scale = 1) {
  const group = new THREE.Group()
  group.position.set(cx, 0, cz)
  group.rotation.y = yaw

  const patio = new THREE.Mesh(
    new THREE.PlaneGeometry(7.5 * scale, 6.5 * scale),
    new THREE.MeshStandardMaterial({ color: PATIO_COLOR, roughness: 0.9 }),
  )
  patio.rotation.x = -Math.PI / 2
  patio.position.y = 0.04
  group.add(patio)

  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(4.2 * scale, 2.4 * scale, 3.2 * scale),
    new THREE.MeshStandardMaterial({ color: CAFE_WALL, roughness: 0.75 }),
  )
  wall.position.set(0, 1.2 * scale, -1.1 * scale)
  group.add(wall)

  const awningColor = CAFE_AWNING[Math.floor(Math.random() * CAFE_AWNING.length)]
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(4.6 * scale, 0.12, 1.6 * scale),
    new THREE.MeshStandardMaterial({
      color: awningColor,
      emissive: awningColor,
      emissiveIntensity: 0.55,
      roughness: 0.55,
    }),
  )
  awning.position.set(0, 2.15 * scale, 0.55 * scale)
  awning.rotation.x = 0.18
  group.add(awning)

  const windowGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4 * scale, 1.0 * scale),
    new THREE.MeshStandardMaterial({
      color: 0xffe0a8,
      emissive: 0xffc878,
      emissiveIntensity: 1.8,
      roughness: 0.4,
    }),
  )
  windowGlow.position.set(0, 1.25 * scale, 0.52 * scale)
  group.add(windowGlow)

  // Outdoor tables
  for (const [tx, tz] of [
    [-2.0, 1.4],
    [0.2, 1.8],
    [2.0, 1.3],
  ]) {
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45 * scale, 0.45 * scale, 0.08, 12),
      new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.5, metalness: 0.15 }),
    )
    table.position.set(tx * scale, 0.72 * scale, tz * scale)
    group.add(table)
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 0.7 * scale, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.6, roughness: 0.4 }),
    )
    stem.position.set(tx * scale, 0.35 * scale, tz * scale)
    group.add(stem)
    for (const [cx2, cz2] of [
      [0.55, 0],
      [-0.55, 0],
      [0, 0.55],
    ]) {
      const chair = new THREE.Mesh(
        new THREE.BoxGeometry(0.35 * scale, 0.45 * scale, 0.35 * scale),
        new THREE.MeshStandardMaterial({
          color: awningColor,
          emissive: awningColor,
          emissiveIntensity: 0.15,
          roughness: 0.7,
        }),
      )
      chair.position.set((tx + cx2) * scale, 0.28 * scale, (tz + cz2) * scale)
      group.add(chair)
    }
  }

  // String lights
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffe0a0,
    emissive: 0xffc878,
    emissiveIntensity: 2.4,
    roughness: 0.4,
  })
  for (let i = 0; i < 7; i++) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08 * scale, 6, 6), bulbMat)
    bulb.position.set((-2.4 + i * 0.8) * scale, 2.35 * scale, 0.9 * scale)
    group.add(bulb)
  }

  scene.add(group)
}

function addFormalGardenBeds(scene, x, z, size, flowerClusterCenters) {
  const half = size * 0.32
  const hedgeMat = new THREE.MeshStandardMaterial({
    color: HEDGE_COLOR,
    emissive: 0x0a2414,
    emissiveIntensity: 0.35,
    roughness: 0.95,
  })

  // Geometric hedge rings / beds around the lawn corners.
  for (const [ox, oz] of [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ]) {
    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.55, 4.2),
      hedgeMat,
    )
    bed.position.set(x + ox, 0.28, z + oz)
    scene.add(bed)
    flowerClusterCenters.push([x + ox, z + oz])
    flowerClusterCenters.push([x + ox + 1.2, z + oz - 0.8])
    flowerClusterCenters.push([x + ox - 1.0, z + oz + 1.0])
  }

  // Central rose-ring flower path
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const r = size * 0.18
    flowerClusterCenters.push([x + Math.cos(angle) * r, z + Math.sin(angle) * r])
  }
}

function buildStreetFurniture(scene, planterPositions, bollardPositions, streetCafeSpots) {
  if (planterPositions.length > 0) {
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x5a5044, roughness: 0.85 })
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x2a1e14, roughness: 1 })
    const bushMat = new THREE.MeshStandardMaterial({
      color: 0x2f6b3c,
      emissive: 0x0e2816,
      emissiveIntensity: 0.4,
      roughness: 0.9,
    })
    const flowerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.65,
    })

    const boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.55, 1.1), boxMat, planterPositions.length)
    const soilMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), soilMat, planterPositions.length)
    const bushMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 8, 6), bushMat, planterPositions.length)
    const flowerMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.12, 6, 5),
      flowerMat,
      planterPositions.length * 3,
    )
    const flowerColors = new Float32Array(planterPositions.length * 3 * 3)
    const tmp = new THREE.Color()
    const dummy = new THREE.Object3D()

    planterPositions.forEach(([px, pz], i) => {
      dummy.position.set(px, 0.28, pz)
      dummy.rotation.set(0, (i % 4) * 0.2, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      boxMesh.setMatrixAt(i, dummy.matrix)

      dummy.position.set(px, 0.58, pz)
      dummy.updateMatrix()
      soilMesh.setMatrixAt(i, dummy.matrix)

      dummy.position.set(px, 0.85, pz)
      dummy.scale.set(1, 0.85 + (i % 3) * 0.1, 1)
      dummy.updateMatrix()
      bushMesh.setMatrixAt(i, dummy.matrix)

      for (let f = 0; f < 3; f++) {
        const angle = (f / 3) * Math.PI * 2 + i
        dummy.position.set(px + Math.cos(angle) * 0.28, 1.05, pz + Math.sin(angle) * 0.28)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        flowerMesh.setMatrixAt(i * 3 + f, dummy.matrix)
        tmp.set(FLOWER_COLORS[f % FLOWER_COLORS.length])
        tmp.toArray(flowerColors, (i * 3 + f) * 3)
      }
    })
    flowerMesh.instanceColor = new THREE.InstancedBufferAttribute(flowerColors, 3)
    scene.add(boxMesh, soilMesh, bushMesh, flowerMesh)
  }

  if (bollardPositions.length > 0) {
    const bollardMat = new THREE.MeshStandardMaterial({
      color: 0xd8c9a0,
      emissive: 0x3a3420,
      emissiveIntensity: 0.35,
      metalness: 0.45,
      roughness: 0.4,
    })
    const mesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.12, 0.14, 0.85, 8),
      bollardMat,
      bollardPositions.length,
    )
    const dummy = new THREE.Object3D()
    bollardPositions.forEach(([bx, bz], i) => {
      dummy.position.set(bx, 0.42, bz)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    scene.add(mesh)
  }

  for (const spot of streetCafeSpots) {
    addCafeTerrace(scene, spot.x, spot.z, spot.yaw, 0.72)
  }
}

// parks: [{x, z, size, kind?}, ...] -- dedicated city blocks reserved by
// export_city_json.py's packer (same non-overlap guarantee as a district),
// NOT avenue intersections. Parks used to be stamped directly on top of an
// intersection -- a garden sitting in the middle of a road crossing, which
// looked absurd and needed a crosswalk-skipping special case just to avoid
// a zebra stripe painted through it. A real park occupies its own block.
function buildParks(scene, parks) {
  const treePositions = []
  const flowerClusterCenters = []
  const benchPositions = []
  if (!parks || parks.length === 0) {
    return { treePositions, flowerClusterCenters, benchPositions }
  }

  const grassMaterial = new THREE.MeshStandardMaterial({
    color: GARDEN_COLOR,
    emissive: 0x0a1f0e,
    emissiveIntensity: 0.5,
    roughness: 1,
  })
  // White base -- gate paths are one shared InstancedMesh across every
  // park, so each park's chosen tint (see PARK_PATH_TINTS) is applied via
  // per-instance color (setColorAt below) rather than material.color,
  // which InstancedMesh can't vary per instance.
  const pathMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x2c2818,
    emissiveIntensity: 0.6,
    roughness: 0.9,
  })
  const shoreMaterial = new THREE.MeshStandardMaterial({
    color: 0xc9bd9a,
    emissive: 0x2c2818,
    emissiveIntensity: 0.5,
    roughness: 0.95,
  })
  const lakeTexture = createWaterTexture()
  const lakeMaterial = new THREE.MeshStandardMaterial({
    map: lakeTexture,
    color: 0x2c6a8c,
    emissive: 0x11405e,
    emissiveIntensity: 1.0,
    roughness: 0.15,
    metalness: 0.6,
    transparent: true,
    opacity: 0.92,
  })
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: ROCK_COLOR,
    emissive: 0x1c1a14,
    emissiveIntensity: 0.5,
    roughness: 1,
  })
  // White base for the same instance-color reason as pathMaterial above.
  const fenceMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x6b5c3c,
    emissiveIntensity: 1.6,
    roughness: 0.7,
    metalness: 0.2,
  })

  // Straight plane, pre-rotated flat -- instances just position/scale/yaw
  // it, same trick buildRiverAndBridge's road segments use: after
  // rotateX(-90deg) the geometry's own width axis stays world X and its
  // height axis becomes world Z, so scale.set(width, 1, length) plus
  // rotation.y = yaw lays a path segment exactly along that yaw direction.
  const pathGeometry = new THREE.PlaneGeometry(1, 1)
  pathGeometry.rotateX(-Math.PI / 2)
  const pathSpecs = [] // {x, z, length, yaw}

  const fencePostPositions = [] // [x, z]
  const rockPositions = [] // [x, z]

  for (const park of parks) {
    const { x, z, size } = park
    const kind = park.kind || ['garden', 'playground', 'cafe', 'plaza'][Math.floor(Math.random() * 4)]
    const half = size / 2
    const pathTint = PARK_PATH_TINTS[Math.floor(Math.random() * PARK_PATH_TINTS.length)]
    const fenceTint = PARK_FENCE_TINTS[Math.floor(Math.random() * PARK_FENCE_TINTS.length)]
    const isFountain = kind === 'plaza' || (kind === 'garden' && Math.random() < PARK_FOUNTAIN_CHANCE)

    const grass = new THREE.Mesh(new THREE.PlaneGeometry(size, size), grassMaterial)
    grass.rotation.x = -Math.PI / 2
    grass.position.set(x, 0.02, z)
    scene.add(grass)

    // The centerpiece feature sits off-center (a random direction per park
    // keeps them from all looking identical), with a loop trail around it.
    // Half the parks get a lake with a rocky shore, the rest get a raised
    // fountain plaza -- along with the per-park path/fence tint below,
    // that's what stops every park from being the same design copy-pasted
    // around the city.
    const lakeRadius = size * PARK_LAKE_RADIUS_FRACTION
    const lakeAngle = Math.random() * Math.PI * 2
    const lakeOffset = size * PARK_LAKE_OFFSET_FRACTION
    const lakeX = x + Math.cos(lakeAngle) * lakeOffset
    const lakeZ = z + Math.sin(lakeAngle) * lakeOffset
    const loopRadius = lakeRadius * 1.5

    const loopTrail = new THREE.Mesh(
      new THREE.RingGeometry(loopRadius, loopRadius + PARK_PATH_WIDTH, 28),
      new THREE.MeshStandardMaterial({
        color: pathTint,
        emissive: 0x2c2818,
        emissiveIntensity: 0.6,
        roughness: 0.9,
      }),
    )
    loopTrail.rotation.x = -Math.PI / 2
    loopTrail.position.set(lakeX, 0.04, lakeZ)
    scene.add(loopTrail)

    if (isFountain) {
      const basin = new THREE.Mesh(
        new THREE.CylinderGeometry(lakeRadius * 1.05, lakeRadius * 1.1, 0.5, 24),
        shoreMaterial,
      )
      basin.position.set(lakeX, 0.28, lakeZ)
      scene.add(basin)

      const basinWater = new THREE.Mesh(new THREE.CircleGeometry(lakeRadius * 0.8, 24), lakeMaterial)
      basinWater.rotation.x = -Math.PI / 2
      basinWater.position.set(lakeX, 0.55, lakeZ)
      scene.add(basinWater)

      const spire = new THREE.Mesh(
        new THREE.ConeGeometry(lakeRadius * 0.12, lakeRadius * 0.8, 8),
        new THREE.MeshStandardMaterial({
          color: 0xb8bcc9,
          emissive: 0x3a4048,
          emissiveIntensity: 0.6,
          roughness: 0.4,
          metalness: 0.6,
        }),
      )
      spire.position.set(lakeX, 0.55 + (lakeRadius * 0.8) / 2, lakeZ)
      scene.add(spire)
    } else {
      const shore = new THREE.Mesh(new THREE.CircleGeometry(lakeRadius * 1.3, 28), shoreMaterial)
      shore.rotation.x = -Math.PI / 2
      shore.position.set(lakeX, 0.06, lakeZ)
      scene.add(shore)

      const lake = new THREE.Mesh(new THREE.CircleGeometry(lakeRadius, 28), lakeMaterial)
      lake.rotation.x = -Math.PI / 2
      lake.position.set(lakeX, 0.09, lakeZ)
      scene.add(lake)

      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.3
        const r = lakeRadius * (1.02 + Math.random() * 0.22)
        rockPositions.push([lakeX + Math.cos(angle) * r, lakeZ + Math.sin(angle) * r])
      }
    }

    // Amenity zones live in a corner opposite the lake so they don't collide.
    const amenityAngle = lakeAngle + Math.PI
    const amenityR = size * 0.28
    const ax = x + Math.cos(amenityAngle) * amenityR
    const az = z + Math.sin(amenityAngle) * amenityR

    if (kind === 'playground') {
      addPlayground(scene, ax, az, Math.min(size / 55, 1.35))
    } else if (kind === 'cafe') {
      addCafeTerrace(scene, ax, az, amenityAngle + Math.PI / 2, Math.min(size / 50, 1.2))
    } else if (kind === 'garden') {
      addFormalGardenBeds(scene, x, z, size, flowerClusterCenters)
    } else if (kind === 'plaza') {
      addCafeTerrace(scene, ax, az, amenityAngle, Math.min(size / 55, 1.0))
      addPlayground(scene, x - Math.cos(amenityAngle) * amenityR * 0.7, z - Math.sin(amenityAngle) * amenityR * 0.7, 0.75)
    }

    // Trees scattered across the lawn, away from the lake itself.
    const treeCount = kind === 'garden' ? PARK_TREE_COUNT + 8 : PARK_TREE_COUNT
    for (let t = 0; t < treeCount; t++) {
      let tx, tz
      let attempts = 0
      do {
        tx = x + (Math.random() - 0.5) * (size - 4)
        tz = z + (Math.random() - 0.5) * (size - 4)
        attempts++
      } while (Math.hypot(tx - lakeX, tz - lakeZ) < loopRadius + 3 && attempts < 6)
      treePositions.push([tx, tz])
    }

    // Flower clusters ringing the lakeshore, just outside the loop trail.
    const flowerCount = kind === 'garden' ? PARK_FLOWER_CLUSTERS + 6 : PARK_FLOWER_CLUSTERS
    for (let c = 0; c < flowerCount; c++) {
      const angle = Math.random() * Math.PI * 2
      const r = loopRadius + PARK_PATH_WIDTH + 1.5
      flowerClusterCenters.push([lakeX + Math.cos(angle) * r, lakeZ + Math.sin(angle) * r])
    }

    // Benches around the loop trail, facing the lake.
    for (let b = 0; b < PARK_BENCH_COUNT; b++) {
      const angle = (b / PARK_BENCH_COUNT) * Math.PI * 2 + Math.PI / PARK_BENCH_COUNT
      const r = loopRadius + PARK_PATH_WIDTH + 0.6
      const bx = lakeX + Math.cos(angle) * r
      const bz = lakeZ + Math.sin(angle) * r
      const yaw = Math.atan2(lakeX - bx, lakeZ - bz)
      benchPositions.push([bx, bz, yaw])
    }

    // Perimeter fence with a gated entrance at the middle of each side,
    // and a straight path from each gate in to the lake's loop trail.
    const sides = [
      { axis: 'z', sign: -1 },
      { axis: 'z', sign: 1 },
      { axis: 'x', sign: -1 },
      { axis: 'x', sign: 1 },
    ]
    for (const side of sides) {
      const edgeOffset = side.sign * half
      for (let d = -half; d <= half; d += PARK_FENCE_POST_SPACING) {
        if (Math.abs(d) < PARK_GATE_WIDTH / 2) continue
        if (side.axis === 'z') fencePostPositions.push([x + d, z + edgeOffset, fenceTint])
        else fencePostPositions.push([x + edgeOffset, z + d, fenceTint])
      }

      const gateX = side.axis === 'z' ? x : x + edgeOffset
      const gateZ = side.axis === 'z' ? z + edgeOffset : z
      const toLakeX = lakeX - gateX
      const toLakeZ = lakeZ - gateZ
      const distToLake = Math.hypot(toLakeX, toLakeZ)
      const pathLength = distToLake - loopRadius
      if (pathLength > 1) {
        const yaw = Math.atan2(toLakeX, toLakeZ)
        pathSpecs.push({
          x: gateX + (toLakeX / distToLake) * (pathLength / 2),
          z: gateZ + (toLakeZ / distToLake) * (pathLength / 2),
          length: pathLength,
          yaw,
          tint: pathTint,
        })
      }
    }
  }

  // Gate paths -- instanced, since every park contributes exactly 4.
  // Per-park tint applied via instance color (see pathMaterial above).
  if (pathSpecs.length > 0) {
    const pathMesh = new THREE.InstancedMesh(pathGeometry, pathMaterial, pathSpecs.length)
    const dummy = new THREE.Object3D()
    pathSpecs.forEach((spec, i) => {
      dummy.position.set(spec.x, 0.03, spec.z)
      dummy.rotation.set(0, spec.yaw, 0)
      dummy.scale.set(PARK_PATH_WIDTH, 1, spec.length)
      dummy.updateMatrix()
      pathMesh.setMatrixAt(i, dummy.matrix)
      pathMesh.setColorAt(i, new THREE.Color(spec.tint))
    })
    pathMesh.instanceMatrix.needsUpdate = true
    if (pathMesh.instanceColor) pathMesh.instanceColor.needsUpdate = true
    scene.add(pathMesh)
  }

  // Fence posts -- instanced across every park, tinted the same way.
  if (fencePostPositions.length > 0) {
    const postGeometry = new THREE.CylinderGeometry(0.08, 0.1, 0.9, 6)
    const postMesh = new THREE.InstancedMesh(postGeometry, fenceMaterial, fencePostPositions.length)
    const dummy = new THREE.Object3D()
    fencePostPositions.forEach(([px, pz, tint], i) => {
      dummy.position.set(px, 0.45, pz)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      postMesh.setMatrixAt(i, dummy.matrix)
      postMesh.setColorAt(i, new THREE.Color(tint))
    })
    postMesh.instanceMatrix.needsUpdate = true
    if (postMesh.instanceColor) postMesh.instanceColor.needsUpdate = true
    scene.add(postMesh)
  }

  // Lakeshore rocks -- instanced across every park.
  if (rockPositions.length > 0) {
    const rockGeometry = new THREE.IcosahedronGeometry(0.45, 0)
    const rockMesh = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockPositions.length)
    const dummy = new THREE.Object3D()
    rockPositions.forEach(([rx, rz], i) => {
      dummy.position.set(rx, 0.15, rz)
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      const scale = 0.5 + Math.random() * 0.8
      dummy.scale.set(scale, scale * (0.6 + Math.random() * 0.5), scale)
      dummy.updateMatrix()
      rockMesh.setMatrixAt(i, dummy.matrix)
    })
    rockMesh.instanceMatrix.needsUpdate = true
    scene.add(rockMesh)
  }

  return { treePositions, flowerClusterCenters, benchPositions }
}

function buildStars(scene, cityCenterX, cityCenterZ) {
  const positions = new Float32Array(STAR_COUNT * 3)
  for (let i = 0; i < STAR_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2
    const radiusXZ = 400 + Math.random() * 1600
    const height = 200 + Math.random() * 900
    positions[i * 3] = cityCenterX + Math.cos(angle) * radiusXZ
    positions[i * 3 + 1] = height
    positions[i * 3 + 2] = cityCenterZ + Math.sin(angle) * radiusXZ
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: 0xdfe8ff,
    size: 1.4,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
  })
  scene.add(new THREE.Points(geometry, material))
}

// Chongqing signature: stacked elevated expressways over the main avenues.
function buildElevatedHighways(scene, avenueZs, roadMinX, roadMaxX) {
  if (!avenueZs.length) return { elevatedLanes: [] }

  const length = roadMaxX - roadMinX
  const centerX = (roadMinX + roadMaxX) / 2
  const elevatedLanes = []

  const deckMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1d28,
    roughness: 0.9,
    metalness: 0.15,
  })
  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0xffb347,
    emissive: 0xff8a2b,
    emissiveIntensity: 1.4,
    roughness: 0.45,
  })
  const pillarMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2e3a,
    roughness: 0.85,
    metalness: 0.25,
  })

  const decks = []
  const rails = []
  const pillars = []
  const dummy = new THREE.Object3D()

  avenueZs.forEach((z, avenueIndex) => {
    const levels = avenueIndex % 2 === 0 ? [ELEVATED_DECK_Y] : [ELEVATED_DECK_Y, ELEVATED_DECK_Y + 7.5]
    for (const deckY of levels) {
      decks.push({ x: centerX, y: deckY, z, length })
      rails.push(
        { x: centerX, y: deckY + 0.55, z: z - ELEVATED_DECK_WIDTH / 2 + 0.12, length },
        { x: centerX, y: deckY + 0.55, z: z + ELEVATED_DECK_WIDTH / 2 - 0.12, length },
      )
      elevatedLanes.push({
        fixedCoord: z + 1.1,
        minBound: roadMinX + 4,
        maxBound: roadMaxX - 4,
        y: deckY + 0.55,
      })
      elevatedLanes.push({
        fixedCoord: z - 1.1,
        minBound: roadMinX + 4,
        maxBound: roadMaxX - 4,
        y: deckY + 0.55,
      })

      for (let x = roadMinX + 10; x < roadMaxX - 10; x += ELEVATED_PILLAR_SPACING) {
        pillars.push({ x, y: deckY / 2, z, height: deckY })
      }
    }
  })

  if (decks.length > 0) {
    const deckMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.55, ELEVATED_DECK_WIDTH),
      deckMaterial,
      decks.length,
    )
    decks.forEach((d, i) => {
      dummy.position.set(d.x, d.y, d.z)
      dummy.scale.set(d.length, 1, 1)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      deckMesh.setMatrixAt(i, dummy.matrix)
    })
    deckMesh.instanceMatrix.needsUpdate = true
    scene.add(deckMesh)
  }

  if (rails.length > 0) {
    const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.12, 0.14), railMaterial, rails.length)
    rails.forEach((r, i) => {
      dummy.position.set(r.x, r.y, r.z)
      dummy.scale.set(r.length, 1, 1)
      dummy.updateMatrix()
      railMesh.setMatrixAt(i, dummy.matrix)
    })
    railMesh.instanceMatrix.needsUpdate = true
    scene.add(railMesh)
  }

  if (pillars.length > 0) {
    const pillarMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.7, 1, 0.7),
      pillarMaterial,
      pillars.length,
    )
    pillars.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z)
      dummy.scale.set(1, p.height, 1)
      dummy.updateMatrix()
      pillarMesh.setMatrixAt(i, dummy.matrix)
    })
    pillarMesh.instanceMatrix.needsUpdate = true
    scene.add(pillarMesh)
  }

  return { elevatedLanes }
}

// Vertical neon blade signs + billboard panels on avenue-facing facades.
function buildNeonSigns(scene, repos, avenueZs) {
  if (!repos.length || !avenueZs.length) return { update() {} }

  const step = Math.max(1, Math.floor(repos.length / NEON_SIGN_COUNT_TARGET))
  const specs = []
  for (let i = 0; i < repos.length; i += step) {
    const repo = repos[i]
    let nearAvenue = false
    for (const z of avenueZs) {
      if (Math.abs(repo.z - z) < 18) {
        nearAvenue = true
        break
      }
    }
    if (!nearAvenue && Math.random() > 0.25) continue

    const tall = 4 + Math.random() * 10
    const face = Math.random() < 0.5 ? 1 : -1
    specs.push({
      x: repo.x + face * (3.2 + Math.random() * 0.6),
      y: 6 + Math.random() * 22,
      z: repo.z + (Math.random() - 0.5) * 2,
      h: tall,
      w: 0.35 + Math.random() * 0.55,
      d: 0.18,
      color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)],
    })

    if (Math.random() < 0.35) {
      specs.push({
        x: repo.x + (Math.random() - 0.5) * 2,
        y: 12 + Math.random() * 28,
        z: repo.z + face * (3.1 + Math.random() * 0.5),
        h: 1.2 + Math.random() * 1.8,
        w: 2.5 + Math.random() * 3.5,
        d: 0.2,
        color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)],
      })
    }
  }

  if (specs.length === 0) return { update() {} }

  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 2.8,
      roughness: 0.35,
      metalness: 0.1,
    }),
    specs.length,
  )
  const colors = new Float32Array(specs.length * 3)
  const tmp = new THREE.Color()
  const dummy = new THREE.Object3D()

  specs.forEach((s, i) => {
    dummy.position.set(s.x, s.y, s.z)
    dummy.scale.set(s.w, s.h, s.d)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    tmp.set(s.color)
    tmp.toArray(colors, i * 3)
  })
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
  mesh.instanceMatrix.needsUpdate = true
  mesh.userData.dynamic = true
  scene.add(mesh)

  return {
    update(time) {
      mesh.material.emissiveIntensity = 2.4 + Math.sin(time * 2.2) * 0.55
    },
  }
}

function buildHaze(scene, minX, maxX, minZ, maxZ) {
  const positions = new Float32Array(HAZE_PARTICLE_COUNT * 3)
  for (let i = 0; i < HAZE_PARTICLE_COUNT; i++) {
    positions[i * 3] = minX + Math.random() * (maxX - minX)
    positions[i * 3 + 1] = 2 + Math.random() * 55
    positions[i * 3 + 2] = minZ + Math.random() * (maxZ - minZ)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: 0xffc89a,
    size: 2.8,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geometry, material)
  points.userData.dynamic = true
  scene.add(points)

  return {
    update(time) {
      points.rotation.y = time * 0.012
      material.opacity = 0.09 + Math.sin(time * 0.4) * 0.04
    },
  }
}

// repos: the same array loaded from city.json in main.js (needs x/z/district).
// parks/streets: also from city.json -- exact block/street geometry computed
// by export_city_json.py's packer (see buildAvenues for why this replaced
// re-deriving it from scattered building positions).
// Returns { update(time) } -- call once per frame to animate the water.
export function buildCityscape(scene, repos, parks = [], streets = { avenueZs: [], rows: [] }) {
  const xs = repos.map((r) => r.x)
  const zs = repos.map((r) => r.z)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)

  const districtGroups = groupByDistrict(repos)

  const asphaltTexture = createAsphaltTexture()
  const roadCollector = createRoadCollector()
  const {
    treePositions: avenueTrees,
    lampPositions: avenueLamps,
    avenueZs,
    verticalLanes,
    planterPositions,
    bollardPositions,
    streetCafeSpots,
  } = buildAvenues(roadCollector, minX, maxX, minZ, maxZ, streets)
  const {
    treePositions: localTrees,
    lampPositions: localLamps,
    localLanes,
  } = buildLocalStreets(roadCollector, districtGroups)
  flushRoadCollector(scene, roadCollector, asphaltTexture)

  const {
    waterTexture,
    treePositions: riverTrees,
    flowerClusterCenters: riverFlowers,
    lampPositions: riverLamps,
    benchPositions: riverBenches,
    groundGapMinZ,
    groundGapMaxZ,
  } = buildRiverAndBridge(scene, minX, maxX, maxZ)

  const {
    treePositions: parkTrees,
    flowerClusterCenters: parkFlowers,
    benchPositions: parkBenches,
  } = buildParks(scene, parks)

  const roadMinX = minX - CITY_MARGIN
  const roadMaxX = maxX + CITY_MARGIN
  const { elevatedLanes } = buildElevatedHighways(scene, avenueZs, roadMinX, roadMaxX)

  // Mix arterial collectors with a capped sample of in-block local lanes
  // so traffic actually uses the district street grid.
  const driveableLocal = localLanes.length > 80
    ? localLanes.filter((_, i) => i % Math.ceil(localLanes.length / 80) === 0)
    : localLanes
  const allVerticalLanes = [
    ...verticalLanes,
    ...driveableLocal
      .filter((l) => !l.horizontal)
      .map((l) => ({ x: l.fixedCoord, minZ: l.minBound, maxZ: l.maxBound })),
  ]
  const allAvenueZs = [
    ...avenueZs,
    ...driveableLocal.filter((l) => l.horizontal).map((l) => l.fixedCoord),
  ]

  const carController = buildCars(scene, allAvenueZs, allVerticalLanes, roadMinX, roadMaxX, elevatedLanes)
  const neonController = buildNeonSigns(scene, repos, avenueZs)
  const hazeController = buildHaze(scene, minX, maxX, minZ, maxZ)

  // Cap street cafes so a huge city doesn't spawn thousands of Groups.
  const cafeCap = streetCafeSpots.slice(0, 48)
  buildStreetFurniture(scene, planterPositions, bollardPositions, cafeCap)

  const allTrees = [...avenueTrees, ...localTrees, ...riverTrees, ...parkTrees]
  buildTrees(scene, allTrees)
  buildStreetlights(scene, [...avenueLamps, ...localLamps, ...riverLamps])
  buildFlowerBeds(scene, [...riverFlowers, ...parkFlowers])
  buildBenches(scene, [...riverBenches, ...parkBenches])

  buildBackgroundSkyline(scene, (minX + maxX) / 2, (minZ + maxZ) / 2, Math.max(maxX - minX, maxZ - minZ) / 2)
  buildStars(scene, (minX + maxX) / 2, (minZ + maxZ) / 2)

  let lastTime = null

  return {
    groundGapMinZ,
    groundGapMaxZ,
    update(time) {
      waterTexture.offset.x = (time * 0.01) % 1
      waterTexture.offset.y = (time * 0.006) % 1
      neonController.update(time)
      hazeController.update(time)

      if (lastTime !== null) {
        const delta = Math.min(time - lastTime, 0.1)
        carController.update(delta)
      }
      lastTime = time
    },
  }
}
