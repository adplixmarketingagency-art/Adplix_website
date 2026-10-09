import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { motion, useScroll, useSpring, useTransform } from 'motion/react'
import { useAnimationSettings } from '../MotionPrimitives'

// Adapted from Aceternity Tracing Beam: https://ui.aceternity.com/registry/tracing-beam.json
export function TracingBeam({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  const id = useId().replace(/:/g, '')
  const { reducedMotion } = useAnimationSettings()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const head = useSpring(useTransform(scrollYProgress, [0.12, 0.88], [0, height]), { stiffness: 180, damping: 35 })
  const tail = useTransform(head, (value) => Math.max(0, value - 165))

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const measure = () => setHeight(content.getBoundingClientRect().height)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={`tracing-beam ${className}`}>
      <svg className="tracing-beam-line" width="20" height={height} viewBox={`0 0 20 ${Math.max(1, height)}`} aria-hidden="true">
        <path d={`M 10 0 V ${height}`} stroke="rgba(255,255,255,.2)" strokeWidth="1" fill="none" />
        {reducedMotion ? (
          <path d={`M 10 0 V ${height}`} stroke="#ba3035" strokeWidth="1.5" fill="none" />
        ) : (
          <>
            <motion.path d={`M 10 0 V ${height}`} stroke={`url(#${id}-beam)`} strokeWidth="2" fill="none" />
            <defs>
              <motion.linearGradient id={`${id}-beam`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={tail} y2={head}>
                <stop stopColor="#b4232d" stopOpacity="0" />
                <stop offset=".65" stopColor="#f07676" />
                <stop offset="1" stopColor="#fff" />
              </motion.linearGradient>
            </defs>
          </>
        )}
      </svg>
      <div ref={contentRef} className="tracing-beam-content">{children}</div>
    </div>
  )
}
