/**
 * Cockpit airplane — GitCity-style craft sitting in the lower FOV.
 */
import * as THREE from 'three'

export function createPlaneRig(camera) {
  const group = new THREE.Group()
  group.name = 'planeRig'

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

  const craft = new THREE.Group()
  // Classic GitCity placement: nose into view, wings spanning lower third
  craft.position.set(0, -1.05, -2.4)
  craft.rotation.x = 0.08
  craft.scale.setScalar(1.55)
  group.add(craft)

  // Fuselage
  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 1.55), bodyMat)
  fuselage.position.set(0, 0, 0)
  craft.add(fuselage)

  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 1.2), darkMat)
  belly.position.set(0, -0.16, 0.05)
  craft.add(belly)

  // Nose cone
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 10), accentMat)
  nose.rotation.x = -Math.PI / 2
  nose.position.set(0, 0.02, -0.95)
  craft.add(nose)

  // Cockpit canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), glassMat)
  canopy.scale.set(1.05, 0.72, 1.35)
  canopy.position.set(0, 0.2, -0.15)
  craft.add(canopy)

  // Main wings
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.06, 0.55), bodyMat)
  wing.position.set(0, -0.02, -0.05)
  craft.add(wing)

  // Wing stripes
  for (const x of [-1.1, 1.1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 0.5), cyanMat)
    stripe.position.set(x, 0.01, -0.05)
    craft.add(stripe)
  }

  // Wingtip fins
  for (const x of [-1.4, 1.4]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.35), accentMat)
    tip.position.set(x, 0.12, -0.05)
    craft.add(tip)
  }

  // Engines under wings
  for (const x of [-0.7, 0.7]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.55, 8), darkMat)
    eng.rotation.x = Math.PI / 2
    eng.position.set(x, -0.14, 0.05)
    craft.add(eng)
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.08, 10),
      new THREE.MeshBasicMaterial({ color: 0x3de7ff, transparent: true, opacity: 0.85 }),
    )
    glow.position.set(x, -0.14, 0.34)
    craft.add(glow)
  }

  // Tail
  const hStab = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.05, 0.28), bodyMat)
  hStab.position.set(0, 0.05, 0.72)
  craft.add(hStab)

  const vStab = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.48, 0.35), accentMat)
  vStab.position.set(0, 0.3, 0.68)
  craft.add(vStab)

  const rudderStripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.12), cyanMat)
  rudderStripe.position.set(0, 0.38, 0.72)
  craft.add(rudderStripe)

  // Propeller (decorative spinner at nose)
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

  // Landing-light glow
  const beam = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.55 }),
  )
  beam.position.set(0, -0.08, -0.7)
  craft.add(beam)

  camera.add(group)
  group.visible = false

  let bank = 0

  return {
    show() {
      group.visible = true
    },
    hide() {
      group.visible = false
    },
    update(delta, move) {
      if (!group.visible) return
      const fwd = Number(move.forward) - Number(move.backward)
      const side = Number(move.right) - Number(move.left)
      const targetBank = side * 0.48 + fwd * 0.05
      bank += (targetBank - bank) * Math.min(1, delta * 7)
      group.rotation.z = -bank
      group.rotation.x = fwd * -0.12
      craft.position.y = -1.05 + Math.sin(performance.now() * 0.004) * 0.02
      const spin = 10 + Math.abs(fwd) * 28 + Math.abs(side) * 12
      prop.rotation.z += delta * spin
    },
    dispose() {
      camera.remove(group)
    },
  }
}
