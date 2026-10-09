import { createContext, useContext } from 'react'
import { motion, useReducedMotion } from 'motion/react'

const AnimationSettings = createContext({ paused: false })

export function AnimationProvider({ paused, children }) {
  return <AnimationSettings.Provider value={{ paused }}>{children}</AnimationSettings.Provider>
}

export function useAnimationSettings() {
  const { paused } = useContext(AnimationSettings)
  const systemReducedMotion = useReducedMotion()
  return { paused, reducedMotion: paused || !!systemReducedMotion, systemReducedMotion: !!systemReducedMotion }
}

export function Reveal({ children, className = '', delay = 0, direction = 'up' }) {
  const { reducedMotion } = useAnimationSettings()
  const offset = direction === 'left' ? { x: -38 } : direction === 'right' ? { x: 38 } : { y: 38 }
  return (
    <motion.div
      className={className}
      initial={reducedMotion ? false : { opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      animate={reducedMotion ? { opacity: 1, x: 0, y: 0 } : undefined}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: reducedMotion ? 0 : 0.75, delay: reducedMotion ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
