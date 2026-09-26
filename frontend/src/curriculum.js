/**
 * CS city curriculum (MVP) — one lesson + quiz per district.
 * Quiz correct indices live on the server (curriculum.py); client only shows choices.
 */

function svgDataUri(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const ML_IMG = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1224"/>
      <stop offset="100%" stop-color="#12203a"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#g)"/>
  <circle cx="180" cy="180" r="54" fill="none" stroke="#3de7ff" stroke-width="4"/>
  <circle cx="320" cy="120" r="36" fill="none" stroke="#ffb347" stroke-width="4"/>
  <circle cx="420" cy="220" r="48" fill="none" stroke="#34d399" stroke-width="4"/>
  <path d="M180 180 L320 120 L420 220 L180 180" fill="none" stroke="#e8eef8" stroke-width="2" opacity="0.7"/>
  <text x="320" y="320" text-anchor="middle" fill="#9aa8c7" font-family="Segoe UI,sans-serif" font-size="20">Neural net sketch</text>
</svg>`)

const WEB_IMG = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#0a1020"/>
  <rect x="120" y="70" width="400" height="220" rx="12" fill="#12182a" stroke="#3de7ff" stroke-width="3"/>
  <rect x="140" y="100" width="160" height="16" rx="4" fill="#3de7ff" opacity="0.85"/>
  <rect x="140" y="130" width="280" height="10" rx="3" fill="#5a6a88"/>
  <rect x="140" y="150" width="240" height="10" rx="3" fill="#5a6a88"/>
  <rect x="140" y="190" width="120" height="48" rx="6" fill="#ffb347"/>
  <text x="320" y="330" text-anchor="middle" fill="#9aa8c7" font-family="Segoe UI,sans-serif" font-size="20">Layout · style · interaction</text>
</svg>`)

const SEC_IMG = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#080d18"/>
  <path d="M320 70 l90 40 v70 c0 70 -50 110 -90 130 c-40 -20 -90 -60 -90 -130 v-70 z"
        fill="#152038" stroke="#ff4d8d" stroke-width="4"/>
  <circle cx="320" cy="170" r="22" fill="none" stroke="#ffb347" stroke-width="4"/>
  <rect x="308" y="170" width="24" height="40" rx="4" fill="#ffb347"/>
  <text x="320" y="330" text-anchor="middle" fill="#9aa8c7" font-family="Segoe UI,sans-serif" font-size="20">Protect the tower</text>
</svg>`)

export const CS_DISTRICTS = [
  {
    id: 'ml',
    label: 'Machine Learning',
    color: '#3de7ff',
    contentTopics: ['Features', 'Models', 'Training', 'Eval'],
  },
  {
    id: 'web',
    label: 'Web Dev',
    color: '#ffb347',
    contentTopics: ['HTML', 'CSS', 'JS', 'APIs'],
  },
  {
    id: 'security',
    label: 'Security',
    color: '#ff4d8d',
    contentTopics: ['Auth', 'Encryption', 'Threats', 'Defense'],
  },
]

export const LESSONS = {
  ml: {
    title: 'Intro to Machine Learning',
    slides: [
      {
        title: 'What is ML?',
        body: 'Machine learning lets computers find patterns in data instead of following only hand-written rules. You give examples; the model learns a mapping from inputs to useful outputs.',
      },
      {
        title: 'Train → predict',
        body: 'A typical loop: collect labeled data, train a model, measure error, then predict on new inputs. Features are the measurable inputs; labels are the answers you want.',
        image: ML_IMG,
      },
      {
        title: 'Why it matters here',
        body: 'In this district, each content tower is a topic (features, models, training, eval). Finish this lesson and the quiz to grow your learner tower.',
      },
    ],
    quiz: [
      {
        prompt: 'Machine learning models mainly learn from…',
        choices: ['Only hardcoded if-statements', 'Patterns in example data', 'Random guessing alone'],
      },
      {
        prompt: 'Features are…',
        choices: ['The final accuracy score', 'The output labels only', 'Input measurements the model uses'],
      },
      {
        prompt: 'After training, we usually…',
        choices: ['Evaluate on held-out data', 'Delete the model', 'Ignore prediction error'],
      },
    ],
  },
  web: {
    title: 'Intro to Web Dev',
    slides: [
      {
        title: 'Three layers',
        body: 'Web pages combine structure (HTML), appearance (CSS), and behavior (JavaScript). Together they turn documents into interactive apps.',
      },
      {
        title: 'Talking to servers',
        body: 'Browsers fetch data from APIs (often JSON over HTTP). Your UI then renders that data — search, maps, quizzes, and live feeds all follow this pattern.',
        image: WEB_IMG,
      },
      {
        title: 'Build in public',
        body: 'This district’s towers mark core web skills. Complete the lesson and quiz to raise your learner tower on the plot.',
      },
    ],
    quiz: [
      {
        prompt: 'HTML’s main job is…',
        choices: ['Structure and meaning of content', 'Only animating 3D scenes', 'Storing passwords'],
      },
      {
        prompt: 'CSS is primarily for…',
        choices: ['Database queries', 'Visual layout and style', 'Encrypting traffic'],
      },
      {
        prompt: 'A typical web API response format is…',
        choices: ['Raw binary GPU shaders', 'SQL table locks', 'JSON over HTTP'],
      },
    ],
  },
  security: {
    title: 'Intro to Security',
    slides: [
      {
        title: 'Mindset',
        body: 'Security asks: who are you, what are you allowed to do, and how do we keep data safe if something goes wrong? Assume mistakes and adversaries exist.',
      },
      {
        title: 'Core ideas',
        body: 'Authentication proves identity. Authorization limits access. Encryption protects data in transit and at rest. Defense in depth stacks multiple controls.',
        image: SEC_IMG,
      },
      {
        title: 'Grow the shield',
        body: 'Finish this lesson and quiz to grow your Security learner tower — a visible record of what you’ve practiced.',
      },
    ],
    quiz: [
      {
        prompt: 'Authentication is about…',
        choices: ['Pretty UI themes', 'Compressing images', 'Proving who someone is'],
      },
      {
        prompt: 'Encryption mainly helps by…',
        choices: ['Making data unreadable without keys', 'Speeding up CSS', 'Removing the need for passwords forever'],
      },
      {
        prompt: 'Defense in depth means…',
        choices: ['One firewall is enough forever', 'Layering multiple protections', 'Never updating software'],
      },
    ],
  },
}
