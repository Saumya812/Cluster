/**
 * Scene 1 — Subject Globe.
 * Drag to rotate · glowing subject pins · CS opens the city (MVP).
 */
import * as THREE from 'three'

const SUBJECTS = [
  // Front hemisphere first so CS is visible on load.
  { id: 'cs', label: 'CS', color: 0x3de7ff, enabled: true, lat: 8, lon: 0 },
  { id: 'math', label: 'Math', color: 0xffb347, enabled: false, lat: 18, lon: 42 },
  { id: 'biology', label: 'Biology', color: 0x34d399, enabled: false, lat: -6, lon: -48 },
  { id: 'design', label: 'Design', color: 0xff4d8d, enabled: false, lat: 28, lon: -28 },
  { id: 'physics', label: 'Physics', color: 0xa78bfa, enabled: false, lat: -22, lon: 32 },
  { id: 'chemistry', label: 'Chem', color: 0xf472b6, enabled: false, lat: 12, lon: 78 },
  { id: 'history', label: 'History', color: 0xfbbf24, enabled: false, lat: -14, lon: -88 },
  { id: 'business', label: 'Business', color: 0x60a5fa, enabled: false, lat: 35, lon: 110 },
  { id: 'art', label: 'Art', color: 0xfb7185, enabled: false, lat: -28, lon: 140 },
  { id: 'languages', label: 'Lang', color: 0x2dd4bf, enabled: false, lat: 5, lon: -130 },
  { id: 'psychology', label: 'Psych', color: 0xc084fc, enabled: false, lat: 42, lon: -155 },
  { id: 'engineering', label: 'Eng', color: 0x38bdf8, enabled: false, lat: -35, lon: 175 },
]

const GLOBE_RADIUS = 5
const PIN_RADIUS = 6.35
const DRAG_THRESHOLD = 6

function makeLabelSprite(text, color, enabled) {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 80
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 320, 80)
  ctx.fillStyle = enabled ? 'rgba(5, 8, 20, 0.72)' : 'rgba(5, 8, 20, 0.55)'
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(20, 14, 280, 52, 8)
    ctx.fill()
  } else {
    ctx.fillRect(20, 14, 280, 52)
  }
  ctx.font = '700 34px Sora, Segoe UI, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`
  ctx.fillText(text, 160, 42)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(enabled ? 3.2 : 2.6, enabled ? 0.8 : 0.65, 1)
  sprite.renderOrder = 10
  return sprite
}

/** lat/lon in degrees → position on sphere (lon 0 faces +Z / camera). */
function latLonToVec(latDeg, lonDeg, radius) {
  const lat = (latDeg * Math.PI) / 180
  const lon = (lonDeg * Math.PI) / 180
  return new THREE.Vector3(
    radius * Math.cos(lat) * Math.sin(lon),
    radius * Math.sin(lat),
    radius * Math.cos(lat) * Math.cos(lon),
  )
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ onSelectSubject: (id: string) => void }} hooks
 */
