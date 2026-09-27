/**
 * Flyable airplane for the level cities — a world-space craft with a smooth
 * chase camera (or cockpit view, toggled with V). Keyboard steering only, so
 * the mouse stays free to click topic towers straight from the plane.
 */
import * as THREE from 'three'

const PLANE_SCALE = 2.4
const MAX_SPEED = 62
const REVERSE_SPEED = 16
const CLIMB_SPEED = 32
const TURN_RATE = 1.55 // rad/s at full rudder
const THROTTLE_RESPONSE = 1.6
const CHASE_BACK = 24
const CHASE_UP = 8
const CHASE_LOOK_AHEAD = 14
const COCKPIT_OFFSET = new THREE.Vector3(0, 0.4, -0.05)
const COCKPIT_AHEAD = new THREE.Vector3(0, 0.3, -6)

function buildCraft() {
  const craft = new THREE.Group()

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xf2f5fa,
    metalness: 0.55,
    roughness: 0.28,
    emissive: 0x1a2838,
    emissiveIntensity: 0.18,
  })
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xffb347,
    emissive: 0xff8c3a,
    emissiveIntensity: 0.65,
    metalness: 0.4,
    roughness: 0.35,
  })
  const cyanMat = new THREE.MeshStandardMaterial({
    color: 0x3de7ff,
    emissive: 0x3de7ff,
    emissiveIntensity: 0.55,
    metalness: 0.5,
    roughness: 0.25,
  })
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x7adfff,
    emissive: 0x1a6080,
    emissiveIntensity: 0.4,
    metalness: 0.85,
    roughness: 0.12,
    transparent: true,
    opacity: 0.78,
  })
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x12161f,
    metalness: 0.7,
    roughness: 0.35,
  })

  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 1.55), bodyMat)
  craft.add(fuselage)

  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 1.2), darkMat)
  belly.position.set(0, -0.16, 0.05)
  craft.add(belly)

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 10), accentMat)
  nose.rotation.x = -Math.PI / 2
  nose.position.set(0, 0.02, -0.95)
  craft.add(nose)

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    glassMat,
  )
  canopy.scale.set(1.05, 0.72, 1.35)
  canopy.position.set(0, 0.2, -0.15)
  craft.add(canopy)

  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.06, 0.55), bodyMat)
  wing.position.set(0, -0.02, -0.05)
  craft.add(wing)

  for (const x of [-1.1, 1.1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 0.5), cyanMat)
    stripe.position.set(x, 0.01, -0.05)
    craft.add(stripe)
  }

  for (const x of [-1.4, 1.4]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.35), accentMat)
    tip.position.set(x, 0.12, -0.05)
    craft.add(tip)
  }

  const engineGlowMat = new THREE.MeshBasicMaterial({ color: 0x3de7ff, transparent: true, opacity: 0.85 })
  for (const x of [-0.7, 0.7]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.55, 8), darkMat)
    eng.rotation.x = Math.PI / 2
    eng.position.set(x, -0.14, 0.05)
    craft.add(eng)
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.08, 10), engineGlowMat)
    glow.position.set(x, -0.14, 0.34)
    craft.add(glow)
  }

  const hStab = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.05, 0.28), bodyMat)
  hStab.position.set(0, 0.05, 0.72)
  craft.add(hStab)

  const vStab = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.48, 0.35), accentMat)
  vStab.position.set(0, 0.3, 0.68)
  craft.add(vStab)

  const rudderStripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.12), cyanMat)
  rudderStripe.position.set(0, 0.38, 0.72)
  craft.add(rudderStripe)

  const prop = new THREE.Group()
  prop.position.set(0, 0.02, -1.2)
  craft.add(prop)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), darkMat)
  hub.rotation.x = Math.PI / 2
  prop.add(hub)
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.85, 0.04), darkMat)
  prop.add(blade)
  const blade2 = blade.clone()
  blade2.rotation.z = Math.PI / 2
  prop.add(blade2)

  // Navigation lights: red port, green starboard, so heading reads at night.
  for (const [x, color] of [[-1.45, 0xff4d5e], [1.45, 0x34d399]]) {
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshBasicMaterial({ color }),
    )
    light.position.set(x, 0.02, -0.05)
    craft.add(light)
  }

  const landingLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.55 }),
  )
  landingLight.position.set(0, -0.08, -0.7)
  craft.add(landingLight)

  return { craft, prop, canopy, engineGlowMat }
}

