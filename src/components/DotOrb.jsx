import { useEffect, useRef } from 'react'
import { useAnimationSettings } from './MotionPrimitives'
import { stepDotPhysics } from './dot-orb-physics'

function makeDots(count) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (i / (count - 1)) * 2
    const ring = Math.sqrt(1 - y * y)
    return {
      x: Math.cos(i * goldenAngle) * ring,
      y,
      z: Math.sin(i * goldenAngle) * ring,
      red: i % 7 === 0,
      offsetX: 0,
      offsetY: 0,
      velocityX: 0,
      velocityY: 0,
    }
  })
}

export default function DotOrb() {
  const ref = useRef(null)
  const { reducedMotion } = useAnimationSettings()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    const host = canvas.closest('[data-space-interactive]')
    let dots = []
    let pointer = null
    let width = 1
    let height = 1
    let frame = 0
    let lastFrame = null
    let time = 0
    let visible = false

    function resetDots() {
      for (const dot of dots) {
        dot.offsetX = 0
        dot.offsetY = 0
        dot.velocityX = 0
        dot.velocityY = 0
      }
    }

    function paint(dt = 0) {
      const yaw = 0.3 + time * 0.12
      const pitch = -0.15
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw)
      const cosX = Math.cos(pitch), sinX = Math.sin(pitch)
      const radius = Math.min(width, height) * 0.4 * (1 + Math.sin(time * 0.65) * 0.018)
      ctx.clearRect(0, 0, width, height)
      for (const dot of dots) {
        const x = dot.x * cosY + dot.z * sinY
        const rotatedZ = dot.z * cosY - dot.x * sinY
        const y = dot.y * cosX - rotatedZ * sinX
        const z = dot.y * sinX + rotatedZ * cosX
        const perspective = 3 / (3 - z * 0.35)
        const depth = (z + 1) / 2
        const alpha = 0.08 + Math.pow(depth, 1.8) * 0.8
        const size = (0.6 + depth * 1.05) * Math.max(0.65, Math.min(1, width / 500))
        const baseX = width / 2 + x * radius * perspective
        const baseY = height / 2 + y * radius * perspective
        if (dt > 0) {
          const next = stepDotPhysics(dot, baseX, baseY, pointer, dt)
          dot.offsetX = next.offsetX
          dot.offsetY = next.offsetY
          dot.velocityX = next.velocityX
          dot.velocityY = next.velocityY
        }
        ctx.beginPath()
        ctx.arc(baseX + dot.offsetX, baseY + dot.offsetY, size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${dot.red ? '239, 89, 99' : '227, 227, 227'}, ${alpha})`
        ctx.fill()
      }
    }

    function animate(now) {
      frame = 0
      if (!visible || document.hidden || reducedMotion) return
      if (lastFrame === null || now - lastFrame >= 30) {
        const dt = lastFrame === null ? 0 : Math.min((now - lastFrame) / 1000, 0.05)
        time += dt
        paint(dt)
        lastFrame = now
      }
      frame = requestAnimationFrame(animate)
    }
    function sync() {
      cancelAnimationFrame(frame)
      frame = 0
      lastFrame = null
      if (visible && !document.hidden && !reducedMotion) {
        frame = requestAnimationFrame(animate)
      } else {
        pointer = null
        resetDots()
      }
    }
    function resize() {
      const bounds = canvas.getBoundingClientRect()
      width = bounds.width || 1
      height = bounds.height || 1
      const scale = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      const count = Math.round(Math.max(720, Math.min(1100, width * 2.2)))
      if (dots.length !== count) dots = makeDots(count)
      // Resizing changes the projected positions, so start with the assembled sphere.
      pointer = null
      resetDots()
      paint()
    }
    function move(event) {
      if (reducedMotion || !visible || document.hidden || event.pointerType !== 'mouse') {
        pointer = null
        return
      }
      // The hero may parallax/scale independently of the canvas's CSS dimensions.
      const bounds = canvas.getBoundingClientRect()
      const x = event.clientX - bounds.left
      const y = event.clientY - bounds.top
      pointer = x >= 0 && y >= 0 && x < bounds.width && y < bounds.height
        ? { x: x * width / bounds.width, y: y * height / bounds.height }
        : null
    }
    function leave() { pointer = null }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync() })
    observer.observe(canvas)
    host?.addEventListener('pointermove', move)
    host?.addEventListener('pointerleave', leave)
    window.addEventListener('blur', leave)
    document.addEventListener('visibilitychange', sync)
    resize()
    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      observer.disconnect()
      host?.removeEventListener('pointermove', move)
      host?.removeEventListener('pointerleave', leave)
      window.removeEventListener('blur', leave)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [reducedMotion])

  return <canvas ref={ref} className="space-dot-orb" aria-hidden="true" />
}