export function createSubjectGlobe(scene, camera, renderer, { onSelectSubject }) {
  const root = new THREE.Group()
  root.name = 'subjectGlobe'
  scene.add(root)

  scene.background = new THREE.Color(0x04060f)
  if (scene.fog) scene.fog.density = 0.0025

  const ambient = new THREE.AmbientLight(0x8899cc, 0.65)
  root.add(ambient)
  const key = new THREE.DirectionalLight(0xffffff, 0.95)
  key.position.set(4, 6, 8)
  root.add(key)

  // Rotatable globe + pins (stars stay fixed).
  const turntable = new THREE.Group()
  root.add(turntable)

  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS, 48, 48),
    new THREE.MeshStandardMaterial({
      color: 0x12182a,
      emissive: 0x0a1020,
      emissiveIntensity: 0.6,
      roughness: 0.55,
      metalness: 0.35,
    }),
  )
  turntable.add(globe)

  const wire = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS + 0.04, 28, 20),
    new THREE.MeshBasicMaterial({
      color: 0x3de7ff,
      wireframe: true,
      transparent: true,
      opacity: 0.14,
    }),
  )
  turntable.add(wire)

  // Soft latitude rings for readability.
  for (const y of [-2.2, 0, 2.2]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(Math.sqrt(Math.max(GLOBE_RADIUS ** 2 - y * y, 0.01)), 0.02, 8, 64),
      new THREE.MeshBasicMaterial({
        color: 0x3de7ff,
        transparent: true,
        opacity: 0.18,
      }),
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = y
    turntable.add(ring)
  }

  const starCount = 700
  const starPos = new Float32Array(starCount * 3)
  for (let i = 0; i < starCount; i++) {
    const r = 40 + Math.random() * 80
    const u = Math.random()
    const v = Math.random()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    starPos[i * 3 + 2] = r * Math.cos(phi)
  }
  root.add(
    new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPos, 3)),
      new THREE.PointsMaterial({
        color: 0xc8d4ff,
        size: 0.35,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    ),
  )

  const pinMeshes = []
  const pinGroups = []

  SUBJECTS.forEach((subject) => {
    const group = new THREE.Group()
    const pos = latLonToVec(subject.lat, subject.lon, PIN_RADIUS)
    group.position.copy(pos)

    const orbSize = subject.enabled ? 0.55 : 0.4
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(orbSize, 24, 24),
      new THREE.MeshStandardMaterial({
        color: subject.color,
        emissive: subject.color,
        emissiveIntensity: subject.enabled ? 2.8 : 1.1,
        roughness: 0.22,
        metalness: 0.25,
      }),
    )
    orb.userData.subject = subject
    orb.userData.isPin = true
    group.add(orb)

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(orbSize * 1.55, 16, 16),
      new THREE.MeshBasicMaterial({
        color: subject.color,
        transparent: true,
        opacity: subject.enabled ? 0.28 : 0.12,
        depthWrite: false,
      }),
    )
    group.add(halo)

    const label = makeLabelSprite(subject.label, subject.color, subject.enabled)
    label.position.set(0, orbSize + 0.85, 0)
    group.add(label)

    const stemLen = pos.length() - GLOBE_RADIUS
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, Math.max(stemLen, 0.2), 6),
      new THREE.MeshBasicMaterial({
        color: subject.color,
        transparent: true,
        opacity: subject.enabled ? 0.55 : 0.3,
      }),
    )
    const dir = pos.clone().normalize().negate()
    stem.position.copy(dir.clone().multiplyScalar(stemLen / 2))
    stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    group.add(stem)

    turntable.add(group)
    pinMeshes.push(orb)
    pinGroups.push(group)
  })

  camera.position.set(0, 1.8, 15)
  camera.lookAt(0, 0, 0)
  camera.far = 200
  camera.updateProjectionMatrix()

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let hovering = null
  let flying = false
  let fly = null
  let active = true

  // Drag-to-rotate state (manual control is primary — no waiting for auto-spin).
  let dragging = false
  let dragMoved = false
  let pointerId = null
  let lastX = 0
  let lastY = 0
  let startX = 0
  let startY = 0
  let yaw = 0
  let pitch = 0
  const keySpin = { left: false, right: false, up: false, down: false }

  function setHover(pin) {
    if (hovering === pin) return
    if (hovering) {
      hovering.scale.setScalar(1)
      hovering.material.emissiveIntensity = hovering.userData.subject.enabled ? 2.8 : 1.1
    }
    hovering = pin
    if (hovering && !dragging) {
      hovering.scale.setScalar(1.28)
      hovering.material.emissiveIntensity = hovering.userData.subject.enabled ? 3.6 : 1.5
      document.body.style.cursor = 'pointer'
    } else if (!dragging) {
      document.body.style.cursor = 'grab'
    }
  }

  function applyTurntable() {
    turntable.rotation.order = 'YXZ'
    turntable.rotation.y = yaw
    turntable.rotation.x = pitch
  }

  function setPointerNdc(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1
  }

  function onPointerMove(event) {
    if (!active || flying) return

    if (dragging) {
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      lastX = event.clientX
      lastY = event.clientY
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > DRAG_THRESHOLD) {
        dragMoved = true
        document.body.style.cursor = 'grabbing'
      }
      // Drag left → rotate globe so the right side comes forward (natural feel).
      yaw += dx * 0.009
      pitch += dy * 0.0065
      pitch = Math.max(-1.05, Math.min(1.05, pitch))
      applyTurntable()
      return
    }

    setPointerNdc(event)
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(pinMeshes, false)
    setHover(hits[0]?.object ?? null)
  }

  function startFlyTo(subject, pinWorldPos) {
    flying = true
    dragging = false
    pointerId = null
    document.body.style.cursor = 'wait'
    const endPos = pinWorldPos.clone().multiplyScalar(1.25).add(new THREE.Vector3(0, 0.6, 0))
    fly = {
      startPos: camera.position.clone(),
      endPos,
      startTarget: new THREE.Vector3(0, 0, 0),
      endTarget: pinWorldPos.clone(),
      t: 0,
      duration: 1.25,
      subjectId: subject.id,
    }
  }

  function onPointerDown(event) {
    if (!active || flying) return
    if (event.target !== renderer.domElement) return
    if (event.button !== 0) return

    dragging = true
    dragMoved = false
    pointerId = event.pointerId
    lastX = event.clientX
    lastY = event.clientY
    startX = event.clientX
    startY = event.clientY
    document.body.style.cursor = 'grabbing'
    try {
      renderer.domElement.setPointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
  }

  function endDrag(event) {
    if (!dragging) return
    dragging = false
    if (pointerId != null) {
      try {
        renderer.domElement.releasePointerCapture(pointerId)
      } catch {
        /* ignore */
      }
      pointerId = null
    }

    if (!dragMoved && event) {
      setPointerNdc(event)
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(pinMeshes, false)
      const pin = hits[0]?.object
      if (pin) {
        const subject = pin.userData.subject
        if (!subject.enabled) {
          const sub = document.querySelector('#globe-hint .globe-sub')
          if (sub) {
            sub.innerHTML = `<span class="accent">${subject.label}</span> city coming later — open <span class="accent">CS</span> for MVP`
          }
          document.body.style.cursor = 'grab'
          return
        }
        const worldPos = new THREE.Vector3()
        pin.getWorldPosition(worldPos)
        startFlyTo(subject, worldPos)
        return
      }
    }

    document.body.style.cursor = 'grab'
  }

  function onPointerUp(event) {
    if (!active || flying) return
    endDrag(event)
  }

  function onPointerCancel() {
    endDrag(null)
  }

  function onKeyDown(event) {
    if (!active || flying) return
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        keySpin.left = true
        event.preventDefault()
        break
      case 'ArrowRight':
      case 'KeyD':
        keySpin.right = true
        event.preventDefault()
        break
      case 'ArrowUp':
      case 'KeyW':
        keySpin.up = true
        event.preventDefault()
        break
      case 'ArrowDown':
      case 'KeyS':
        keySpin.down = true
        event.preventDefault()
        break
      default:
        break
    }
  }

  function onKeyUp(event) {
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        keySpin.left = false
        break
      case 'ArrowRight':
      case 'KeyD':
        keySpin.right = false
        break
      case 'ArrowUp':
      case 'KeyW':
        keySpin.up = false
        break
      case 'ArrowDown':
      case 'KeyS':
        keySpin.down = false
        break
      default:
        break
    }
  }

  // Prefer canvas listeners + capture so drag stays smooth off the sphere.
  const el = renderer.domElement
  el.style.touchAction = 'none'
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointerup', onPointerUp)
  el.addEventListener('pointercancel', onPointerCancel)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  const hint = document.getElementById('globe-hint')
  if (hint) {
    hint.hidden = false
    const sub = hint.querySelector('.globe-sub')
    if (sub) {
      sub.innerHTML =
        'Drag or ← → to spin · click a pin · <span class="accent">CS</span> opens the city'
    }
  }

  applyTurntable()
  document.body.style.cursor = 'grab'

  return {
    get active() {
      return active
    },
    show() {
      active = true
      root.visible = true
      if (hint) hint.hidden = false
      camera.position.set(0, 1.8, 15)
      camera.lookAt(0, 0, 0)
      yaw = 0
      pitch = 0
      applyTurntable()
      document.body.style.cursor = 'grab'
    },
    hide() {
      active = false
      root.visible = false
      if (hint) hint.hidden = true
      document.body.style.cursor = ''
      setHover(null)
      dragging = false
      keySpin.left = keySpin.right = keySpin.up = keySpin.down = false
    },
    update(time, delta) {
      if (!root.visible) return

      // Keyboard spin — bring any subject to the front immediately.
      if (!dragging && !flying) {
        const spinSpeed = 1.6
        if (keySpin.left) yaw -= spinSpeed * delta
        if (keySpin.right) yaw += spinSpeed * delta
        if (keySpin.up) pitch -= spinSpeed * delta
        if (keySpin.down) pitch += spinSpeed * delta
        pitch = Math.max(-1.05, Math.min(1.05, pitch))
        if (keySpin.left || keySpin.right || keySpin.up || keySpin.down) {
          applyTurntable()
        }
      }

      wire.rotation.y = time * 0.04

      for (const pin of pinMeshes) {
        const pulse = 0.18 * Math.sin(time * 3 + pin.id)
        if (pin !== hovering) {
          const base = pin.userData.subject.enabled ? 2.8 : 1.1
          pin.material.emissiveIntensity = base + pulse
        }
      }

      if (fly) {
        fly.t += delta / fly.duration
        const u = Math.min(fly.t, 1)
        const s = u * u * (3 - 2 * u)
        camera.position.lerpVectors(fly.startPos, fly.endPos, s)
        const look = new THREE.Vector3().lerpVectors(fly.startTarget, fly.endTarget, s)
        camera.lookAt(look)
        if (u >= 1) {
          const id = fly.subjectId
          fly = null
          flying = false
          document.body.style.cursor = ''
          onSelectSubject(id)
        }
      }
    },
    dispose() {
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      scene.remove(root)
    },
  }
}
