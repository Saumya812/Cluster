/**
 * Lesson (3 slides) + quiz (3 MCQ) overlay for a CS district.
 */
import { LESSONS } from './curriculum.js'

export function createLessonQuiz({ onLessonComplete, onQuizComplete, onClose }) {
  const root = document.getElementById('lesson-panel')
  const titleEl = document.getElementById('lesson-title')
  const bodyEl = document.getElementById('lesson-body')
  const mediaEl = document.getElementById('lesson-media')
  const stepEl = document.getElementById('lesson-step')
  const choicesEl = document.getElementById('lesson-choices')
  const nextBtn = document.getElementById('lesson-next')
  const closeBtn = document.getElementById('lesson-close')
  const resultEl = document.getElementById('lesson-result')

  let districtId = null
  let mode = 'lesson' // lesson | quiz | done
  let slideIndex = 0
  let answers = []
  let selected = null
  let open = false

  function hide() {
    open = false
    root.hidden = true
    document.body.classList.remove('lesson-open')
    choicesEl.hidden = true
    resultEl.hidden = true
    mediaEl.hidden = true
    mediaEl.removeAttribute('src')
    onClose?.()
  }

  function show() {
    open = true
    root.hidden = false
    document.body.classList.add('lesson-open')
  }

  function renderLesson() {
    const lesson = LESSONS[districtId]
    const slide = lesson.slides[slideIndex]
    mode = 'lesson'
    titleEl.textContent = slide.title
    bodyEl.textContent = slide.body
    stepEl.textContent = `Lesson · ${slideIndex + 1} / ${lesson.slides.length}`
    choicesEl.hidden = true
    resultEl.hidden = true
    if (slide.image) {
      mediaEl.hidden = false
      mediaEl.src = slide.image
      mediaEl.alt = slide.title
    } else {
      mediaEl.hidden = true
      mediaEl.removeAttribute('src')
    }
    nextBtn.textContent = slideIndex < lesson.slides.length - 1 ? 'Next' : 'Start quiz'
    nextBtn.hidden = false
  }

  function renderQuiz() {
    const lesson = LESSONS[districtId]
    const q = lesson.quiz[slideIndex]
    mode = 'quiz'
    selected = null
    titleEl.textContent = q.prompt
    bodyEl.textContent = 'Choose one answer, then continue.'
    stepEl.textContent = `Quiz · ${slideIndex + 1} / ${lesson.quiz.length}`
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
    nextBtn.textContent = slideIndex < lesson.quiz.length - 1 ? 'Next question' : 'Submit quiz'
    nextBtn.hidden = false
  }

  function renderDone(result) {
    mode = 'done'
    choicesEl.hidden = true
    mediaEl.hidden = true
    titleEl.textContent = 'Tower updated'
    bodyEl.textContent = `Score ${Math.round(result.submitted_score ?? result.quiz_score)}% · ${result.correct_count}/${result.total} correct. Your learner tower is now height ${Math.round(result.tower_height)}.`
    stepEl.textContent = 'Progress saved'
    resultEl.hidden = false
    resultEl.textContent = `Quiz bonus applied for ≥75 / 85 / 90%. Best score kept: ${Math.round(result.quiz_score)}%.`
    nextBtn.textContent = 'Back to city'
    nextBtn.hidden = false
  }

  async function handleNext() {
    const lesson = LESSONS[districtId]
    if (!lesson) return

    if (mode === 'done') {
      hide()
      return
    }

    if (mode === 'lesson') {
      if (slideIndex < lesson.slides.length - 1) {
        slideIndex += 1
        renderLesson()
        return
      }
      // Finished slides → mark lesson complete, then quiz
      nextBtn.disabled = true
      try {
        const progress = await onLessonComplete?.(districtId)
        if (progress?.error) throw new Error(progress.error)
      } catch (err) {
        bodyEl.textContent = `Could not save lesson progress: ${err.message || err}`
        nextBtn.disabled = false
        return
      }
      nextBtn.disabled = false
      slideIndex = 0
      answers = []
      renderQuiz()
      return
    }

    if (mode === 'quiz') {
      if (selected === null) {
        bodyEl.textContent = 'Pick an answer before continuing.'
        return
      }
      answers[slideIndex] = selected
      if (slideIndex < lesson.quiz.length - 1) {
        slideIndex += 1
        renderQuiz()
        return
      }
      nextBtn.disabled = true
      try {
        const result = await onQuizComplete?.(districtId, answers)
        if (result?.error) throw new Error(result.error)
        renderDone(result)
      } catch (err) {
        bodyEl.textContent = `Could not submit quiz: ${err.message || err}`
      }
      nextBtn.disabled = false
    }
  }

  nextBtn.addEventListener('click', () => {
    handleNext()
  })
  closeBtn.addEventListener('click', () => hide())

  return {
    get isOpen() {
      return open
    },
    open(id) {
      if (!LESSONS[id]) return
      districtId = id
      slideIndex = 0
      answers = []
      selected = null
      show()
      renderLesson()
    },
    close: hide,
  }
}
