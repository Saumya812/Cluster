/**
 * Building topic panel — ordered subtopics, then quiz (only after lectures).
 */
import { getBuilding } from './mlCurriculum.js'

export function createTopicPanel({ onSubtopicProgress, onQuizSubmit, onClose }) {
  const root = document.getElementById('topic-panel')
  const stepEl = document.getElementById('topic-step')
  const titleEl = document.getElementById('topic-title')
  const bodyEl = document.getElementById('topic-body')
  const mediaEl = document.getElementById('topic-media')
  const choicesEl = document.getElementById('topic-choices')
  const resultEl = document.getElementById('topic-result')
  const nextBtn = document.getElementById('topic-next')
  const closeBtn = document.getElementById('topic-close')
  const streetEl = document.getElementById('topic-street')

  let building = null
  let mode = 'lecture'
  let index = 0
  let answers = []
  let selected = null
  let open = false
  let subtopicsDone = 0

  function hide() {
    open = false
    root.hidden = true
    document.body.classList.remove('topic-open')
    choicesEl.hidden = true
    resultEl.hidden = true
    mediaEl.hidden = true
    onClose?.()
  }

  function show() {
    open = true
    root.hidden = false
    document.body.classList.add('topic-open')
  }

  function renderLecture() {
    mode = 'lecture'
    const sub = building.subtopics[index]
    streetEl.textContent = `${building.streetName} · ${building.name}`
    stepEl.textContent = `Subtopic · ${index + 1} / ${building.subtopics.length}`
    titleEl.textContent = sub.title
    bodyEl.textContent = sub.body
    choicesEl.hidden = true
    resultEl.hidden = true
    if (sub.image) {
      mediaEl.hidden = false
      mediaEl.src = sub.image
      mediaEl.alt = sub.title
    } else {
      mediaEl.hidden = true
      mediaEl.removeAttribute('src')
    }
    nextBtn.textContent =
      index >= building.subtopics.length - 1 ? 'Take Quiz' : 'Next subtopic'
    nextBtn.hidden = false
  }

  function renderQuiz() {
    mode = 'quiz'
    selected = null
    const q = building.quiz[index]
    streetEl.textContent = `${building.name} · Quiz`
    stepEl.textContent = `Quiz · ${index + 1} / ${building.quiz.length}`
    titleEl.textContent = q.prompt
    bodyEl.textContent = 'Choose one answer, then continue.'
    mediaEl.hidden = true
    resultEl.hidden = true
    choicesEl.hidden = false
    choicesEl.innerHTML = ''
    q.choices.forEach((choice, i) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'lesson-choice'
      btn.textContent = choice
      btn.addEventListener('click', () => {
        selected = i
        ;[...choicesEl.children].forEach((el) => el.classList.remove('selected'))
        btn.classList.add('selected')
      })
      choicesEl.appendChild(btn)
    })
    nextBtn.textContent =
      index < building.quiz.length - 1 ? 'Next question' : 'Submit quiz'
  }

  function renderDone(result) {
    mode = 'done'
    choicesEl.hidden = true
    mediaEl.hidden = true
    streetEl.textContent = building.name
    stepEl.textContent = 'Building complete'
    titleEl.textContent = 'Quiz scored'
    bodyEl.textContent = `You scored ${Math.round(result.submitted_score ?? result.quiz_score)}% (${result.correct_count}/${result.total}). The Growth Tower updates with your progress.`
    resultEl.hidden = false
    resultEl.textContent = `Best score kept: ${Math.round(result.quiz_score)}%`
    nextBtn.textContent = 'Back to city'
  }

  async function handleNext() {
    if (!building) return

    if (mode === 'done') {
      hide()
      return
    }

    if (mode === 'lecture') {
      const reached = index + 1
      nextBtn.disabled = true
      try {
        const prog = await onSubtopicProgress?.(building.id, reached)
        if (prog?.error) throw new Error(prog.error)
        subtopicsDone = Math.max(subtopicsDone, prog?.subtopics_done ?? reached)
      } catch (err) {
        bodyEl.textContent = `Could not save progress: ${err.message || err}`
        nextBtn.disabled = false
        return
      }
      nextBtn.disabled = false

      if (index < building.subtopics.length - 1) {
        index += 1
        renderLecture()
        return
      }

      if (subtopicsDone < building.subtopics.length) {
        bodyEl.textContent = 'Finish every subtopic before the quiz unlocks.'
        return
      }
      index = 0
      answers = []
      renderQuiz()
      return
    }

    if (mode === 'quiz') {
      if (selected === null) {
        bodyEl.textContent = 'Pick an answer before continuing.'
        return
      }
      answers[index] = selected
      if (index < building.quiz.length - 1) {
        index += 1
        renderQuiz()
        return
      }
      nextBtn.disabled = true
      try {
        const result = await onQuizSubmit?.(building.id, answers)
        if (result?.error) throw new Error(result.error)
        renderDone(result)
      } catch (err) {
        bodyEl.textContent = `Could not submit quiz: ${err.message || err}`
      }
      nextBtn.disabled = false
    }
  }

  nextBtn.addEventListener('click', () => handleNext())
  closeBtn.addEventListener('click', () => hide())

  return {
    get isOpen() {
      return open
    },
    open(buildingId, savedProgress) {
      building = getBuilding(buildingId)
      if (!building) return
      subtopicsDone = savedProgress?.subtopics_done || 0
      answers = []
      selected = null

      if (subtopicsDone >= building.subtopics.length && !(savedProgress?.quiz_score > 0)) {
        index = 0
        show()
        renderQuiz()
        return
      }

      index = Math.min(subtopicsDone, Math.max(building.subtopics.length - 1, 0))
      show()
      renderLecture()
    },
    close: hide,
  }
}
