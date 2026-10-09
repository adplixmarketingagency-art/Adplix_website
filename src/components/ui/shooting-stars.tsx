import { useEffect, useId, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useAnimationSettings } from '../MotionPrimitives'

// Aceternity Shooting Stars, with local bounds and cancellable scheduling.
// https://ui.aceternity.com/components/shooting-stars-and-stars-background
type Props = { minSpeed?: number; maxSpeed?: number; minDelay?: number; maxDelay?: number; starColor?: string; trailColor?: string; starWidth?: number; starHeight?: number; className?: string }
type Meteor = { id: number; x: number; y: number; endX: number; endY: number; duration: number }

export function ShootingStars({ minSpeed = 10, maxSpeed = 20, minDelay = 1800, maxDelay = 4500, starColor = '#ffffff', trailColor = '#ef4444', starWidth = 160, starHeight = 1.1, className }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gradientId = `meteor-${useId().replace(/:/g, '')}`
  const [meteor, setMeteor] = useState<Meteor | null>(null)
  const { reducedMotion } = useAnimationSettings()

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || reducedMotion) { setMeteor(null); return undefined }
    let timer: ReturnType<typeof setTimeout> | undefined
    let visible = false
    let serial = 0
    function schedule() {
      clearTimeout(timer)
      if (!visible || document.hidden) return
      timer = setTimeout(() => {
        if (!visible || document.hidden) return
        const bounds = svg!.getBoundingClientRect()
        const distance = Math.max(bounds.width * 0.65, 450)
        const x = Math.random() * bounds.width * 0.55 - 180
        const y = Math.random() * bounds.height * 0.45
        setMeteor({ id: ++serial, x, y, endX: x + distance, endY: y + distance * 0.45, duration: Math.max(1.2, distance / ((minSpeed + Math.random() * (maxSpeed - minSpeed)) * 55)) })
        schedule()
      }, minDelay + Math.random() * (maxDelay - minDelay))
    }
    function sync() { setMeteor(null); schedule() }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync() })
    observer.observe(svg)
    document.addEventListener('visibilitychange', sync)
    return () => { clearTimeout(timer); observer.disconnect(); document.removeEventListener('visibilitychange', sync) }
  }, [reducedMotion, minSpeed, maxSpeed, minDelay, maxDelay])

  return (
    <svg ref={svgRef} className={cn('shooting-stars', className)} aria-hidden="true">
      <defs><linearGradient id={gradientId}><stop offset="0%" stopColor={trailColor} stopOpacity="0" /><stop offset="80%" stopColor={trailColor} stopOpacity="0.7" /><stop offset="100%" stopColor={starColor} /></linearGradient></defs>
      {meteor && !reducedMotion && <motion.g key={meteor.id} initial={{ x: meteor.x, y: meteor.y, opacity: 0 }} animate={{ x: meteor.endX, y: meteor.endY, opacity: [0, 0.9, 0.9, 0] }} transition={{ duration: meteor.duration, ease: 'linear' }}><rect width={starWidth} height={starHeight} fill={`url(#${gradientId})`} transform="rotate(24)" rx="0.5" /></motion.g>}
    </svg>
  )
}
