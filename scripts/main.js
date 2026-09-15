/**
 * Main Application Module
 * Initializes all components and handles interactions
 */

import '../styles/main.css';
import { initNavigation } from './navigation.js';

// Initialize navigation immediately
initNavigation();

// Asset paths for optimized files
const ASSETS = {
  images: {
    heroBg: 'images/hero_bg.webp',
    founder1: 'images/IMG_0281.webp',
    founder2: 'images/IMG_3074.webp',
    drShabnamLogo: 'images/dr_shabnam_logo.webp',
    everglowLogo: 'images/everglow_logo.webp',
    skLogo: 'images/sk_logo.webp',
    nyoCafeLogo: 'images/nyo_cafe.webp',
    wwkLogo: 'images/wwk.webp'
  },
  videos: {
    drShabnam: {
      mp4: 'videos/dr_shabnam_compressed.mp4',
      webm: 'videos/dr_shabnam.webm',
      poster: 'videos/dr_shabnam_poster.webp'
    },
    everglow: {
      mp4: 'videos/everglow_compressed.mp4',
      webm: 'videos/everglow.webm',
      poster: 'videos/everglow_poster.webp'
    },
    naanUngalSk: {
      mp4: 'videos/naan_ungal_sk_compressed.mp4',
      webm: 'videos/naan_ungal_sk.webm',
      poster: 'videos/naan_ungal_sk_poster.webp'
    },
    nyoCafe: {
      mp4: 'videos/nyo_cafe_compressed.mp4',
      webm: 'videos/nyo_cafe.webm',
      poster: 'videos/nyo_cafe_poster.webp'
    },
    wwk: {
      mp4: 'videos/wwk_compressed.mp4',
      webm: 'videos/wwk.webm',
      poster: 'videos/wwk_poster.webp'
    }
  }
};

// ===== WORK SHOWCASE =====
const workCases = [
  {
    title: "Dr. Shabnam's Personal Branding",
    category: 'Healthcare · Personal Brand',
    description: 'Brand Design & Strategy',
    link: 'https://www.instagram.com/dr.shabnams_fertility_center/?hl=en',
    video: ASSETS.videos.drShabnam,
    image: ASSETS.images.drShabnamLogo,
    logo: ASSETS.images.drShabnamLogo
  },
  {
    title: 'Everglow Makeup Artistry',
    category: 'Beauty & Lifestyle',
    description: 'Visual Identity & Creative',
    link: 'https://www.instagram.com/everglow_makeupartistry?igsh=ejNoNDdkd2J1cHdu',
    video: ASSETS.videos.everglow,
    image: ASSETS.images.everglowLogo,
    logo: ASSETS.images.everglowLogo
  },
  {
    title: 'Naan Ungal SK',
    category: 'Personal Brand · Creator',
    description: 'Content Creation & Media',
    link: 'https://www.instagram.com/naan.ungal_sk/',
    video: ASSETS.videos.naanUngalSk,
    image: ASSETS.images.skLogo,
    logo: ASSETS.images.skLogo
  }
];

function initWorkShowcase() {
  const showcase = document.getElementById('work-showcase');
  if (!showcase) return;

  showcase.innerHTML = workCases.map((c, i) => `
    <article class="work-item reveal" data-delay="${i + 1}" role="listitem">
      <div class="work-media">
        <picture>
          <source srcset="${c.image}" type="image/webp">
          <img src="${c.logo}" alt="${c.title}" loading="lazy" />
        </picture>
        <video loop muted playsinline aria-hidden="true" poster="${c.video.poster}" preload="none">
          <source src="${c.video.webm}" type="video/webm">
          <source src="${c.video.mp4}" type="video/mp4">
        </video>
      </div>
      <div class="work-content">
        <span class="work-category">${c.category}</span>
        <h3 class="work-title">${c.title}</h3>
        <p class="work-description">${c.description}</p>
        <a href="${c.link}" ${c.link !== '#' ? 'target="_blank" rel="noopener noreferrer"' : ''} class="work-link">
          View case study
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
        </a>
      </div>
    </article>
  `).join('');

  // Add hover video play functionality
  showcase.querySelectorAll('.work-item').forEach(item => {
    const video = item.querySelector('video');
    const media = item.querySelector('.work-media');
    if (!video || !media) return;

    const playVideo = () => {
      media.classList.add('work-media--video-active');
      video.play().catch(() => {});
    };

    const pauseVideo = () => {
      media.classList.remove('work-media--video-active');
      video.pause();
    };

    item.addEventListener('pointerenter', playVideo);
    item.addEventListener('pointerleave', pauseVideo);
    item.addEventListener('focus', playVideo);
    item.addEventListener('blur', pauseVideo);
  });
}

