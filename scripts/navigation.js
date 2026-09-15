/**
 * Navigation Module
 * Handles: fixed nav, scroll progress, mobile menu, smooth scroll
 */

export function initNavigation() {
  const nav = document.getElementById('nav');
  const scrollProgress = document.getElementById('scrollProgress');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileMenuClose = document.getElementById('mobileMenuClose');

  if (!nav) return;

  // Scroll progress indicator
  let scrollRAF = null;
  function updateScrollProgress() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercent = docHeight > 0 ? scrollTop / docHeight : 0;
    if (scrollProgress) {
      scrollProgress.style.transform = `scaleX(${scrollPercent})`;
    }
    scrollRAF = null;
  }

  window.addEventListener('scroll', () => {
    if (scrollRAF === null) {
      scrollRAF = requestAnimationFrame(updateScrollProgress);
    }
  }, { passive: true });

  // Nav scroll state
  let navRAF = null;
  function updateNav() {
    const currentScroll = window.scrollY;
    if (currentScroll > 100) {
      nav.classList.add('nav--scrolled');
    } else {
      nav.classList.remove('nav--scrolled');
    }
    navRAF = null;
  }

  window.addEventListener('scroll', () => {
    if (navRAF === null) {
      navRAF = requestAnimationFrame(updateNav);
    }
  }, { passive: true });

  // Mobile menu
  let isMenuOpen = false;

  function openMobileMenu() {
    isMenuOpen = true;
    mobileMenuBtn.setAttribute('aria-expanded', 'true');
    mobileMenuBtn.setAttribute('aria-label', 'Close menu');
    mobileMenu.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Focus first link
    const firstLink = mobileMenu.querySelector('.nav__mobile-link');
    if (firstLink) firstLink.focus();

    // Trap focus
    trapFocus(mobileMenu);
  }

  function closeMobileMenu() {
    isMenuOpen = false;
    mobileMenuBtn.setAttribute('aria-expanded', 'false');
    mobileMenuBtn.setAttribute('aria-label', 'Open menu');
    mobileMenu.classList.remove('open');
    document.body.style.overflow = '';
    mobileMenuBtn.focus();
  }

  function toggleMobileMenu() {
    if (isMenuOpen) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  }

  mobileMenuBtn?.addEventListener('click', toggleMobileMenu);
  mobileMenuClose?.addEventListener('click', closeMobileMenu);

  // Close on link click
  mobileMenu?.querySelectorAll('.nav__mobile-link, .nav__mobile-cta').forEach(link => {
    link.addEventListener('click', closeMobileMenu);
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMenuOpen) {
      closeMobileMenu();
    }
  });

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const navHeight = nav.offsetHeight;
        const targetPosition = target.getBoundingClientRect().top + window.scrollY - navHeight;
        window.scrollTo({ top: targetPosition, behavior: 'smooth' });
      }
    });
  });

  // Focus trap for mobile menu
  function trapFocus(element) {
    const focusableElements = element.querySelectorAll(
      'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    element.addEventListener('keydown', function handleTab(e) {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    });
  }
}
