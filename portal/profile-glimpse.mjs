import { validateProfilePhoto } from '../src/portal/profile-photo.mjs'

const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  )

/** An inline name trigger. The host may include this in its escaped HTML templates. */
export function profileName(id, name) {
  return `<button type="button" class="profile-name" data-profile-id="${escapeHtml(id)}" aria-haspopup="dialog" aria-expanded="false">${escapeHtml(name)}</button>`
}

/** Only a small, structurally valid, locally stored JPEG may be used as an image source. */
export function safeProfilePhoto(value) {
  try {
    return validateProfilePhoto(value)
  } catch {
    return null
  }
}

/** Viewport coordinates for a floating card, including the above-anchor fallback. */
export function profileGlimpsePosition(anchor, width, height, viewportWidth, viewportHeight) {
  const margin = 8
  const gap = 8
  const left = Math.max(margin, Math.min(anchor.left, viewportWidth - width - margin))
  const below = viewportHeight - anchor.bottom - margin - gap
  const above = anchor.top - margin - gap
  const flip = below < height && above > below
  const top = flip ? anchor.top - height - gap : anchor.bottom + gap
  return {
    left,
    top: Math.max(margin, Math.min(top, viewportHeight - height - margin)),
  }
}

const text = (value) => (typeof value === 'string' ? value : '')
const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toLocaleUpperCase())
    .join('') || '?'