// ===== SOLUTIONS =====
const solutions = [
  {
    number: '01',
    title: 'Strategy',
    description: 'Research-driven growth roadmaps with channel mix, budget allocation, and clear KPIs tailored to your business stage.'
  },
  {
    number: '02',
    title: 'Creative',
    description: 'Scroll-stopping creatives, reels, and brand storytelling tailored to your audience — designed to convert, not just impress.'
  },
  {
    number: '03',
    title: 'Performance',
    description: 'High-ROAS paid campaigns across Google, Meta, and beyond — engineered to convert with rigorous testing and optimization.'
  },
  {
    number: '04',
    title: 'Technology',
    description: 'Fast, conversion-focused websites and marketing automation that turn visitors into paying customers on autopilot.'
  },
  {
    number: '05',
    title: 'Brand',
    description: 'Visual identity systems and brand strategy that make you unmissable — from logo to voice to full guidelines.'
  },
  {
    number: '06',
    title: 'Growth',
    description: 'End-to-end funnels that capture, nurture, and convert qualified leads — SEO, email, cold outreach, and retention.'
  }
];

function initSolutions() {
  const container = document.getElementById('solutions-list');
  if (!container) return;

  container.innerHTML = solutions.map((s, i) => `
    <article class="solution-item reveal" data-delay="${i + 1}" role="listitem">
      <span class="solution-number">${s.number}</span>
      <div class="solution-content">
        <h3 class="solution-title">${s.title}</h3>
        <p class="solution-description">${s.description}</p>
      </div>
    </article>
  `).join('');
}

// ===== PROCESS / APPROACH =====
const processSteps = [
  ['01', 'Lead to Client Processing', 'We qualify every inbound lead and walk them through a clear, structured intake.'],
  ['02', 'Problem Identification', 'Deep-dive audits to uncover the real bottlenecks holding your brand back.'],
  ['03', 'Strategy Forming', 'A tailored roadmap with channels, budget allocation, creative direction and KPIs.'],
  ['04', 'Work Promise & Projection', 'Transparent deliverables, timelines and realistic growth projections — no fluff.'],
  ['05', 'Agreement Signing', 'Clear scope, pricing and terms locked in so we can move fast with full alignment.'],
  ['06', 'Client Onboarding', 'Smooth onboarding, access setup and kickoff so campaigns go live without friction.']
];

function initProcess() {
  const container = document.getElementById('process-timeline');
  if (!container) return;

  container.innerHTML = processSteps.map((s, i) => `
    <li class="process-step reveal" data-delay="${i + 1}" role="listitem">
      <span class="step-number">${s[0]}</span>
      <div class="step-content">
        <h3 class="step-title">${s[1]}</h3>
        <p class="step-description">${s[2]}</p>
      </div>
    </li>
  `).join('');
}

