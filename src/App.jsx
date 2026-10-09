import { useEffect, useRef, useState } from 'react'
import { MotionConfig, motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
import { ArrowDown, ArrowRight, ArrowUpRight, X } from 'lucide-react'
import DotOrb from './components/DotOrb'
import { AnimationProvider, useAnimationSettings } from './components/MotionPrimitives'
import { StarsBackground } from './components/ui/stars-background'
import { ShootingStars } from './components/ui/shooting-stars'
import { TextGenerateEffect } from './components/ui/text-generate-effect'
import { HoverBorderGradient } from './components/ui/hover-border-gradient'
import WorkAndServices from './sections/WorkAndServices'
import CompanyAndContact from './sections/CompanyAndContact'
import adplixLogo from '../assets/images/adplix-logo-small.jpg'

const navigation = [['Work', 'work'], ['Services', 'services'], ['Approach', 'approach'], ['Company', 'company'], ['Ideas', 'ideas']]
const stats = [
  { value: '50+', label: 'Brands scaled profitably' },
  { value: '4×', label: 'Average revenue multiplier' },
  { value: '12+', label: 'Growth channels mastered' },
  { value: '<24h', label: 'Average response time' },
]
const ease = [0.22, 1, 0.36, 1]

function Arrow({ diagonal = false, down = false }) {
  const Icon = down ? ArrowDown : diagonal ? ArrowUpRight : ArrowRight
  return <Icon className="icon-arrow" strokeWidth={1.5} aria-hidden="true" />
}

function Hero({ paused, setPaused }) {
  const ref = useRef(null)
  const { reducedMotion, systemReducedMotion } = useAnimationSettings()
  const [compactViewport, setCompactViewport] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px), (max-height: 520px)').matches,
  )
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px), (max-height: 520px)')
    const update = () => setCompactViewport(query.matches)
    query.addEventListener('change', update)
    update()
    return () => query.removeEventListener('change', update)
  }, [])
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const skyY = useTransform(scrollYProgress, [0, 1], [0, 180])
  const skyScale = useTransform(scrollYProgress, [0, 1], [1, 1.12])
  const contentY = useTransform(scrollYProgress, [0, 0.8], [0, 65])
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const cameraX = useSpring(pointerX, { stiffness: 70, damping: 20 })
  const cameraY = useSpring(pointerY, { stiffness: 70, damping: 20 })

  function exploreSpace(event) {
    if (reducedMotion || event.pointerType !== 'mouse') return
    const bounds = event.currentTarget.getBoundingClientRect()
    pointerX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 50)
    pointerY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 38)
  }

  return (
    <section ref={ref} className="hero" aria-labelledby="hero-title" data-space-interactive="true" onPointerMove={exploreSpace} onPointerLeave={() => { pointerX.set(0); pointerY.set(0) }}>
      <motion.div className="hero-space" aria-hidden="true" style={reducedMotion || compactViewport ? undefined : { y: skyY, scale: skyScale }}>
        <StarsBackground starDensity={0.0007} interactive className="hero-starfield" />
        <ShootingStars starColor="#ffffff" trailColor="#ef4444" />
        <motion.div className="space-depth" style={reducedMotion ? undefined : { x: cameraX, y: cameraY }}>
          <DotOrb />
          <div className="space-nebula" />
        </motion.div>
      </motion.div>
      <motion.div className="shell hero-content" style={reducedMotion || compactViewport ? undefined : { y: contentY }}>
        <h1 id="hero-title" className="hero-title">
          <span className="line-mask"><TextGenerateEffect as="span" words="We make brands" delay={0.1} />{' '}</span>
          <span className="line-mask hero-title-accent"><TextGenerateEffect as="span" words="unmissable." delay={0.4} /></span>
        </h1>
        <motion.div className="hero-bottom" initial={reducedMotion ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : 0.65, duration: 0.7, ease }}>
          <div className="hero-copy-group">
            <p className="body-copy hero-description">Adplix is a performance-driven creative marketing agency. We build high-converting ad creative, deploy full-funnel media buying, and engineer digital experiences that drive profitable scale.</p>
            <div className="hero-actions"><a href="#work" className="text-link">Explore our work <Arrow /></a></div>
          </div>
        </motion.div>
        <div className="hero-footnote">
          <a href="#work" className="scroll-cue"><span>Scroll to explore</span><Arrow down /></a>
          <button type="button" className="effects-toggle" onClick={() => setPaused(!paused)} aria-pressed={paused} disabled={systemReducedMotion}>{systemReducedMotion ? 'Reduced motion enabled' : paused ? 'Resume animations' : 'Pause animations'}</button>
        </div>
      </motion.div>
    </section>
  )
}

