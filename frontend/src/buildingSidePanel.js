/**
 * Right side panel — Reading / Videos / Research / Visualization / Quiz.
 */
export function createBuildingSidePanel({ cityId, onQuizComplete, onClose }) {
  const root = document.getElementById('building-side-panel')
  const titleEl = document.getElementById('bsp-title')
  const streetEl = document.getElementById('bsp-street')
  const tabsEl = document.getElementById('bsp-tabs')
  const bodyEl = document.getElementById('bsp-body')
  const playerWrap = document.getElementById('bsp-player-wrap')
  const playerFrame = document.getElementById('bsp-player')
  const openYtBtn = document.getElementById('bsp-open-yt')
  const closeBtn = document.getElementById('bsp-close')
  const backBtn = document.getElementById('bsp-back-list')

  let open = false
  let topic = null
  let activeTab = 'reading'
  let activeMediaUrl = ''
  let quizAnswers = []
  let quizQuestions = []
  let engagement = { quiz_unlocked: false }
  let loadSeq = 0
  const STALE = Symbol('stale')

  const TABS = [
    { id: 'reading', label: 'Reading' },
    { id: 'videos', label: 'Videos' },
    { id: 'papers', label: 'Research Papers' },
    { id: 'viz', label: 'Visualization' },
    { id: 'quiz', label: 'Quiz' },
  ]

  function hidePlayer() {
    playerWrap.hidden = true
    playerFrame.src = ''
    activeMediaUrl = ''
    bodyEl.hidden = false
  }

  function showPlayer(embedUrl, openUrl) {
    bodyEl.hidden = true
    playerWrap.hidden = false
    activeMediaUrl = openUrl
    playerFrame.src = embedUrl
  }

  function hide() {
    open = false
    root.classList.remove('is-open')
    root.setAttribute('aria-hidden', 'true')
    document.body.classList.remove('side-panel-open')
    hidePlayer()
    loadSeq += 1
    bodyEl.innerHTML = ''
    onClose?.()
  }

  function renderTabs() {
    tabsEl.innerHTML = ''
    for (const tab of TABS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `bsp-tab${tab.id === activeTab ? ' is-active' : ''}`
      btn.textContent = tab.label
      btn.addEventListener('click', () => {
        activeTab = tab.id
        hidePlayer()
        renderTabs()
        loadTab()
      })
      tabsEl.appendChild(btn)
    }
  }

  function cardLoading(msg) {
    return `<div class="bsp-card is-loading"><p>${msg}</p></div>`
  }

  function renderReading(results) {
    if (!results?.length) {
      bodyEl.innerHTML = `<div class="bsp-card is-fallback"><p>No results. <a href="https://www.google.com/search?q=${encodeURIComponent(topic.name + ' ' + topic.cityLabel)}" target="_blank" rel="noopener">Search on Google</a></p></div>`
      return
    }
    bodyEl.innerHTML = results
      .map(
        (r) => `
      <a class="bsp-card bsp-link-card" href="${r.link}" target="_blank" rel="noopener noreferrer" data-engage="reading">
        <span class="bsp-card-title">${r.title || 'Result'}</span>
        <span class="bsp-card-meta">${r.displayLink || ''}</span>
        <span class="bsp-card-snip">${r.snippet || ''}</span>
      </a>`,
      )
      .join('')
    bodyEl.querySelectorAll('[data-engage="reading"]').forEach((el) => {
      el.addEventListener('click', () => markEngage('reading'))
    })
  }

  function renderMediaCards(results, kind) {
    if (!results?.length) {
      const q = encodeURIComponent(`${topic.name} ${topic.cityLabel} tutorial`)
      bodyEl.innerHTML = `<div class="bsp-card is-fallback"><p>No media found.</p><a href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">Search on YouTube</a></div>`
      return
    }
    bodyEl.innerHTML = ''
    for (const item of results) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'bsp-card bsp-media-card'
      const count =
        item.kind === 'playlist' && item.videoCount != null
          ? `${item.videoCount} videos`
          : item.kind === 'video'
            ? 'Video'
            : 'Playlist'
      btn.innerHTML = `
        <img class="bsp-yt-thumb" src="${item.thumbnail || ''}" alt="" loading="lazy" />
        <span class="bsp-yt-meta">
          <span class="bsp-yt-title">${item.title || ''}</span>
          <span class="bsp-yt-channel">${item.channelTitle || ''}</span>
          <span class="bsp-yt-count">${count}</span>
        </span>`
      btn.addEventListener('click', () => {
        markEngage('video')
        if (item.playlistId) {
          showPlayer(
            `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(item.playlistId)}`,
            item.url,
          )
        } else if (item.videoId) {
          showPlayer(
            `https://www.youtube.com/embed/${encodeURIComponent(item.videoId)}`,
            item.url,
          )
        }
      })
      bodyEl.appendChild(btn)
    }
  }

  function renderPapers(results) {
    if (!results?.length) {
      bodyEl.innerHTML = `<div class="bsp-card is-fallback"><p>No Arxiv papers found.</p><a href="https://arxiv.org/search/?query=${encodeURIComponent(topic.name)}&searchtype=all" target="_blank" rel="noopener">Search Arxiv</a></div>`
      return
    }
    bodyEl.innerHTML = results
      .map(
        (p) => `
      <a class="bsp-card bsp-link-card" href="${p.link}" target="_blank" rel="noopener noreferrer">
        <span class="bsp-card-title">${p.title || 'Paper'}</span>
        <span class="bsp-card-meta">${(p.authors || []).slice(0, 3).join(', ')}</span>
        <span class="bsp-card-snip">${p.summary || ''}</span>
      </a>`,
      )
      .join('')
  }

  function renderQuiz(questions) {
    quizQuestions = questions
    quizAnswers = questions.map(() => null)
    bodyEl.innerHTML = ''
    if (!questions.length) {
      bodyEl.innerHTML = `<div class="bsp-card is-fallback"><p>No quiz available for this topic yet.</p></div>`
      return
    }

    const intro = document.createElement('div')
    intro.className = 'bsp-quiz-intro'
    intro.innerHTML = `
      <span class="bsp-quiz-kicker">Topic quiz</span>
      <span class="bsp-quiz-topic"></span>
      <span class="bsp-quiz-progress"></span>`
    intro.querySelector('.bsp-quiz-topic').textContent = topic.name
    const progressEl = intro.querySelector('.bsp-quiz-progress')
    const updateProgress = () => {
      const answered = quizAnswers.filter((a) => a !== null).length
      progressEl.textContent = `${answered} / ${questions.length} answered`
    }
    updateProgress()
    if (!engagement.quiz_unlocked) {
      const tip = document.createElement('span')
      tip.className = 'bsp-quiz-tip'
      tip.textContent = 'Tip: skim the Reading or Videos tab first if this topic is new to you.'
      intro.appendChild(tip)
    }
    bodyEl.appendChild(intro)

    const blocks = questions.map((q, qi) => {
      const block = document.createElement('section')
      block.className = 'bsp-quiz-q'
      const prompt = document.createElement('p')
      prompt.className = 'bsp-card-title'
      prompt.textContent = `${qi + 1}. ${q.prompt}`
      block.appendChild(prompt)
      const choices = document.createElement('div')
      choices.className = 'bsp-quiz-choices'
      ;(q.choices || []).forEach((c, ci) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'lesson-choice'
        b.textContent = c
        b.addEventListener('click', () => {
          quizAnswers[qi] = ci
          ;[...choices.children].forEach((el) => el.classList.remove('selected'))
          b.classList.add('selected')
          updateProgress()
        })
        choices.appendChild(b)
      })
      block.appendChild(choices)
      bodyEl.appendChild(block)
      return { block, choices }
    })

    const submit = document.createElement('button')
    submit.type = 'button'
    submit.className = 'bsp-open-yt'
    submit.textContent = 'Submit quiz'
    submit.addEventListener('click', async () => {
      if (quizAnswers.some((a) => a === null)) {
        submit.textContent = 'Answer all questions first'
        return
      }
      submit.disabled = true
      submit.textContent = 'Scoring…'
      try {
        const res = await fetch('/api/quiz/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: topic.name,
            city: topic.cityId,
            building_id: topic.id,
            answers: quizAnswers,
          }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        showQuizReview(data, blocks, intro, submit)
        onQuizComplete?.(data)
      } catch (err) {
        submit.disabled = false
        submit.textContent = `Error: ${err.message || err}`
      }
    })
    bodyEl.appendChild(submit)
  }

  function showQuizReview(data, blocks, intro, submit) {
    const score = Math.round(data.submitted_score)
    const passed = score >= 60
    const summary = document.createElement('div')
    summary.className = `bsp-quiz-summary ${passed ? 'is-pass' : 'is-retry'}`
    summary.innerHTML = `
      <span class="bsp-quiz-score">${score}%</span>
      <span class="bsp-quiz-verdict"></span>`
    summary.querySelector('.bsp-quiz-verdict').textContent =
      `${data.correct_count}/${data.total} correct · Growth Tower updated.` +
      (passed ? '' : ' Read the explanations and retake to raise your best score.')
    intro.replaceWith(summary)

    ;(data.review || []).forEach((item, qi) => {
      const { block, choices } = blocks[qi] || {}
      if (!block) return
      const picked = quizAnswers[qi]
      block.classList.add(picked === item.correct ? 'is-right' : 'is-wrong')
      ;[...choices.children].forEach((btn, ci) => {
        btn.disabled = true
        btn.classList.remove('selected')
        if (ci === item.correct) btn.classList.add('is-correct')
        else if (ci === picked) btn.classList.add('is-incorrect')
      })
      if (item.explanation) {
        const why = document.createElement('p')
        why.className = 'bsp-quiz-why'
        why.textContent = item.explanation
        block.appendChild(why)
      }
    })

    const retake = document.createElement('button')
    retake.type = 'button'
    retake.className = 'bsp-open-yt'
    retake.textContent = 'Retake quiz'
    retake.addEventListener('click', () => renderQuiz(quizQuestions))
    submit.replaceWith(retake)
    bodyEl.scrollTop = 0
  }

  async function markEngage(kind) {
    try {
      const res = await fetch('/api/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: topic.cityId,
          building_id: topic.id,
          kind,
        }),
      })
      engagement = await res.json()
    } catch {
      /* ignore */
    }
  }

  async function loadTab() {
    if (!topic) return
    const cityLabel = topic.cityLabel || topic.cityId
    bodyEl.innerHTML = cardLoading('Loading…')
    // Responses can arrive after the user switched tabs/topics; drop those.
    const seq = ++loadSeq
    const getJson = async (url) => {
      const data = await fetch(url).then((r) => r.json())
      if (seq !== loadSeq) throw STALE
      return data
    }

    try {
      if (activeTab === 'reading') {
        const q = `${topic.name} ${cityLabel}`
        const data = await getJson(`/api/search?query=${encodeURIComponent(q)}`)
        renderReading(data.results || [])
      } else if (activeTab === 'videos') {
        const q = `${topic.name} ${cityLabel} tutorial`
        const data = await getJson(
          `/api/youtube?type=playlist&limit=3&query=${encodeURIComponent(q)}`,
        )
        renderMediaCards(data.results || (data.playlistId ? [data] : []), 'playlist')
      } else if (activeTab === 'papers') {
        const q = `${topic.name} ${cityLabel}`
        const data = await getJson(`/api/papers?query=${encodeURIComponent(q)}`)
        renderPapers(data.results || [])
      } else if (activeTab === 'viz') {
        const q = `${topic.name} visualization simulation`
        const data = await getJson(
          `/api/youtube?type=video&limit=2&query=${encodeURIComponent(q)}`,
        )
        renderMediaCards(data.results || [], 'video')
      } else if (activeTab === 'quiz') {
        const eng = await getJson(
          `/api/engagement?city=${encodeURIComponent(topic.cityId)}&building_id=${encodeURIComponent(topic.id)}`,
        )
        engagement = eng
        const params = new URLSearchParams({
          topic: topic.name,
          city: topic.cityId || 'ml',
          building_id: topic.id,
        })
        const data = await getJson(`/api/quiz?${params}`)
        renderQuiz(data.questions || [])
      }
    } catch (err) {
      if (err === STALE) return
      bodyEl.innerHTML = `<div class="bsp-card is-fallback"><p>${err.message || err}</p></div>`
    }
  }

  closeBtn.addEventListener('click', () => hide())
  backBtn.addEventListener('click', () => hidePlayer())
  openYtBtn.addEventListener('click', () => {
    if (activeMediaUrl) window.open(activeMediaUrl, '_blank', 'noopener,noreferrer')
  })

  return {
    get isOpen() {
      return open
    },
    setCity() {
      /* city passed per open */
    },
    open(topicData) {
      topic = topicData
      open = true
      activeTab = 'reading'
      titleEl.textContent = topic.name
      streetEl.textContent = `${topic.streetName || ''} · ${topic.cityLabel || topic.cityId}`
      hidePlayer()
      renderTabs()
      root.classList.add('is-open')
      root.setAttribute('aria-hidden', 'false')
      document.body.classList.add('side-panel-open')
      loadTab()
    },
    close: hide,
  }
}
