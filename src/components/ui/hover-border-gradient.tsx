import { useRef, type ElementType, type HTMLAttributes, type PropsWithChildren } from 'react'
import { motion, useInView } from 'motion/react'
import { cn } from '@/lib/utils'
import { useAnimationSettings } from '../MotionPrimitives'

// Aceternity Hover Border Gradient, recoloured to Adplix and paused outside the viewport.
// https://ui.aceternity.com/components/hover-border-gradient
type Props = PropsWithChildren<{ as?: ElementType; containerClassName?: string; className?: string; duration?: number; clockwise?: boolean; href?: string; type?: 'button' | 'submit' | 'reset'; disabled?: boolean } & HTMLAttributes<HTMLElement>>

export function HoverBorderGradient({ children, containerClassName, className, as: Tag = 'button', duration = 5, clockwise = true, ...props }: Props) {
  const ref = useRef<HTMLElement>(null)
  const visible = useInView(ref)
  const { reducedMotion } = useAnimationSettings()
  return (
    <Tag ref={ref} className={cn('aceternity-border', containerClassName)} {...props}>
      <motion.span aria-hidden="true" className="aceternity-border-light" animate={{ rotate: visible && !reducedMotion ? (clockwise ? 360 : -360) : 0 }} transition={visible && !reducedMotion ? { duration, ease: 'linear', repeat: Infinity } : { duration: 0 }} />
      <span className={cn('aceternity-border-content', className)}>{children}</span>
    </Tag>
  )
}
