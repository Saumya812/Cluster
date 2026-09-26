/**
 * City picker cards — 4 educational cities.
 */
export const DISTRICT_CARDS = [
  {
    id: 'ml',
    label: 'Machine Learning',
    description: 'Supervised, unsupervised, neural nets & RL — each building is a topic.',
    enabled: true,
    accent: '#3de7ff',
  },
  {
    id: 'ai',
    label: 'Artificial Intelligence',
    description: 'Agents, language, vision, and reasoning towers across named AI streets.',
    enabled: true,
    accent: '#a78bfa',
  },
  {
    id: 'programming',
    label: 'Programming',
    description: 'Languages, data structures, systems, and craft as a dense skyline.',
    enabled: true,
    accent: '#ffb347',
  },
  {
    id: 'web',
    label: 'Web Development',
    description: 'Frontend, backend, APIs, and full-stack districts you can fly between.',
    enabled: true,
    accent: '#34d399',
  },
]

export const CITY_LABELS = Object.fromEntries(DISTRICT_CARDS.map((c) => [c.id, c.label]))