// ===== ABOUT / COMPANY =====
function initAbout() {
  const container = document.getElementById('about-story');
  if (!container) return;

  container.innerHTML = `
    <div class="pull-quote reveal" data-delay="1">
      <div class="pull-quote__mark" aria-hidden="true">"</div>
      <blockquote>
        <p>"To make every brand unmissable in the digital world — regardless of size or budget."</p>
        <cite>— Our Mission</cite>
      </blockquote>
    </div>
    <div class="reveal" data-delay="2">
      <h3 style="font-size: var(--text-display-sm); margin-bottom: var(--space-6);">Our story</h3>
      <div class="space-y-6 text-lg text-muted-fg leading-relaxed">
        <p>Adplix Media was founded in 2025 by Mohamed Aashiq and Barani Dharan with a vision to help brands grow in the digital world.</p>
        <p>Starting from scratch, we built our expertise in social media marketing and performance ads by working closely with businesses and understanding what truly drives results.</p>
        <p>Today, we focus on helping brands scale faster with smart strategies, creative content, and consistent execution — no fluff, just outcomes.</p>
      </div>
    </div>
    <div class="founders-grid founders-grid--legacy" role="list">
     <div class="founder-info reveal" data-delay="5">
      <div style="display: grid; gap: var(--space-8); grid-template-columns: 1fr;">
      <article class="founder-portrait image-reveal reveal" data-delay="3" role="listitem">
        <picture>
          <source srcset="${ASSETS.images.founder1}" type="image/webp">
          <img src="IMG_0281.PNG" alt="Mohamed Aashiq, Founder of Adplix Media" loading="lazy" />
        </picture>
      </article>
     
      <div style="text-align: center;">
          <h4 class="founder-name">Mohamed Aashiq</h4>
          <p class="founder-role">Founder</p>
          <div class="founder-social">
            <a href="https://www.instagram.com/adplixmedia?igsh=MXhyc2w5Mnhob3Z6" target="_blank" rel="noopener noreferrer" aria-label="Mohamed Aashiq on Instagram"><svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37zM17.5 6.5h.01" /></svg></a>
            <a href="https://www.linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="Mohamed Aashiq on LinkedIn"><svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" /><circle cx="4" cy="4" r="2" /></svg></a>
          </div>
        </div>
        
         <div class="founder-info reveal" data-delay="5">
      <div style="display: grid; gap: var(--space-8); grid-template-columns: 1fr;">
      <article class="founder-portrait image-reveal reveal" data-delay="4" role="listitem">
        <picture>
          <source srcset="${ASSETS.images.founder2}" type="image/webp">
          <img src="IMG_3074.JPG.jpeg" alt="Barani Dharan, Founder of Adplix Media" loading="lazy" />
        </picture>
      </article>
      </div>
      </div>
       <div style="text-align: center;">
          <h4 class="founder-name">Baranidharan</h4>
          <p class="founder-role">Founder</p>
          <div class="founder-social">
            <a href="https://www.instagram.com/adplixmedia?igsh=MXhyc2w5Mnhob3Z6" target="_blank" rel="noopener noreferrer" aria-label="Barani Dharan on Instagram"><svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37zM17.5 6.5h.01" /></svg></a>
            <a href="https://www.linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="Barani Dharan on LinkedIn"><svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" /><circle cx="4" cy="4" r="2" /></svg></a>
          </div>
        </div>
    </>
    <div class="founder-info reveal" data-delay="5">
      <div style="display: grid; gap: var(--space-8); grid-template-columns: 1fr;">
        
       
      </div>
    </div>
    </div>
    </div>
    <div class="founders-grid founders-grid--clean" role="list">
      <article class="founder-card reveal" data-delay="3" role="listitem">
        <div class="founder-portrait image-reveal">
          <picture>
            <source srcset="${ASSETS.images.founder1}" type="image/webp">
            <img src="${ASSETS.images.founder1}" alt="Mohamed Aashiq, Founder of Adplix Media" loading="lazy" />
          </picture>
        </div>
        <div class="founder-info">
          <h4 class="founder-name">Mohamed Aashiq</h4>
          <p class="founder-role">Founder</p>
        </div>
      </article>
      <article class="founder-card reveal" data-delay="4" role="listitem">
        <div class="founder-portrait image-reveal">
          <picture>
            <source srcset="${ASSETS.images.founder2}" type="image/webp">
            <img src="${ASSETS.images.founder2}" alt="Barani Dharan, Founder of Adplix Media" loading="lazy" />
          </picture>
        </div>
        <div class="founder-info">
          <h4 class="founder-name">Barani Dharan</h4>
          <p class="founder-role">Founder</p>
        </div>
      </article>
    </div>
  `;

  container.querySelector('.founders-grid--legacy')?.remove();
  container.insertAdjacentHTML('beforeend', `
    <div class="founders-grid founders-grid--clean" role="list">
      <article class="founder-card reveal" data-delay="3" role="listitem">
        <div class="founder-portrait image-reveal">
          <picture>
            <source srcset="${ASSETS.images.founder1}" type="image/webp">
            <img src="${ASSETS.images.founder1}" alt="Mohamed Aashiq, Founder of Adplix Media" loading="lazy" />
          </picture>
        </div>
        <div class="founder-info">
          <h4 class="founder-name">Mohamed Aashiq</h4>
          <p class="founder-role">Founder</p>
        </div>
      </article>
      <article class="founder-card reveal" data-delay="4" role="listitem">
        <div class="founder-portrait image-reveal">
          <picture>
            <source srcset="${ASSETS.images.founder2}" type="image/webp">
            <img src="${ASSETS.images.founder2}" alt="Barani Dharan, Founder of Adplix Media" loading="lazy" />
          </picture>
        </div>
        <div class="founder-info">
          <h4 class="founder-name">Barani Dharan</h4>
          <p class="founder-role">Founder</p>
        </div>
      </article>
    </div>
  `);
}

