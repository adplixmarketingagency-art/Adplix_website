import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useScroll, useSpring, useTransform } from 'motion/react'
import { Pause, Play } from 'lucide-react'
import { Reveal, useAnimationSettings } from '../components/MotionPrimitives'
import { TracingBeam } from '../components/ui/tracing-beam'
import { BackgroundBeams } from '../components/ui/background-beams'
import shabnamPoster from '../../assets/videos/dr_shabnam_poster.webp'
import shabnamVideo from '../../assets/videos/dr_shabnam.webm'
import everglowPoster from '../../assets/videos/everglow_poster.webp'
import everglowVideo from '../../assets/videos/everglow.webm'
import skPoster from '../../assets/videos/naan_ungal_sk_poster.webp'
import skVideo from '../../assets/videos/naan_ungal_sk.webm'
import nyoPoster from '../../assets/videos/nyo_cafe_poster.webp'
import nyoVideo from '../../assets/videos/nyo_cafe.webm'
import './work-services.css'

const projects = [
  {
    title: "Dr. Shabnam's Personal Branding",
    metric: '4× Revenue · 2.1M Reach',
    description:
      'Full-funnel digital brand authority, educational video storytelling, and patient acquisition strategy that generated a 400% revenue surge.',
    href: 'https://www.instagram.com/dr.shabnams_fertility_center/?hl=en',
    poster: shabnamPoster,
    video: shabnamVideo,
  },
  {
    title: 'Everglow Makeup Artistry',
    metric: '3.8× Bookings · 180K Community',
    description:
      'Visual identity system, high-converting aesthetic reels, and targeted Instagram campaign architecture elevating booking volume across regions.',
    href: 'https://www.instagram.com/everglow_makeupartistry?igsh=ejNoNDdkd2J1cHdu',
    poster: everglowPoster,
    video: everglowVideo,
  },
  {
    title: 'Naan Ungal SK',
    metric: '+850K Followers · 15M Views',
    description:
      'Rapid audience growth framework, content production cadence, and cross-channel viral distribution positioning the creator at peak authority.',
    href: 'https://www.instagram.com/naan.ungal_sk/',
    poster: skPoster,
    video: skVideo,
  },
  {
    title: 'Nyo Cafe',
    metric: 'Retail & Brand Marketing',
    description:
      'Scaling a premium cafe brand through high-end cinematic visuals and targeted local awareness campaigns.',
    href: 'https://www.instagram.com/nyocafe/?hl=en',
    poster: nyoPoster,
    video: nyoVideo,
  },
]

const services = [
  {
    title: 'Social Media Management',
    description: 'Planning, publishing, and community management to keep your social channels consistent and engaged.',
  },
  {
    title: 'Personal and Business branding',
    description: 'Visual identity and messaging that give people and businesses a clear, recognizable presence.',
  },
  {
    title: 'Website Development',
    description: 'Responsive websites built around your content, brand, and the actions you want visitors to take.',
  },
  {
    title: 'Meta Ads, AI based ads & Performance Marketing',
    description:
      'Meta campaigns, AI-assisted ad concepts, creative testing, and performance review guided by campaign data.',
  },
  {
    title: 'Campaign Planning & Creative Advertising',
    description: 'Campaign concepts and creative assets coordinated around your audience, message, and channels.',
  },
  {
    title: 'Lead generation',
    description: 'Audience targeting and enquiry paths designed to connect your business with prospective customers.',
  },
  {
    title: 'Content Strategy & Marketing strategy',
    description: 'Content themes, channel priorities, and marketing plans shaped around your goals and audience.',
  },
  {
    title: 'Google my business + Search Engine Optimization (SEO)',
    description: 'Local business listing support and on-page SEO to make your website easier to find in search.',
  },
]

