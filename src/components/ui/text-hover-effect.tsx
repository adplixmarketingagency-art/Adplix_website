import { useId, useRef, type PointerEvent } from 'react'
import { motion, useMotionValue, useSpring } from 'motion/react'
import { useAnimationSettings } from '../MotionPrimitives'

// Adapted from Aceternity UI's Text Hover Effect:
// https://ui.aceternity.com/registry/text-hover-effect.json
// The radial mask follows pointer motion values without rerendering on every frame.
export function TextHoverEffect({ text, className = '' }: { text: string; className?: string }) {
  const id = useId().replace(/:/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const { reducedMotion } = useAnimationSettings()
  const x = useMotionValue(500)
  const y = useMotionValue(80)
  const cx = useSpring(x, { stiffness: 190, damping: 30 })
  const cy = useSpring(y, { stiffness: 190, damping: 30 })
  const textProps = {
    x: '50%',
    y: '54%',
    textAnchor: 'middle' as const,
    dominantBaseline: 'middle' as const,
    textLength: '930',
    lengthAdjust: 'spacingAndGlyphs' as const,
  }

  function followPointer(event: PointerEvent<SVGSVGElement>) {
    if (reducedMotion || event.pointerType === 'touch') return
    const bounds = event.currentTarget.getBoundingClientRect()
    x.set(Math.max(0, Math.min(1000, ((event.clientX - bounds.left) / bounds.width) * 1000)))
    y.set(Math.max(0, Math.min(160, ((event.clientY - bounds.top) / bounds.height) * 160)))
  }

  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox="0 0 1000 160"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      onPointerMove={followPointer}
      onPointerLeave={() => {
        if (!reducedMotion) {
          x.set(500)
          y.set(80)
        }
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`${id}-ink`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a92323" />
          <stop offset="50%" stopColor="#fff" />
          <stop offset="100%" stopColor="#a92323" />
        </linearGradient>
        <motion.radialGradient id={`${id}-reveal`} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r="155">
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="black" />
        </motion.radialGradient>
        <mask id={`${id}-mask`}>
          <rect width="1000" height="160" fill={`url(#${id}-reveal)`} />
        </mask>
      </defs>
      <text {...textProps} className="cc-hover-ink" fill="#999">
        {text}
      </text>
      <motion.text
        {...textProps}
        className="cc-hover-outline"
        fill="none"
        stroke="#e4e4e4"
        strokeWidth="1.1"
        strokeDasharray="1700"
        initial={reducedMotion ? false : { strokeDashoffset: 1700 }}
        whileInView={{ strokeDashoffset: 0 }}
        animate={reducedMotion ? { strokeDashoffset: 0 } : undefined}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: reducedMotion ? 0 : 2.2, ease: 'easeInOut' }}
      >
        {text}
      </motion.text>
      {!reducedMotion && (
        <text {...textProps} className="cc-hover-ink" fill={`url(#${id}-ink)`} mask={`url(#${id}-mask)`}>
          {text}
        </text>
      )}
    </svg>
  )
}
