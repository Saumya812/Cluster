/**
 * Screen 1 — District / city picker after entering CS.
 * Four educational cities share the same layout system.
 */
import { DISTRICT_CARDS } from './cities.js'

export function createDistrictPicker({ onSelectDistrict, onBack }) {
  const root = document.getElementById('district-picker')
  const grid = document.getElementById('district-picker-grid')
  const backBtn = document.getElementById('district-picker-back')

  grid.innerHTML = ''
  for (const card of DISTRICT_CARDS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `district-card${card.enabled ? '' : ' is-locked'}`
    btn.style.setProperty('--card-accent', card.accent)
    btn.dataset.district = card.id
    btn.innerHTML = `
      <span class="district-card-sky" aria-hidden="true"></span>
      <span class="district-card-name">${card.label}</span>
      <span class="district-card-desc">${card.description}</span>
      <span class="district-card-cta">${card.enabled ? 'Enter city →' : 'Coming soon'}</span>
    `
    btn.addEventListener('click', () => {
      if (!card.enabled) return
      onSelectDistrict?.(card.id)
    })
    grid.appendChild(btn)
  }

  backBtn?.addEventListener('click', () => onBack?.())

  return {
    show() {
      root.hidden = false
      document.body.classList.add('picker-open')
    },
    hide() {
      root.hidden = true
      document.body.classList.remove('picker-open')
    },
    get isOpen() {
      return !root.hidden
    },
  }
}
