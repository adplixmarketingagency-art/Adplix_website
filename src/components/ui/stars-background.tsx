import { useEffect, useRef } from 'react'
import { useAnimationSettings } from '../MotionPrimitives'
import { cn } from '@/lib/utils'

// Aceternity Stars Background, extended with depth, red nebulae and pointer interaction.
// https://ui.aceternity.com/components/shooting-stars-and-stars-background
type Star = { x: number; y: number; radius: number; opacity: number; phase: number; depth: number; red: boolean }
type Props = {
  starDensity?: number
  allStarsTwinkle?: boolean
  twinkleProbability?: number
  minTwinkleSpeed?: number
  maxTwinkleSpeed?: number
  className?: string
  interactive?: boolean
  paused?: boolean
}

export function StarsBackground({
  starDensity = 0.0006,
  allStarsTwinkle = true,
  twinkleProbability = 0.7,
  minTwinkleSpeed = 0.5,
  maxTwinkleSpeed = 1,
  className,
  interactive = true,
  paused = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { reducedMotion } = useAnimationSettings()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    const backdrop = document.createElement('canvas')
    const background = backdrop.getContext('2d')
    const host = canvas.closest<HTMLElement>('[data-space-interactive]') || canvas.parentElement!
    const pointer = { x: -1000, y: -1000, targetX: -1000, targetY: -1000, inside: false }
    let stars: Star[] = []
    let width = 1
    let height = 1
    let frame = 0
    let lastPaint = 0
    let visible = false
    let seed = 44
    const staticMode = paused || reducedMotion
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }

    function nebula(x: number, y: number, radius: number, opacity: number) {
      if (!background) return
      const glow = background.createRadialGradient(x, y, 0, x, y, radius)
      glow.addColorStop(0, `rgba(145, 24, 29, ${opacity})`)
      glow.addColorStop(0.3, `rgba(83, 13, 18, ${opacity * 0.55})`)
      glow.addColorStop(1, 'rgba(30, 0, 0, 0)')
      background.fillStyle = glow
      background.fillRect(0, 0, width, height)
    }

    function resize() {
      const bounds = canvas!.getBoundingClientRect()
      width = bounds.width || 1
      height = bounds.height || 1
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas!.width = Math.round(width * dpr)
      canvas!.height = Math.round(height * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      backdrop.width = Math.round(width)
      backdrop.height = Math.round(height)
      seed = 44
      const count = Math.min(950, Math.max(160, Math.round(width * height * starDensity)))
      stars = Array.from({ length: count }, () => ({
        x: random() * width,
        y: random() * height,
        radius: random() * 1.25 + 0.3,
        opacity: random() * 0.55 + 0.25,
        phase: random() * Math.PI * 2,
        depth: random() * 0.8 + 0.2,
        red: random() > 0.87,
      }))
      nebula(width * 0.79, height * 0.43, width * 0.38, 0.55)
      nebula(width * 0.59, height * 0.65, width * 0.24, 0.24)
      nebula(width * 0.97, height * 0.16, width * 0.22, 0.48)
      // A softly scattered galactic band, not a manufactured orbital wireframe.
      if (background) {
        for (let i = 0; i < 1000; i += 1) {
          const x = random() * width
          const y = height * (0.88 - (x / width) * 0.65) + (random() - 0.5) * height * 0.36
          background.fillStyle = `rgba(${random() > 0.5 ? '218, 173, 173' : '177, 62, 62'}, ${random() * 0.16})`
          background.fillRect(x, y, random() * 1.4 + 0.3, random() * 1.4 + 0.3)
        }
      }
      paint(0)
    }

    function paint(time: number) {
      ctx!.clearRect(0, 0, width, height)
      ctx!.drawImage(backdrop, 0, 0, width, height)
      const hovering = interactive && pointer.inside && !staticMode
      if (hovering) {
        pointer.x += (pointer.targetX - pointer.x) * 0.08
        pointer.y += (pointer.targetY - pointer.y) * 0.08
        const light = ctx!.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 210)
        light.addColorStop(0, 'rgba(239, 90, 90, 0.12)')
        light.addColorStop(1, 'rgba(239, 90, 90, 0)')
        ctx!.fillStyle = light
        ctx!.fillRect(0, 0, width, height)
      }
      const nearby: { x: number; y: number }[] = []
      for (const star of stars) {
        let x = star.x
        let y = star.y
        if (hovering) {
          x += ((pointer.x - width / 2) / width) * star.depth * 30
          y += ((pointer.y - height / 2) / height) * star.depth * 24
          const distance = Math.hypot(x - pointer.x, y - pointer.y)
          if (distance < 145) {
            const push = (1 - distance / 145) * 13
            x += ((x - pointer.x) / (distance || 1)) * push
            y += ((y - pointer.y) / (distance || 1)) * push
            if (nearby.length < 22) nearby.push({ x, y })
          }
        }
        const twinkles = allStarsTwinkle || star.depth < twinkleProbability
        const speed = minTwinkleSpeed + star.depth * (maxTwinkleSpeed - minTwinkleSpeed)
        const alpha =
          star.opacity * (staticMode || !twinkles ? 1 : 0.65 + Math.sin((time * 0.00065) / speed + star.phase) * 0.35)
        ctx!.beginPath()
        ctx!.arc(x, y, star.radius, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(${star.red ? '239, 124, 124' : '235, 235, 235'}, ${alpha})`
        ctx!.fill()
        if (star.radius > 1.25 && star.depth > 0.7) {
          ctx!.fillStyle = `rgba(255,255,255,${alpha * 0.17})`
          ctx!.fillRect(x - 4, y - 0.3, 8, 0.6)
          ctx!.fillRect(x - 0.3, y - 4, 0.6, 8)
        }
      }
      for (let i = 1; i < nearby.length; i += 1) {
        const a = nearby[i - 1]
        const b = nearby[i]
        if (Math.hypot(a.x - b.x, a.y - b.y) > 100) continue
        ctx!.beginPath()
        ctx!.moveTo(a.x, a.y)
        ctx!.lineTo(b.x, b.y)
        ctx!.strokeStyle = 'rgba(239, 170, 170, .22)'
        ctx!.lineWidth = 0.6
        ctx!.stroke()
      }
    }

    function animate(time: number) {
      frame = 0
      if (!visible || document.hidden || staticMode) return
      if (time - lastPaint >= 30) {
        paint(time)
        lastPaint = time
      }
      frame = requestAnimationFrame(animate)
    }
    function sync() {
      cancelAnimationFrame(frame)
      frame = 0
      if (visible && !document.hidden && !staticMode) frame = requestAnimationFrame(animate)
    }
    function move(event: PointerEvent) {
      if (event.pointerType !== 'mouse' || staticMode) return
      const bounds = canvas!.getBoundingClientRect()
      pointer.targetX = event.clientX - bounds.left
      pointer.targetY = event.clientY - bounds.top
      if (!pointer.inside) {
        pointer.x = pointer.targetX
        pointer.y = pointer.targetY
      }
      pointer.inside = true
    }
    function leave() {
      pointer.inside = false
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      sync()
    })
    observer.observe(canvas)
    host.addEventListener('pointermove', move)
    host.addEventListener('pointerleave', leave)
    document.addEventListener('visibilitychange', sync)
    resize()
    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      observer.disconnect()
      host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerleave', leave)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [
    starDensity,
    allStarsTwinkle,
    twinkleProbability,
    minTwinkleSpeed,
    maxTwinkleSpeed,
    interactive,
    paused,
    reducedMotion,
  ])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn('absolute inset-0 h-full w-full pointer-events-none', className)}
    />
  )
}