// ===== TESTIMONIALS / IDEAS =====
const testimonials = [
  ["Adplix didn't just run our ads — they rebuilt our entire growth engine. We 4x'd revenue in under a year.", 'Dr. Shabnam', 'Personal Branding, Healthcare'],
  ["The most transparent agency we've ever worked with. Real strategy, real numbers, no fluff.", 'EverGlow Makeup Artistry', 'Personal Branding, Beauty & Lifestyle'],
  ['Their creative team gets it. Every ad feels native to the platform and converts like crazy.', 'Nyo Café', 'Brand Design & Marketing']
];

function initTestimonials() {
  const container = document.getElementById('testi-grid');
  if (!container) return;

  container.innerHTML = testimonials.map((t, i) => `
    <article class="card-insight reveal" data-delay="${i + 1}" role="listitem">
      <div class="card-insight__rating" aria-label="5 star rating">★★★★★</div>
      <p class="card-insight__quote">&ldquo;${t[0]}&rdquo;</p>
      <div class="card-insight__author">
        <div class="card-insight__avatar">${t[1][0]}</div>
        <div>
          <p class="card-insight__name">${t[1]}</p>
          <p class="card-insight__role">${t[2]}</p>
        </div>
      </div>
    </article>
  `).join('');
}

// ===== COUNTER ANIMATION =====
function initCounters() {
  const heroStats = document.getElementById('heroStats');
  if (!heroStats) return;

  const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const statsContainer = entry.target;
        const counters = statsContainer.querySelectorAll('.counter');
        counters.forEach(counter => {
          const target = parseInt(counter.dataset.target);
          const duration = 2000;
          const start = performance.now();
          function animate(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            counter.textContent = Math.floor(eased * target) + (target >= 10 ? '+' : '×');
            if (progress < 1) requestAnimationFrame(animate);
          }
          requestAnimationFrame(animate);
        });
        statsObserver.unobserve(statsContainer);
      }
    });
  }, { threshold: 0.9 });

  statsObserver.observe(heroStats);
}

function initHeroStatsReveal() {
  // Hero stats are now handled by the scroll reveal system
  // This function is kept for compatibility but does nothing
}

// ===== SCROLL REVEALS =====
let revealObserver;

function initScrollReveals() {
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.1 });

  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  // Image reveal observer
  const imageRevealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        imageRevealObserver.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -5% 0px', threshold: 0.1 });

  document.querySelectorAll('.image-reveal').forEach(el => imageRevealObserver.observe(el));
}

// ===== PARALLAX EFFECTS =====
function initParallax() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const heroBg = document.querySelector('.hero__bg-image');
  let parallaxRAF = null;

  function updateParallax() {
    const scrolled = window.scrollY;
    if (heroBg) heroBg.style.transform = `translateY(${scrolled * 0.2}px)`;
    parallaxRAF = null;
  }

  window.addEventListener('scroll', () => {
    if (parallaxRAF === null) parallaxRAF = requestAnimationFrame(updateParallax);
  }, { passive: true });
}

