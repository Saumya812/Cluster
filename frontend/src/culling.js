// Distance-based visibility culling for static InstancedMeshes.
//
// Three.js already frustum-culls every InstancedMesh automatically (its
// Frustum.intersectsObject lazily calls computeBoundingSphere() the first
// time an object is rendered) -- that skips whole batches outside the view
// cone for free, no code needed here. What it does NOT do is skip batches
// that ARE in view but so far away the fog has already rendered them
// invisible (e.g. looking straight down a long avenue toward a district
// thousands of units off). That only matters once the city is large enough
// for "in view but fogged into nothing" batches to be common -- worth
// having ahead of the ~125,000-building crawl finishing, since every
// InstancedMesh added since (buildings, trees, lamps, flower beds,
// benches, rocks, statues, the marina...) benefits automatically just by
// existing in the scene when this runs.
export function setupDistanceCulling(scene, camera, fogDensity) {
  // Distance at which FogExp2 has reached ~98.5% opacity -- effectively
  // invisible no matter how bright the object's own emissive glow is.
  // Solving 1 - exp(-(density*d)^2) = 0.985 for d.
  const FOG_INVISIBLE_FACTOR = 0.985
  const cullDistance = Math.sqrt(-Math.log(1 - FOG_INVISIBLE_FACTOR)) / fogDensity

  // Cars/boats-in-water-adjacent-but-moving parts move every frame, so a
  // bounding sphere computed once at setup would go stale -- buildCars
  // tags its five meshes with userData.dynamic so they're skipped here and
  // simply always rendered (their small count makes that cheap anyway).
  const entries = []
  scene.traverse((obj) => {
    if (!obj.isInstancedMesh || obj.count === 0 || obj.userData.dynamic) return
    obj.computeBoundingSphere()
    if (obj.boundingSphere) entries.push(obj)
  })

  let frame = 0
  return {
    // Called once per animation frame; the actual visibility check is
    // throttled since which batches are fogged out doesn't change
    // meaningfully frame to frame.
    update() {
      frame++
      if (frame % 6 !== 0) return
      for (const mesh of entries) {
        const dist = camera.position.distanceTo(mesh.boundingSphere.center) - mesh.boundingSphere.radius
        mesh.visible = dist < cullDistance
      }
    },
  }
}
