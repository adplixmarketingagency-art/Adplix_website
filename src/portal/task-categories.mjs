export const TASK_CATEGORIES = Object.freeze([
  { key: 'shooting', label: 'Shooting / Production' },
  { key: 'video-editing', label: 'Video Editing' },
  { key: 'canva-poster', label: 'Canva Poster' },
  { key: 'instagram', label: 'Instagram Publishing' },
  { key: 'website-development', label: 'Website Development' },
  { key: 'website-maintenance', label: 'Website Maintenance' },
  { key: 'other', label: 'Other' },
])

export function taskCategory(value) {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  let key = 'other'
  if (/^(shoot|shooting|production|shooting production|video production|filming|videography)$/.test(text))
    key = 'shooting'
  else if (/^(edit|editing|video edit|video editing|video editor|video edits|video post production)$/.test(text))
    key = 'video-editing'
  else if (/^(canva|canva design|canva poster|poster|posters|poster design|graphic design|graphics)$/.test(text))
    key = 'canva-poster'
  else if (
    /^(instagram|instagram publishing|instagram posting|instagram posts|instagram management|social media publishing)$/.test(
      text,
    )
  )
    key = 'instagram'
  else if (/^(website development|web development|website developer|web developer|site development)$/.test(text))
    key = 'website-development'
  else if (/^(website maintenance|web maintenance|site maintenance|website upkeep)$/.test(text))
    key = 'website-maintenance'
  return TASK_CATEGORIES.find((category) => category.key === key)
}