export default function App() {
  const [active, setActive] = useState('')
  const [paused, setPaused] = useState(false)
  const reducedMotion = useReducedMotion() || paused
  const { scrollYProgress } = useScroll()

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const inView = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (inView.length) setActive(inView[0].target.id)
    }, { rootMargin: '-15% 0px -60% 0px', threshold: 0 })
    navigation.forEach(([, id]) => {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <MotionConfig reducedMotion="user" transition={{ ease, duration: 0.6 }}>
      <AnimationProvider paused={paused}>
      <div id="top" className={`site ${paused ? 'effects-paused' : ''}`}>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <motion.div className="reading-progress" style={{ scaleX: scrollYProgress }} aria-hidden="true" />
        <Navigation active={active} />
        <main id="main-content" tabIndex={-1}>
          <Hero paused={paused} setPaused={setPaused} />
          <section className="stats-section" aria-label="Adplix in numbers">
            <div className="shell stats-grid">
              {stats.map((stat, index) => <motion.div key={stat.label} className="stat" initial={reducedMotion ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} animate={reducedMotion ? { opacity: 1, y: 0 } : undefined} viewport={{ once: true }} transition={{ delay: reducedMotion ? 0 : index * 0.08, duration: reducedMotion ? 0 : 0.6 }}><span className="stat-value">{stat.value}</span><span className="stat-label">{stat.label}</span></motion.div>)}
            </div>
          </section>
          <WorkAndServices />
          <CompanyAndContact />
        </main>
      </div>
      </AnimationProvider>
    </MotionConfig>
  )
}

function Navigation({ active }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)
  const closedBySelection = useRef(false)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!menuOpen) return undefined
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    function containFocus(event) {
      if (event.key !== 'Tab') return
      const controls = Array.from(dialog.querySelectorAll('a[href], button:not([disabled])'))
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        first?.focus()
      }
    }
    dialog.addEventListener('keydown', containFocus)
    const mq = window.matchMedia('(min-width: 960px)')
    const onResize = () => { if (mq.matches) setMenuOpen(false) }
    mq.addEventListener('change', onResize)
    return () => {
      if (dialog.open) dialog.close()
      dialog.removeEventListener('keydown', containFocus)
      document.body.style.overflow = previousOverflow
      if (!closedBySelection.current) triggerRef.current?.focus({ preventScroll: true })
      closedBySelection.current = false
      mq.removeEventListener('change', onResize)
    }
  }, [menuOpen])

  function navigateTo(event, id) {
    event.preventDefault()
    closedBySelection.current = true
    setMenuOpen(false)
    requestAnimationFrame(() => {
      const destination = document.getElementById(id)
      window.history.replaceState(null, '', `#${id}`)
      destination?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth' })
      const heading = destination?.querySelector('h2')
      heading?.setAttribute('tabindex', '-1')
      heading?.focus({ preventScroll: true })
    })
  }

  return (
    <>
      <header className="site-header">
        <nav className="shell header-inner" aria-label="Main navigation">
          <a href="#top" className="brand-lockup" aria-label="Adplix Media home">
            <img src={adplixLogo} alt="Adplix Media Logo" width="36" height="36" />
            <span>Adplix<span className="brand-media"> Media</span></span>
          </a>
          <div className="desktop-links">
            {navigation.map(([label, id]) => <a key={id} href={`#${id}`} aria-current={active === id ? 'location' : undefined}>{label}</a>)}
            <a href="/portal/">Employee Portal</a>
          </div>
          <HoverBorderGradient as="a" href="#contact" containerClassName="header-contact" className="header-contact-content">Let's talk <Arrow diagonal /></HoverBorderGradient>
          <button ref={triggerRef} type="button" className="menu-trigger" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen(true)}>
            <span>Menu</span><span className="menu-icon" aria-hidden="true"><i /><i /></span>
          </button>
        </nav>
      </header>
      <dialog ref={dialogRef} id="mobile-menu" className="mobile-menu" aria-labelledby="menu-heading" onCancel={(event) => { event.preventDefault(); setMenuOpen(false) }}>
        <div className="mobile-menu-top"><p id="menu-heading" className="eyebrow">Adplix Media</p><button type="button" className="menu-close" onClick={() => setMenuOpen(false)} autoFocus>Close <X size={20} strokeWidth={1.5} aria-hidden="true" /></button></div>
        <nav aria-label="Mobile navigation">
          {navigation.map(([label, id]) => <a key={id} href={`#${id}`} onClick={(event) => navigateTo(event, id)}>{label}<Arrow diagonal /></a>)}
          <a href="/portal/">Employee Portal <Arrow diagonal /></a>
          <a href="#contact" className="mobile-contact" onClick={(event) => navigateTo(event, 'contact')}>Contact <Arrow diagonal /></a>
        </nav>
        <p className="mobile-menu-bottom">We Grow Brands on Social Media.</p>
      </dialog>
    </>
  )
}