/** Installs delegated profile-name interactions on a stable application root. */
export function installProfileGlimpses({ root, getProfiles }) {
  if (!root || typeof root.addEventListener !== 'function' || typeof getProfiles !== 'function') {
    throw new TypeError('A root element and getProfiles function are required.')
  }
  const doc = root.ownerDocument
  const win = doc.defaultView
  let source = null
  let card = null
  let dialog = null
  let photoTrigger = null
  let openingTimer = null
  let closingTimer = null
  let destroyed = false
  let suppressRestoredFocus = false

  const cancelOpening = () => {
    win.clearTimeout(openingTimer)
    openingTimer = null
  }
  const cancelClosing = () => {
    win.clearTimeout(closingTimer)
    closingTimer = null
  }
  const trigger = (target) => {
    const button = target?.closest?.('button[data-profile-id]')
    return button && root.contains(button) ? button : null
  }
  const memberFor = (button) => {
    const profiles = getProfiles()
    return Array.isArray(profiles)
      ? profiles.find((profile) => profile && String(profile.id) === button.dataset.profileId)
      : null
  }
  const place = () => {
    if (!source || !card) return
    const width = card.offsetWidth
    const height = card.offsetHeight
    const { left, top } = profileGlimpsePosition(
      source.getBoundingClientRect(),
      width,
      height,
      win.innerWidth,
      win.innerHeight,
    )
    card.style.left = `${left}px`
    card.style.top = `${top}px`
  }
  const photoButton = () => card?.querySelector('.profile-glimpse__photo-button')
  const closeButton = () => card?.querySelector('.profile-glimpse__close')

  const render = (member) => {
    const name = text(member.name)
    const photo = safeProfilePhoto(member.photoDataUrl)
    card.setAttribute('aria-label', `Profile of ${name}`)
    card.querySelector('.profile-glimpse__name').textContent = name
    card.querySelector('.profile-glimpse__role').textContent = text(member.role) || 'Role not listed'
    card.querySelector('.profile-glimpse__designation').textContent =
      text(member.designation) || 'Designation not listed'
    const types = Array.isArray(member.jobFunctions)
      ? member.jobFunctions.filter((item) => typeof item === 'string' && item.trim())
      : []
    card.querySelector('.profile-glimpse__functions').textContent = types.join(' · ') || 'No work types listed'
    const inactive = card.querySelector('.profile-glimpse__inactive')
    inactive.hidden = member.active !== false
    const avatar = card.querySelector('.profile-glimpse__initials')
    avatar.textContent = initials(name)
    avatar.hidden = Boolean(photo)
    const button = photoButton()
    button.hidden = !photo
    const image = button.querySelector('img')
    if (photo) image.src = photo
    else image.removeAttribute('src')
    if (dialog?.open) {
      if (photo) dialog.querySelector('img').src = photo
      else dialog.close()
    }
    place()
  }

  function close({ restoreFocus = false } = {}) {
    cancelOpening()
    cancelClosing()
    if (dialog?.open) dialog.close()
    dialog?.remove()
    dialog = null
    photoTrigger = null
    const previous = source
    if (previous) previous.setAttribute('aria-expanded', 'false')
    card?.remove()
    card = null
    source = null
    if (restoreFocus && previous?.isConnected && root.contains(previous)) {
      // Restoring focus must not reopen a card that was just explicitly dismissed.
      suppressRestoredFocus = true
      previous.focus()
      win.queueMicrotask(() => {
        suppressRestoredFocus = false
      })
    }
  }

  const dismissSoon = () => {
    cancelClosing()
    closingTimer = win.setTimeout(() => {
      if (dialog?.open) return
      // Pointer travel from the trigger to the card and vice versa must not dismiss it.
      if (card?.matches(':hover') || source?.matches(':hover')) return
      if (card?.contains(doc.activeElement) || source === doc.activeElement) return
      close()
    }, 160)
  }

  const makeCard = () => {
    card = doc.createElement('section')
    card.className = 'profile-glimpse'
    card.setAttribute('role', 'dialog')
    card.innerHTML =
      '<div class="profile-glimpse__top"><span class="profile-glimpse__eyebrow">Team profile</span><button type="button" class="profile-glimpse__close" aria-label="Close profile card">×</button></div>' +
      '<div class="profile-glimpse__identity"><span class="profile-glimpse__initials" aria-hidden="true"></span><button type="button" class="profile-glimpse__photo-button" aria-label="View profile photo" hidden><img alt=""></button><div class="profile-glimpse__heading"><strong class="profile-glimpse__name"></strong><span class="profile-glimpse__role"></span></div></div>' +
      '<dl class="profile-glimpse__details"><div><dt>Designation</dt><dd class="profile-glimpse__designation"></dd></div><div><dt>Work types</dt><dd class="profile-glimpse__functions"></dd></div></dl><span class="profile-glimpse__inactive" hidden>Inactive account</span>'
    card.addEventListener('pointerenter', cancelClosing)
    card.addEventListener('pointerleave', dismissSoon)
    card.addEventListener('focusin', cancelClosing)
    card.addEventListener('focusout', (event) => {
      if (!card.contains(event.relatedTarget) && event.relatedTarget !== source) dismissSoon()
    })
    card.addEventListener('click', (event) => {
      if (event.target.closest('.profile-glimpse__close')) close({ restoreFocus: true })
      else if (event.target.closest('.profile-glimpse__photo-button')) openPhoto()
    })
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return
      if (event.shiftKey && doc.activeElement === photoButton() && !photoButton().hidden) {
        event.preventDefault()
        source?.focus()
        return
      }
      if (event.shiftKey && doc.activeElement === closeButton()) {
        event.preventDefault()
        if (photoButton().hidden) source?.focus()
        else photoButton().focus()
        return
      }
      if (!event.shiftKey && doc.activeElement === photoButton()) {
        event.preventDefault()
        closeButton().focus()
        return
      }
      if (!event.shiftKey && doc.activeElement === closeButton()) {
        const candidates = [
          ...doc.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        ]
        const next = candidates
          .slice(candidates.indexOf(source) + 1)
          .find(
            (node) =>
              node !== source &&
              !card.contains(node) &&
              !node.disabled &&
              !node.hidden &&
              node.tabIndex >= 0 &&
              !node.closest('[inert]') &&
              node.getClientRects().length,
          )
        if (next) {
          event.preventDefault()
          next.focus()
          close()
        }
      }
    })
    doc.body.append(card)
  }

  const open = (button, enter = false) => {
    if (destroyed || !root.isConnected || !button.isConnected) return
    const member = memberFor(button)
    if (!member) {
      close()
      return
    }
    cancelOpening()
    cancelClosing()
    if (source !== button) {
      close()
      source = button
      source.setAttribute('aria-expanded', 'true')
      makeCard()
    }
    render(member)
    if (enter) (photoButton().hidden ? closeButton() : photoButton()).focus()
  }

  const openPhoto = () => {
    if (!card || !source) return
    const photo = safeProfilePhoto(memberFor(source)?.photoDataUrl)
    if (!photo) return
    cancelClosing()
    photoTrigger = photoButton()
    dialog = doc.createElement('dialog')
    dialog.className = 'profile-photo-dialog'
    dialog.setAttribute('aria-label', `Photo of ${text(memberFor(source)?.name)}`)
    const image = doc.createElement('img')
    image.src = photo
    image.alt = `Photo of ${text(memberFor(source)?.name)}`
    const button = doc.createElement('button')
    button.type = 'button'
    button.className = 'profile-photo-dialog__close'
    button.setAttribute('aria-label', 'Close profile photo')
    button.textContent = 'Close'
    dialog.append(button, image)
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target === button) dialog.close()
    })
    dialog.addEventListener('close', () => {
      const target = photoTrigger?.isConnected && !photoTrigger.hidden ? photoTrigger : source
      dialog?.remove()
      dialog = null
      photoTrigger = null
      if (target?.isConnected) target.focus()
    })
    doc.body.append(dialog)
    dialog.showModal()
    button.focus()
  }

  function sync() {
    if (destroyed || !source) return
    if (!root.isConnected || !source.isConnected || !root.contains(source)) {
      close()
      return
    }
    const member = memberFor(source)
    if (!member) close()
    else render(member)
  }

  const onPointerOver = (event) => {
    const button = trigger(event.target)
    if (!button || button.contains(event.relatedTarget) || event.pointerType === 'touch') return
    cancelOpening()
    cancelClosing()
    if (source === button) return
    openingTimer = win.setTimeout(() => open(button), 220)
  }
  const onPointerOut = (event) => {
    const button = trigger(event.target)
    if (!button || button.contains(event.relatedTarget)) return
    cancelOpening()
    if (source === button) dismissSoon()
  }
  const onFocusIn = (event) => {
    const button = trigger(event.target)
    if (button && !suppressRestoredFocus) open(button)
  }
  const onFocusOut = (event) => {
    if (event.target === source && !card?.contains(event.relatedTarget)) dismissSoon()
  }
  const onClick = (event) => {
    const button = trigger(event.target)
    if (button) open(button, true)
  }
  const onKeyDown = (event) => {
    if (event.key === 'Escape' && card && !dialog?.open) {
      event.preventDefault()
      close({ restoreFocus: true })
    } else if (event.key === 'Tab' && !event.shiftKey && event.target === source && card) {
      event.preventDefault()
      ;(photoButton().hidden ? closeButton() : photoButton()).focus()
    }
  }
  const onOutside = (event) => {
    if (card && !card.contains(event.target) && !source?.contains(event.target) && !dialog?.contains(event.target))
      close()
  }
  const onViewport = () => {
    if (card) place()
  }

  root.addEventListener('pointerover', onPointerOver)
  root.addEventListener('pointerout', onPointerOut)
  root.addEventListener('focusin', onFocusIn)
  root.addEventListener('focusout', onFocusOut)
  root.addEventListener('click', onClick)
  doc.addEventListener('keydown', onKeyDown)
  doc.addEventListener('pointerdown', onOutside)
  win.addEventListener('resize', onViewport)
  win.addEventListener('scroll', onViewport, true)
  const observer = new win.MutationObserver(sync)
  observer.observe(root, { childList: true, subtree: true })
  if (root.parentNode) observer.observe(root.parentNode, { childList: true })

  return {
    sync,
    close: () => close(),
    destroy() {
      if (destroyed) return
      destroyed = true
      observer.disconnect()
      close()
      root.removeEventListener('pointerover', onPointerOver)
      root.removeEventListener('pointerout', onPointerOut)
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('focusout', onFocusOut)
      root.removeEventListener('click', onClick)
      doc.removeEventListener('keydown', onKeyDown)
      doc.removeEventListener('pointerdown', onOutside)
      win.removeEventListener('resize', onViewport)
      win.removeEventListener('scroll', onViewport, true)
    },
  }
}
