import { useEffect, useId, useRef, useState } from 'react'
import { motion, useScroll, useTransform } from 'motion/react'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { Reveal, useAnimationSettings } from '../components/MotionPrimitives'
import { BackgroundBeams } from '../components/ui/background-beams'
import { TextHoverEffect } from '../components/ui/text-hover-effect'
import aashiqPortrait from '../../assets/images/IMG_0281.webp'
import baraniPortrait from '../../assets/images/IMG_3074.webp'
import shabnamLogo from '../../assets/images/dr-shabnam-logo-small.jpg'
import everglowLogo from '../../assets/images/everglow-logo-small.jpg'
import nyoLogo from '../../assets/images/nyo_cafe.webp'
import adplixLogo from '../../assets/images/adplix-logo-small.jpg'
import './company-contact.css'

const testimonials = [
  {
    text: "Adplix didn't just run our ads; they rebuilt our entire growth engine. We 4x'd revenue in under a year.",
    author: 'Dr. Shabnam',
    title: 'Healthcare Authority',
    image: shabnamLogo,
  },
  {
    text: "The most transparent agency we've ever worked with. Real strategy, real numbers, zero fluff.",
    author: 'EverGlow Artistry',
    title: 'Beauty & Lifestyle',
    image: everglowLogo,
  },
  {
    text: 'Their creative team gets it. Every ad feels native to the platform and converts like crazy.',
    author: 'Nyo Café',
    title: 'Retail & Brand Marketing',
    image: nyoLogo,
  },
]

function Arrow() {
  return <ArrowRight size={20} strokeWidth={1.5} aria-hidden="true" />
}

function ExternalArrow() {
  return <ArrowUpRight className="cc-external-icon" size={15} strokeWidth={1.5} aria-hidden="true" />
}

function Portrait({ src, name }) {
  const frameRef = useRef(null)
  const { reducedMotion } = useAnimationSettings()
  const { scrollYProgress } = useScroll({ target: frameRef, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [-26, 26])
  return (
    <div ref={frameRef} className="cc-portrait-frame">
      <motion.img style={reducedMotion ? undefined : { y }} src={src} alt={name} loading="lazy" decoding="async" />
    </div>
  )
}

function AnimatedQuote({ text, index = 0 }) {
  const { reducedMotion } = useAnimationSettings()
  const words = text.split(' ')
  return (
    <motion.blockquote
      aria-label={`"${text}"`}
      initial={reducedMotion ? false : 'hidden'}
      whileInView="visible"
      animate={reducedMotion ? 'visible' : undefined}
      viewport={{ once: true, amount: 0.2 }}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.042, delayChildren: index * 0.12 } } }}
    >
      <span aria-hidden="true">
        "
        {words.map((word, wordIndex) => (
          <motion.span
            className="cc-quote-word"
            key={`${wordIndex}-${word}`}
            variants={{
              hidden: { opacity: 0, y: 16, filter: 'blur(5px)' },
              visible: {
                opacity: 1,
                y: 0,
                filter: 'blur(0px)',
                transition: { duration: reducedMotion ? 0 : 0.48, ease: [0.22, 1, 0.36, 1] },
              },
            }}
          >
            {word}
            {wordIndex < words.length - 1 ? '\u00a0' : ''}
          </motion.span>
        ))}
        "
      </span>
    </motion.blockquote>
  )
}