export function createPlaneRig(scene, camera) {
  const group = new THREE.Group()
  group.name = 'planeRig'
  const tilt = new THREE.Group()
  group.add(tilt)
  const { craft, prop, canopy, engineGlowMat } = buildCraft()
  craft.scale.setScalar(PLANE_SCALE)
  tilt.add(craft)
  scene.add(group)
  group.visible = false

  let yaw = 0
  let speed = 0
  let climb = 0
  let bank = 0
  let pitch = 0
  let view = 'chase'

  const forward = new THREE.Vector3()
  const desiredCam = new THREE.Vector3()
  const lookTarget = new THREE.Vector3()
  const scratch = new THREE.Vector3()

  function updateForward() {
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw))
  }

  function chaseCameraTarget(out) {
    return out.copy(group.position).addScaledVector(forward, -CHASE_BACK).setY(group.position.y + CHASE_UP)
  }

  function updateCamera(delta, snap) {
    if (view === 'cockpit') {
      group.updateMatrixWorld(true)
      camera.position.copy(COCKPIT_OFFSET).multiplyScalar(PLANE_SCALE)
      group.localToWorld(camera.position)
      lookTarget.copy(COCKPIT_AHEAD).multiplyScalar(PLANE_SCALE)
      group.localToWorld(lookTarget)
      camera.lookAt(lookTarget)
      return
    }
    chaseCameraTarget(desiredCam)
    if (snap) camera.position.copy(desiredCam)
    else camera.position.lerp(desiredCam, 1 - Math.exp(-5 * delta))
    lookTarget.copy(group.position).addScaledVector(forward, CHASE_LOOK_AHEAD)
    lookTarget.y += 2.5
    camera.lookAt(lookTarget)
  }

  function clampToBounds(bounds) {
    if (!bounds) return
    const p = group.position
    p.x = Math.min(bounds.maxX, Math.max(bounds.minX, p.x))
    p.z = Math.min(bounds.maxZ, Math.max(bounds.minZ, p.z))
    p.y = Math.min(bounds.maxY, Math.max(bounds.minY, p.y))
  }

  return {
    object: group,
    get position() {
      return group.position
    },
    get view() {
      return view
    },
    show() {
      group.visible = true
    },
    hide() {
      group.visible = false
    },
    /** Teleport the plane (at rest) to `position`, nose toward `lookAt`. */
    placeAt(position, lookAt, bounds = null) {
      group.position.copy(position)
      clampToBounds(bounds)
      if (lookAt) {
        scratch.subVectors(lookAt, group.position)
        if (scratch.x || scratch.z) yaw = Math.atan2(-scratch.x, -scratch.z)
      }
      group.rotation.set(0, yaw, 0)
      tilt.rotation.set(0, 0, 0)
      speed = climb = bank = pitch = 0
      updateForward()
      updateCamera(0, true)
    },
    nudgeAltitude(dy, bounds = null) {
      group.position.y += dy
      clampToBounds(bounds)
    },
    toggleView() {
      view = view === 'chase' ? 'cockpit' : 'chase'
      // The pilot sits where the canopy is; drawing it would fill the screen.
      canopy.visible = view === 'chase'
      updateCamera(0, true)
      return view
    },
    /** `flying` false = parked: hold position, keep the camera framed. */
    update(delta, move, { flying = true, bounds = null } = {}) {
      if (!group.visible) return
      const fwd = flying ? Number(move.forward) - Number(move.backward) : 0
      const turn = flying ? Number(move.right) - Number(move.left) : 0
      const lift = flying ? Number(move.up) - Number(move.down) : 0

      const targetSpeed = fwd > 0 ? MAX_SPEED : fwd < 0 ? -REVERSE_SPEED : 0
      speed += (targetSpeed - speed) * (1 - Math.exp(-THROTTLE_RESPONSE * delta))
      climb += (lift * CLIMB_SPEED - climb) * (1 - Math.exp(-4 * delta))

      // Turn harder when moving, but still allow pivoting at a hover.
      const speedFactor = 0.45 + 0.55 * Math.min(1, Math.abs(speed) / MAX_SPEED)
      yaw -= turn * TURN_RATE * speedFactor * delta
      updateForward()

      group.position.addScaledVector(forward, speed * delta)
      group.position.y += climb * delta
      clampToBounds(bounds)
      group.rotation.set(0, yaw, 0)

      const k = 1 - Math.exp(-6 * delta)
      bank += (turn * 0.55 * speedFactor - bank) * k
      pitch += ((climb / CLIMB_SPEED) * 0.28 - pitch) * k
      tilt.rotation.set(pitch, 0, -bank)
      craft.position.y = Math.sin(performance.now() * 0.0025) * 0.12

      prop.rotation.z += delta * (8 + (Math.abs(speed) / MAX_SPEED) * 40)
      engineGlowMat.opacity = 0.55 + 0.45 * Math.min(1, Math.abs(speed) / MAX_SPEED)

      updateCamera(delta, false)
    },
    dispose() {
      scene.remove(group)
    },
  }
}