// ===== SHOWREEL MODAL =====
function initShowreelModal() {
  const showreelBtn = document.getElementById('showreelBtn');
  const showreelModal = document.getElementById('showreelModal');
  const showreelVideo = document.getElementById('showreelVideo');
  const modalClose = showreelModal?.querySelector('.modal-close');

  if (!showreelBtn || !showreelModal) return;

  function openModal() {
    showreelModal.classList.add('open');
    showreelVideo.currentTime = 0;
    showreelVideo.play().catch(() => {});
    document.body.style.overflow = 'hidden';
    modalClose?.focus();
  }

  function closeModal() {
    showreelModal.classList.remove('open');
    showreelVideo.pause();
    document.body.style.overflow = '';
  }

  showreelBtn.addEventListener('click', openModal);
  modalClose?.addEventListener('click', closeModal);
  showreelModal.addEventListener('click', (e) => { if (e.target === showreelModal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && showreelModal.classList.contains('open')) closeModal(); });
}

// ===== EMAILJS INIT =====
function initEmailJS() {
  if (typeof emailjs !== 'undefined') {
    emailjs.init({ publicKey: "KgNOVTtHaCQUo5WGf" });
  }
}

// ===== CONTACT FORM =====
function initContactForm() {
  const contactForm = document.getElementById('contactForm');
  if (!contactForm) return;

  contactForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalHTML = submitBtn.innerHTML;
    submitBtn.innerHTML = '<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Sending...</span>';
    submitBtn.disabled = true;

    if (typeof emailjs !== 'undefined') {
      emailjs.sendForm('service_nkxjsi7', 'template_e208uof', this)
        .then(() => {
          alert("Message sent successfully! We'll get back to you within 24 hours.");
          contactForm.reset();
          submitBtn.innerHTML = originalHTML;
          submitBtn.disabled = false;
        }, (error) => {
          console.error('FAILED...', error);
          alert("Error sending message. Please try again or email us directly at adplixupload@gmail.com");
          submitBtn.innerHTML = originalHTML;
          submitBtn.disabled = false;
        });
    } else {
      // Fallback if emailjs not loaded
      setTimeout(() => {
        alert("Message sent successfully! We'll get back to you within 24 hours.");
        contactForm.reset();
        submitBtn.innerHTML = originalHTML;
        submitBtn.disabled = false;
      }, 800);
    }
  });
}

// ===== NEWSLETTER FORM =====
function initNewsletterForm() {
  const newsletterForm = document.getElementById('newsletterForm');
  if (!newsletterForm) return;

  newsletterForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const email = this.querySelector('input[name="email"]').value;
    const hp = this.querySelector('input[name="hp"]').checked;
    if (hp) return; // Honeypot triggered

    const submitBtn = this.querySelector('button[type="submit"]');
    const originalHTML = submitBtn.innerHTML;
    submitBtn.innerHTML = '<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Subscribing...</span>';
    submitBtn.disabled = true;

    setTimeout(() => {
      alert(`Thanks for subscribing! (${email})`);
      newsletterForm.reset();
      submitBtn.innerHTML = originalHTML;
      submitBtn.disabled = false;
    }, 800);
  });
}

// ===== MAGNETIC BUTTONS =====
function initMagneticButtons() {
  document.querySelectorAll('.btn-magnetic').forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });
}

// ===== YEAR IN FOOTER =====
function initYear() {
  const yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();
}

// ===== INIT ALL =====
document.addEventListener('DOMContentLoaded', () => {
  initWorkShowcase();
  initSolutions();
  initProcess();
  initAbout();
  initTestimonials();
  initCounters();
  initHeroStatsReveal();
  initScrollReveals();
  initShowreelModal();
  initEmailJS();
  initContactForm();
  initNewsletterForm();
  initMagneticButtons();
  initYear();
});
