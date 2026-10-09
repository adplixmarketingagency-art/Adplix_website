import { memo, useEffect, useId, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useAnimationSettings } from '../MotionPrimitives'

// Adapted from Aceternity Background Beams: https://ui.aceternity.com/registry/background-beams.json
export const BackgroundBeams = memo(function BackgroundBeams({
  className = '',
  paused = false,
}: {
  className?: string
  paused?: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const id = useId().replace(/:/g, '')
  const { reducedMotion, paused: globalPaused } = useAnimationSettings()
  const [visible, setVisible] = useState(false)
  const [documentVisible, setDocumentVisible] = useState(() => typeof document === 'undefined' || !document.hidden)

  useEffect(() => {
    const onVisibility = () => setDocumentVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 })
    if (root.current) observer.observe(root.current)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      observer.disconnect()
    }
  }, [])

  const active = visible && documentVisible && !paused && !globalPaused && !reducedMotion
  return (
    <div
      ref={root}
      className={`background-beams ${className}`}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 696 316"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        aria-hidden="true"
      >
        {Array.from({ length: 42 }, (_, index) => {
          const x = -380 + index * 7
          const y = -189 - index * 8
          const d = `M${x} ${y}C${x} ${y} ${x + 68} ${y + 405} ${x + 532} ${y + 532}C${x + 996} ${y + 659} ${x + 1064} ${y + 1064} ${x + 1064} ${y + 1064}`
          const gradient = `${id}-beam-${index}`
          return (
            <g key={index}>
              <path d={d} stroke="rgba(255,255,255,.07)" strokeWidth=".5" />
              <path d={d} stroke={`url(#${gradient})`} strokeWidth=".8" strokeOpacity=".55" />
              <defs>
                <motion.linearGradient
                  id={gradient}
                  initial={false}
                  animate={
                    active
                      ? {
                          x1: ['0%', '100%'],
                          x2: ['0%', '95%'],
                          y1: ['0%', '100%'],
                          y2: ['0%', `${93 + (index % 8)}%`],
                        }
                      : { x1: '0%', x2: '0%', y1: '0%', y2: '0%' }
                  }
                  transition={
                    active
                      ? { duration: 11 + (index % 9), ease: 'easeInOut', repeat: Infinity, delay: index % 6 }
                      : { duration: 0 }
                  }
                >
                  <stop stopColor="#b4232d" stopOpacity="0" />
                  <stop stopColor="#c7363e" />
                  <stop offset=".325" stopColor="#fff" stopOpacity=".9" />
                  <stop offset="1" stopColor="#f07676" stopOpacity="0" />
                </motion.linearGradient>
              </defs>
            </g>
          )
        })}
      </svg>
    </div>
  )
})