function ContactForm() {
  const id = useId()
  const [draft, setDraft] = useState(null)
  const [errors, setErrors] = useState({})
  const fields = ['name', 'email', 'phone', 'message']

  function prepareDraft(event) {
    event.preventDefault()
    const form = event.currentTarget
    const nextErrors = {}
    for (const name of fields) {
      const input = form.elements.namedItem(name)
      if (!input.value.trim()) nextErrors[name] = 'Please complete this field.'
      else if (name === 'email' && input.validity.typeMismatch) nextErrors[name] = 'Enter a valid email address.'
    }
    const phone = form.elements.namedItem('phone')
    if (phone.value.trim() && (!/^[+\d\s().-]+$/.test(phone.value) || phone.value.replace(/\D/g, '').length < 7)) {
      nextErrors.phone = 'Enter a phone number with at least 7 digits.'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      form.elements.namedItem(fields.find((name) => nextErrors[name])).focus()
      setDraft(null)
      return
    }
    const values = Object.fromEntries(fields.map((name) => [name, form.elements.namedItem(name).value.trim()]))
    const subject = encodeURIComponent(`Growth audit enquiry for ${values.name}`)
    const body = encodeURIComponent(
      `Name: ${values.name}\nEmail: ${values.email}\nPhone Number: ${values.phone}\n\nMessage:\n${values.message}`,
    )
    setDraft(`mailto:adplixupload@gmail.com?subject=${subject}&body=${body}`)
  }

  function clearFeedback(event) {
    const name = event.target.name
    if (fields.includes(name)) setErrors((current) => ({ ...current, [name]: undefined }))
    if (draft) setDraft(null)
  }

  return (
    <form
      className="cc-contact-form"
      onSubmit={prepareDraft}
      onInput={clearFeedback}
      noValidate
      aria-label="Growth audit enquiry"
      aria-describedby={`${id}-note`}
    >
      <p className="cc-form-note" id={`${id}-note`}>
        This form prepares an email draft only. Review and send it in your email app; nothing is sent or stored by this
        website.
      </p>
      <div className="cc-field-pair">
        <div className="cc-field">
          <label htmlFor={`${id}-name`}>Name</label>
          <input
            id={`${id}-name`}
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={120}
            placeholder="Your name"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? `${id}-name-error` : undefined}
          />
          {errors.name && (
            <p className="cc-field-error" id={`${id}-name-error`} role="alert">
              {errors.name}
            </p>
          )}
        </div>
        <div className="cc-field">
          <label htmlFor={`${id}-email`}>Email</label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="your@email.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? `${id}-email-error` : undefined}
          />
          {errors.email && (
            <p className="cc-field-error" id={`${id}-email-error`} role="alert">
              {errors.email}
            </p>
          )}
        </div>
      </div>
      <div className="cc-field">
        <label htmlFor={`${id}-phone`}>Phone Number</label>
        <input
          id={`${id}-phone`}
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          maxLength={40}
          placeholder="+91 00000 00000"
          aria-invalid={!!errors.phone}
          aria-describedby={errors.phone ? `${id}-phone-error` : undefined}
        />
        {errors.phone && (
          <p className="cc-field-error" id={`${id}-phone-error`} role="alert">
            {errors.phone}
          </p>
        )}
      </div>
      <div className="cc-field">
        <label htmlFor={`${id}-message`}>Message</label>
        <textarea
          id={`${id}-message`}
          name="message"
          required
          rows={5}
          maxLength={2000}
          placeholder="Tell us about your brand, goals, and challenges..."
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? `${id}-message-error` : undefined}
        />
        {errors.message && (
          <p className="cc-field-error" id={`${id}-message-error`} role="alert">
            {errors.message}
          </p>
        )}
      </div>
      <button className="button button-primary cc-send" type="submit">
        Send message <Arrow />
      </button>
      <div className="cc-form-status" role="status" aria-live="polite" aria-atomic="true">
        {draft && (
          <p>
            Email draft prepared. Nothing has been sent.{' '}
            <a className="text-link" href={draft}>
              Open your email app to review and send <ExternalArrow />
            </a>
          </p>
        )}
      </div>
    </form>
  )
}

function Newsletter() {
  const id = useId()
  const [status, setStatus] = useState('')
  const { reducedMotion } = useAnimationSettings()
  function handleSubmit(event) {
    event.preventDefault()
    // Do not read, transmit, or persist the address while no service is connected.
    setStatus(
      'No subscription service is connected. You have not been subscribed; no email has been collected or stored.',
    )
  }
  return (
    <section className="cc-newsletter" aria-labelledby={`${id}-heading`}>
      <BackgroundBeams className="cc-newsletter-beams" paused={reducedMotion} />
      <div className="shell cc-newsletter-grid">
        <Reveal direction="left">
          <p className="eyebrow">Newsletter</p>
          <h2 id={`${id}-heading`} className="cc-newsletter-title">
            Stay ahead of the <span className="cc-red">growth curve.</span>
          </h2>
          <p className="body-copy">
            Tactical breakdowns, growth experiments, and creative frameworks, dispatched monthly. Zero spam, ever.
          </p>
        </Reveal>
        <Reveal direction="right" delay={0.14}>
          <p className="cc-form-note" id={`${id}-note`}>
            No subscription service is connected yet. This form does not collect or store your email.
          </p>
          <form className="cc-newsletter-form" onSubmit={handleSubmit} aria-describedby={`${id}-note`}>
            <label className="cc-sr-only" htmlFor={`${id}-email`}>
              Your email
            </label>
            <input
              id={`${id}-email`}
              type="email"
              autoComplete="off"
              placeholder="Your email"
              required
              maxLength={254}
              onInput={() => setStatus('')}
            />
            <button type="submit" className="button button-primary">
              Subscribe <Arrow />
            </button>
          </form>
          <p className="cc-privacy">By subscribing, you agree to our Privacy Policy. Unsubscribe anytime.</p>
          <p className="cc-form-status" role="status" aria-live="polite" aria-atomic="true">
            {status}
          </p>
        </Reveal>
      </div>
    </section>
  )
}