const processSteps = [
  [
    '01',
    'Deep Funnel & Creative Audit',
    'We inspect historic ad performance, creative fatigue patterns, and unit economics across all paid channels.',
  ],
  [
    '02',
    'Bottleneck Deconstruction',
    'Pinpointing the exact friction points constraining your customer acquisition and revenue velocity.',
  ],
  [
    '03',
    'Strategic Growth Roadmap',
    'Formulating a high-conviction testing matrix covering creative angles, budget allocation, and target return on ad spend.',
  ],
  [
    '04',
    'Deliverable Commitments & Projections',
    'Locking in explicit deliverables, sprint timelines, and key performance benchmarks, with zero ambiguity.',
  ],
  [
    '05',
    'Onboarding & Asset Integration',
    'Rapid tracking verification, ad account access, and communication channels configured within 48 hours.',
  ],
  [
    '06',
    'Campaign Launch & Daily Optimization',
    'Live campaign deployment followed by rigorous multivariate creative testing and daily performance scaling.',
  ],
]

function ProjectFilm({ project, index }) {
  const articleRef = useRef(null)
  const frameRef = useRef(null)
  const videoRef = useRef(null)
  const playbackRequest = useRef(0)
  const mounted = useRef(false)
  const visibleRef = useRef(false)
  const pageVisibleRef = useRef(typeof document === 'undefined' || !document.hidden)
  const allowedRef = useRef(false)
  const [sourceAttached, setSourceAttached] = useState(false)
  const [frameVisible, setFrameVisible] = useState(false)
  const [pageVisible, setPageVisible] = useState(pageVisibleRef.current)
  const [manualPaused, setManualPaused] = useState(false)
  const [manuallyStarted, setManuallyStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [playbackError, setPlaybackError] = useState('')
  const { paused, reducedMotion, systemReducedMotion } = useAnimationSettings()
  // Aceternity Container Scroll's perspective/scroll rotation, scaled to a natural film gallery:
  // https://ui.aceternity.com/components/container-scroll-animation
  const { scrollYProgress } = useScroll({ target: articleRef, offset: ['start end', 'end start'] })
  const scrollRotate = useTransform(scrollYProgress, [0, 0.5, 1], [8, 0, -5])
  const scrollScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.94, 1, 0.96])
  const scrollY = useTransform(scrollYProgress, [0, 0.5, 1], [48, 0, -40])
  const captionY = useTransform(scrollYProgress, [0, 0.5, 1], [26, 0, -22])
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const hoverX = useSpring(pointerX, { stiffness: 180, damping: 25 })
  const hoverY = useSpring(pointerY, { stiffness: 180, damping: 25 })
  const rotateX = useTransform(() => scrollRotate.get() + hoverX.get())
  const rotateY = hoverY
  const number = String(index + 1).padStart(2, '0')
  const videoId = `ws-project-film-${number}`
  const shouldPlay =
    frameVisible &&
    pageVisible &&
    !paused &&
    !manualPaused &&
    (!systemReducedMotion || manuallyStarted) &&
    !playbackError
  allowedRef.current = shouldPlay

  useEffect(() => {
    mounted.current = true
    const video = videoRef.current
    const frame = frameRef.current
    const pause = () => {
      playbackRequest.current += 1
      video?.pause()
    }
    const handleVisibility = () => {
      pageVisibleRef.current = !document.hidden
      if (document.hidden) {
        pause()
        setManuallyStarted(false)
      }
      setPageVisible(!document.hidden)
    }
    const updateFrame = (visible) => {
      visibleRef.current = visible
      if (!visible) {
        pause()
        setManuallyStarted(false)
      } else setSourceAttached(true)
      setFrameVisible(visible)
    }
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => updateFrame(entry.isIntersecting && entry.intersectionRatio >= 0.45), {
            threshold: [0, 0.45],
          })
    // The fallback keeps pause-on-scroll working in browsers without IntersectionObserver.
    const checkFrame = () => {
      if (!frame) return
      const rect = frame.getBoundingClientRect()
      const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
      updateFrame(rect.height > 0 && visibleHeight / rect.height >= 0.45)
    }
    if (frame && observer) observer.observe(frame)
    else {
      window.addEventListener('scroll', checkFrame, { passive: true })
      window.addEventListener('resize', checkFrame)
      checkFrame()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      mounted.current = false
      observer?.disconnect()
      window.removeEventListener('scroll', checkFrame)
      window.removeEventListener('resize', checkFrame)
      document.removeEventListener('visibilitychange', handleVisibility)
      pause()
    }
  }, [])

  useEffect(() => {
    if (paused) setManuallyStarted(false)
  }, [paused])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !sourceAttached || !shouldPlay || !visibleRef.current || !pageVisibleRef.current) {
      playbackRequest.current += 1
      video?.pause()
      return
    }
    const request = ++playbackRequest.current
    video
      .play()
      .then(() => {
        if (
          !mounted.current ||
          request !== playbackRequest.current ||
          !visibleRef.current ||
          !pageVisibleRef.current ||
          !allowedRef.current
        )
          video.pause()
      })
      .catch(() => {
        if (mounted.current && request === playbackRequest.current) {
          setPlaybackError('The film could not play. Select play to try again.')
        }
      })
    return () => {
      playbackRequest.current += 1
      video.pause()
    }
  }, [sourceAttached, shouldPlay])

  const togglePlayback = () => {
    if (playing) {
      setManualPaused(true)
      playbackRequest.current += 1
      videoRef.current?.pause()
      return
    }
    setPlaybackError('')
    setManualPaused(false)
    setManuallyStarted(true)
    setSourceAttached(true)
  }

  const tiltOnPointer = (event) => {
    if (reducedMotion || event.pointerType !== 'mouse') return
    const rect = frameRef.current?.getBoundingClientRect()
    if (!rect) return
    pointerX.set(((event.clientY - rect.top) / rect.height - 0.5) * -3)
    pointerY.set(((event.clientX - rect.left) / rect.width - 0.5) * 3)
  }

  const resetTilt = () => {
    pointerX.set(0)
    pointerY.set(0)
  }

  return (
    <article
      ref={articleRef}
      className={`ws-project ws-project-${number}`}
      aria-labelledby={`ws-project-title-${number}`}
    >
      <motion.div
        className="ws-film-frame"
        ref={frameRef}
        style={reducedMotion ? undefined : { rotateX, rotateY, scale: scrollScale, y: scrollY }}
        onPointerMove={tiltOnPointer}
        onPointerLeave={resetTilt}
      >
        <video
          id={videoId}
          ref={videoRef}
          className="ws-film-video"
          src={sourceAttached ? project.video : undefined}
          poster={project.poster}
          preload="none"
          muted
          loop
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload nofullscreen noremoteplayback"
          aria-label={`${project.title} project film`}
          onPlay={() => {
            if (!mounted.current) return
            setPlaying(true)
            setPlaybackError('')
          }}
          onPause={() => {
            if (mounted.current) setPlaying(false)
          }}
          onEnded={() => {
            if (mounted.current) setPlaying(false)
          }}
          onError={() => {
            if (!mounted.current) return
            playbackRequest.current += 1
            videoRef.current?.pause()
            setPlaying(false)
            setPlaybackError('The film could not load. Please try again later.')
          }}
        />
        <button
          className="ws-play-control"
          type="button"
          onClick={togglePlayback}
          aria-controls={videoId}
          aria-label={`${playing ? 'Pause' : 'Play'} ${project.title} film`}
          aria-pressed={playing}
          disabled={paused}
        >
          {playing ? (
            <Pause size={18} fill="currentColor" aria-hidden="true" />
          ) : (
            <Play size={18} fill="currentColor" aria-hidden="true" />
          )}
        </button>
      </motion.div>
      <motion.div className="ws-project-caption" style={reducedMotion ? undefined : { y: captionY }}>
        <h3 id={`ws-project-title-${number}`} className="ws-project-title">
          {project.title}
        </h3>
        <p className="ws-project-metric">{project.metric}</p>
        <p className="body-copy">{project.description}</p>
        <div className="ws-project-actions">
          {project.href && (
            <a className="text-link ws-case-link" href={project.href} target="_blank" rel="noopener noreferrer">
              Inspect case study
            </a>
          )}
        </div>
        {playbackError && (
          <p className="ws-playback-error" role="status">
            {playbackError}
          </p>
        )}
      </motion.div>
    </article>
  )
}

