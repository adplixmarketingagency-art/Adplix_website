import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useAnimationSettings } from '../MotionPrimitives'

// Aceternity Text Generate Effect; inherited typography and in-view word choreography.
// https://ui.aceternity.com/components/text-generate-effect
export function TextGenerateEffect({ words, className, filter = true, duration = 0.6, delay = 0, as = 'div' }: { words: string; className?: string; filter?: boolean; duration?: number; delay?: number; as?: 'div' | 'span' | 'p' }) {
  const { reducedMotion } = useAnimationSettings()
  const Tag = as === 'span' ? motion.span : as === 'p' ? motion.p : motion.div
  const wordsArray = words.split(' ')
  return (
    <Tag
      className={cn('text-generate', className)}
      initial={reducedMotion ? false : 'hidden'}
      whileInView="visible"
      animate={reducedMotion ? 'visible' : undefined}
      viewport={{ once: true, amount: 0.15 }}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: reducedMotion ? 0 : 0.07, delayChildren: reducedMotion ? 0 : delay } } }}
    >
      {wordsArray.map((word, index) => <motion.span key={`${index}-${word}`} className="generated-word" variants={{ hidden: { opacity: 0, y: 16, filter: filter ? 'blur(5px)' : 'none' }, visible: { opacity: 1, y: 0, filter: filter ? 'blur(0px)' : 'none', transition: { duration: reducedMotion ? 0 : duration, ease: [0.22, 1, 0.36, 1] } } }}>{word}</motion.span>).reduce<ReactNode[]>((result, word, index) => [...result, ...(index ? [' '] : []), word], [])}
    </Tag>
  )
}