function Footer() {
  const [legal, setLegal] = useState(null)
  const dialogRef = useRef(null)
  const id = useId()

  useEffect(() => {
    if (!legal) return undefined
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true })
    }
  }, [legal])

  return (
    <footer className="cc-footer">
      <div className="shell">
        <div className="cc-footer-grid">
          <Reveal className="cc-footer-brand" delay={0.02}>
            <div className="cc-brand-lockup">
              <img src={adplixLogo} alt="Adplix Media Logo" width="40" height="40" loading="lazy" decoding="async" />
              <span>Adplix Media</span>
            </div>
            <p className="cc-footer-tagline">We Grow Brands on Social Media.</p>
            <nav className="cc-social-links" aria-label="Social media">
              <a
                href="https://www.instagram.com/adplixmedia?igsh=MXhyc2w5Mnhob3Z6"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram (opens in a new tab)"
              >
                Instagram <ExternalArrow />
              </a>
              <a
                href="https://www.facebook.com/share/19ZiDn46EG/?mibextid=wwXIfr"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook (opens in a new tab)"
              >
                Facebook <ExternalArrow />
              </a>
              <a
                href="https://x.com/Adplixmedia"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X (opens in a new tab)"
              >
                X <ExternalArrow />
              </a>
            </nav>
          </Reveal>
          <Reveal className="cc-footer-column" delay={0.12}>
            <nav aria-label="Company">
              <h3>Company</h3>
              <ul>
                {[
                  ['Company', 'company'],
                  ['Work', 'work'],
                  ['Services', 'services'],
                  ['Approach', 'approach'],
                  ['Ideas', 'ideas'],
                ].map(([label, target]) => (
                  <li key={target}>
                    <a href={`#${target}`}>{label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          </Reveal>
          <Reveal className="cc-footer-column" delay={0.2}>
            <h3>Contact</h3>
            <ul>
              <li>
                4th Plot, 2nd Cross St,
                <br />
                Aruthra Nagar, Koundanpalayam
                <br />
                Puducherry 605009
              </li>
              <li>
                <a href="tel:+918072861362">+91 80728 61362</a>
              </li>
              <li>
                <a href="mailto:admin@adplixmedia.in">admin@adplixmedia.in</a>
              </li>
              <li>Mon to Sat: 10am to 6pm IST</li>
            </ul>
          </Reveal>
          <Reveal className="cc-footer-column" delay={0.28}>
            <nav aria-label="Legal documents">
              <h3>Legal</h3>
              <ul>
                {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map((label) => (
                  <li key={label}>
                    <button type="button" aria-haspopup="dialog" onClick={() => setLegal(label)}>
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </Reveal>
        </div>
        <Reveal className="cc-footer-wordmark">
          <TextHoverEffect text="AdplixMedia" />
        </Reveal>
        <Reveal className="cc-footer-bottom" delay={0.08}>
          <p>© {new Date().getFullYear()} Adplix Media. Built to perform.</p>
          <p>Make things that matter.</p>
        </Reveal>
      </div>
      <dialog
        className="cc-legal-dialog"
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onCancel={(event) => {
          event.preventDefault()
          setLegal(null)
        }}
      >
        <p className="eyebrow">Legal</p>
        <h2 id={`${id}-title`}>{legal}</h2>
        <p id={`${id}-description`}>
          This legal document has not been published on this website. For enquiries, contact{' '}
          <a href="mailto:admin@adplixmedia.in">admin@adplixmedia.in</a>.
        </p>
        <button type="button" className="button button-primary" onClick={() => setLegal(null)} autoFocus>
          Close
        </button>
      </dialog>
    </footer>
  )
}

export default function CompanyAndContact() {
  const { reducedMotion } = useAnimationSettings()
  return (
    <div className={`cc-sections${reducedMotion ? ' cc-motion-paused' : ''}`}>
      <section id="company" className="cc-company" aria-labelledby="cc-company-heading">
        <div className="shell">
          <Reveal className="section-heading cc-company-heading">
            <p className="eyebrow">Company</p>
            <h2 id="cc-company-heading" className="display-title">
              Built by relentless operators who <span className="cc-red">deliver results.</span>
            </h2>
          </Reveal>
          <div className="cc-founder-spread">
            <Reveal className="cc-founder cc-founder-primary" delay={0.08} direction="left">
              <figure>
                <Portrait src={aashiqPortrait} name="Mohamed Aashiq" />
                <figcaption>
                  <Reveal delay={0.2}>
                    <h3>Mohamed Aashiq</h3>
                    <p>Founder &amp; Growth</p>
                  </Reveal>
                </figcaption>
              </figure>
            </Reveal>
            <Reveal className="cc-founder cc-founder-secondary" delay={0.18} direction="right">
              <figure>
                <Portrait src={baraniPortrait} name="Baranidharan" />
                <figcaption>
                  <Reveal delay={0.3}>
                    <h3>Baranidharan</h3>
                    <p>Co-founder &amp; Creative</p>
                  </Reveal>
                </figcaption>
              </figure>
            </Reveal>
            <Reveal className="cc-origin" delay={0.28}>
              <h3>The Adplix Origin</h3>
              <p className="body-copy">
                Adplix Media was forged in 2025 by Mohamed Aashiq and Baranidharan with a single mandate: to help
                ambitious direct-to-consumer and tech brands scale profitably.
              </p>
              <p className="body-copy">
                Today, we function as a dedicated growth unit, fusing quantitative performance engineering with bold
                visual storytelling to turn brands into category leaders.
              </p>
              <AnimatedQuote text="To make every partner brand unmissable in their category, regardless of starting point." />
            </Reveal>
          </div>
        </div>
      </section>

      <section id="ideas" className="cc-ideas" aria-labelledby="cc-ideas-heading">
        <div className="shell">
          <Reveal className="section-heading cc-ideas-heading">
            <p className="eyebrow">Ideas</p>
            <h2 id="cc-ideas-heading" className="display-title">
              What ambitious founders say about <span className="cc-red">our impact.</span>
            </h2>
          </Reveal>
          <div className="cc-testimonials">
            {testimonials.map((testimonial, index) => (
              <Reveal key={testimonial.author} className="cc-testimonial" delay={index * 0.12}>
                <figure>
                  <AnimatedQuote text={testimonial.text} index={index} />
                  <figcaption>
                    <img src={testimonial.image} alt="" width="56" height="56" loading="lazy" decoding="async" />
                    <div>
                      <p className="cc-testimonial-author">{testimonial.author}</p>
                      <p className="cc-testimonial-role">{testimonial.title}</p>
                    </div>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Newsletter />

      <section id="contact" className="cc-contact" aria-labelledby="cc-contact-heading">
        <div className="shell">
          <Reveal className="cc-contact-heading">
            <p className="eyebrow">Contact</p>
            <h2 id="cc-contact-heading" className="display-title">
              Ready to scale your <span className="cc-red">brand's revenue?</span>
            </h2>
          </Reveal>
          <div className="cc-contact-grid">
            <Reveal className="cc-contact-info" direction="left" delay={0.08}>
              <p className="body-copy">
                Book a confidential 30-minute growth audit. We'll inspect your entire funnel, pinpoint leakages, and
                chart your expansion roadmap.
              </p>
              <dl className="cc-contact-details">
                <div>
                  <dt>Email us</dt>
                  <dd>
                    <a href="mailto:adplixupload@gmail.com">
                      adplixupload@gmail.com <ExternalArrow />
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Call us</dt>
                  <dd>
                    <a href="tel:+918072861362">
                      +91 80728 61362 <ExternalArrow />
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Visit us</dt>
                  <dd>4th Plot, 2nd Cross St, Koundanpalayam, Aruthra Nagar, Puducherry 605009</dd>
                </div>
              </dl>
            </Reveal>
            <Reveal className="cc-contact-form-wrap" direction="right" delay={0.18}>
              <ContactForm />
            </Reveal>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  )
}