function Services() {
  const [activeIndex, setActiveIndex] = useState(null)
  const { reducedMotion } = useAnimationSettings()
  return (
    <section id="services" className="ws-section ws-services" aria-labelledby="ws-services-title">
      <BackgroundBeams className="ws-services-beams" />
      <div className="shell">
        <Reveal className="ws-section-header ws-services-header section-heading">
          <p className="eyebrow">Services</p>
          <h2 id="ws-services-title" className="display-title ws-services-title">
            Full-funnel systems to <span className="ws-red">dominate</span> your market.
          </h2>
          <p className="body-copy ws-intro">
            One unified team, full-spectrum execution. We handle every high-leverage growth vector, from viral creative
            production to algorithmic media buying.
          </p>
        </Reveal>
        <ol className="ws-services-list">
          {services.map((service, index) => (
            <motion.li
              key={service.title}
              className="ws-service-row"
              tabIndex={0}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={(event) => {
                if (!event.currentTarget.contains(document.activeElement)) setActiveIndex(null)
              }}
              onFocus={() => setActiveIndex(index)}
              onBlur={(event) => {
                if (!event.currentTarget.matches(':hover')) setActiveIndex(null)
              }}
              initial={reducedMotion ? false : { opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              animate={reducedMotion ? { opacity: 1, y: 0 } : undefined}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: reducedMotion ? 0 : 0.6, delay: reducedMotion ? 0 : (index % 2) * 0.1 }}
            >
              <AnimatePresence>
                {activeIndex === index && !reducedMotion && (
                  <motion.span
                    layoutId="ws-service-hover-background"
                    className="ws-service-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      layout: { type: 'spring', stiffness: 270, damping: 28 },
                      opacity: { duration: 0.18 },
                    }}
                    aria-hidden="true"
                  />
                )}
              </AnimatePresence>
              <h3>{service.title}</h3>
              <p className="body-copy">{service.description}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Approach() {
  const { reducedMotion } = useAnimationSettings()
  return (
    <section id="approach" className="ws-section ws-approach" aria-labelledby="ws-approach-title">
      <div className="shell">
        <Reveal className="ws-process-intro section-heading">
          <p className="eyebrow">Approach</p>
          <h2 id="ws-approach-title" className="display-title ws-process-title">
            A battle-tested process engineered for <span className="ws-red">predictable growth.</span>
          </h2>
          <p className="body-copy">
            Our structured six-phase operational protocol guarantees clear milestones, razor-sharp alignment, and rapid
            time-to-market.
          </p>
        </Reveal>
        <TracingBeam className="ws-process-trace">
          <ol className="ws-process-list">
            {processSteps.map(([number, title, description], index) => (
              <motion.li
                key={number}
                className="ws-process-step"
                initial={reducedMotion ? false : { opacity: 0, x: 28, y: 16 }}
                whileInView={{ opacity: 1, x: 0, y: 0 }}
                animate={reducedMotion ? { opacity: 1, x: 0, y: 0 } : undefined}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: reducedMotion ? 0 : 0.65, delay: reducedMotion ? 0 : (index % 2) * 0.09 }}
              >
                <span className="ws-process-number" aria-hidden="true">
                  {number}
                </span>
                <div className="ws-process-step-content">
                  <h3>{title}</h3>
                  <p className="body-copy">{description}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </TracingBeam>
      </div>
    </section>
  )
}

export default function WorkAndServices() {
  return (
    <>
      <section id="work" className="ws-section ws-work" aria-labelledby="ws-work-title">
        <div className="shell">
          <Reveal className="ws-section-header ws-work-header section-heading">
            <p className="eyebrow">Work</p>
            <h2 id="ws-work-title" className="display-title ws-work-title">
              Brands we've scaled to <span className="ws-red">Market Dominance</span>
            </h2>
            <div className="ws-work-intro-row">
              <p className="body-copy ws-intro">
                Each project represents an intense partnership built on scientific strategy, cinematic creative, and
                execution aligned to measurable revenue acceleration.
              </p>
            </div>
          </Reveal>
          <div className="ws-projects">
            {projects.map((project, index) => (
              <ProjectFilm key={project.title} project={project} index={index} />
            ))}
          </div>
        </div>
      </section>
      <Services />
      <Approach />
    </>
  )
}
