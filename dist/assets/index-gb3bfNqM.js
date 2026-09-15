(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))i(r);new MutationObserver(r=>{for(const o of r)if(o.type==="childList")for(const a of o.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&i(a)}).observe(document,{childList:!0,subtree:!0});function t(r){const o={};return r.integrity&&(o.integrity=r.integrity),r.referrerPolicy&&(o.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?o.credentials="include":r.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function i(r){if(r.ep)return;r.ep=!0;const o=t(r);fetch(r.href,o)}})();function L(){const n=document.getElementById("nav"),e=document.getElementById("scrollProgress"),t=document.getElementById("mobileMenuBtn"),i=document.getElementById("mobileMenu"),r=document.getElementById("mobileMenuClose");if(!n)return;let o=null;function a(){const s=window.scrollY,c=document.documentElement.scrollHeight-window.innerHeight,d=c>0?s/c:0;e&&(e.style.transform=`scaleX(${d})`),o=null}window.addEventListener("scroll",()=>{o===null&&(o=requestAnimationFrame(a))},{passive:!0});let u=null;function w(){window.scrollY>100?n.classList.add("nav--scrolled"):n.classList.remove("nav--scrolled"),u=null}window.addEventListener("scroll",()=>{u===null&&(u=requestAnimationFrame(w))},{passive:!0});let m=!1;function h(){m=!0,t.setAttribute("aria-expanded","true"),t.setAttribute("aria-label","Close menu"),i.classList.add("open"),document.body.style.overflow="hidden";const s=i.querySelector(".nav__mobile-link");s&&s.focus(),y(i)}function g(){m=!1,t.setAttribute("aria-expanded","false"),t.setAttribute("aria-label","Open menu"),i.classList.remove("open"),document.body.style.overflow="",t.focus()}function f(){m?g():h()}t==null||t.addEventListener("click",f),r==null||r.addEventListener("click",g),i==null||i.querySelectorAll(".nav__mobile-link, .nav__mobile-cta").forEach(s=>{s.addEventListener("click",g)}),document.addEventListener("keydown",s=>{s.key==="Escape"&&m&&g()}),document.querySelectorAll('a[href^="#"]').forEach(s=>{s.addEventListener("click",function(c){const d=this.getAttribute("href");if(d==="#")return;const v=document.querySelector(d);if(v){c.preventDefault();const k=n.offsetHeight,p=v.getBoundingClientRect().top+window.scrollY-k;window.scrollTo({top:p,behavior:"smooth"})}})});function y(s){const c=s.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'),d=c[0],v=c[c.length-1];s.addEventListener("keydown",function(p){p.key==="Tab"&&(p.shiftKey?document.activeElement===d&&(p.preventDefault(),v.focus()):document.activeElement===v&&(p.preventDefault(),d.focus()))})}}L();const l={images:{founder1:"assets/images/IMG_0281.webp",founder2:"assets/images/IMG_3074.webp",drShabnamLogo:"assets/images/dr_shabnam_logo.webp",everglowLogo:"assets/images/everglow_logo.webp",skLogo:"assets/images/sk_logo.webp"},videos:{drShabnam:{mp4:"assets/videos/dr_shabnam_compressed.mp4",webm:"assets/videos/dr_shabnam.webm",poster:"assets/videos/dr_shabnam_poster.webp"},everglow:{mp4:"assets/videos/everglow_compressed.mp4",webm:"assets/videos/everglow.webm",poster:"assets/videos/everglow_poster.webp"},naanUngalSk:{mp4:"assets/videos/naan_ungal_sk_compressed.mp4",webm:"assets/videos/naan_ungal_sk.webm",poster:"assets/videos/naan_ungal_sk_poster.webp"}}},M=[{title:"Dr. Shabnam's Personal Branding",category:"Healthcare · Personal Brand",description:"Brand Design & Strategy",link:"https://www.instagram.com/dr.shabnams_fertility_center/?hl=en",video:l.videos.drShabnam,image:l.images.drShabnamLogo,logo:l.images.drShabnamLogo},{title:"Everglow Makeup Artistry",category:"Beauty & Lifestyle",description:"Visual Identity & Creative",link:"https://www.instagram.com/everglow_makeupartistry?igsh=ejNoNDdkd2J1cHdu",video:l.videos.everglow,image:l.images.everglowLogo,logo:l.images.everglowLogo},{title:"Naan Ungal SK",category:"Personal Brand · Creator",description:"Content Creation & Media",link:"https://www.instagram.com/naan.ungal_sk/",video:l.videos.naanUngalSk,image:l.images.skLogo,logo:l.images.skLogo}];function E(){const n=document.getElementById("work-showcase");n&&(n.innerHTML=M.map((e,t)=>`
    <article class="work-item reveal" data-delay="${t+1}" role="listitem">
      <div class="work-media">
        <picture>
          <source srcset="${e.image}" type="image/webp">
          <img src="${e.logo}" alt="${e.title}" loading="lazy" />
        </picture>
        <video loop muted playsinline aria-hidden="true" poster="${e.video.poster}" preload="metadata">
          <source src="${e.video.webm}" type="video/webm">
          <source src="${e.video.mp4}" type="video/mp4">
        </video>
      </div>
      <div class="work-content">
        <span class="work-category">${e.category}</span>
        <h3 class="work-title">${e.title}</h3>
        <p class="work-description">${e.description}</p>
        <a href="${e.link}" ${e.link!=="#"?'target="_blank" rel="noopener noreferrer"':""} class="work-link">
          View case study
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
        </a>
      </div>
    </article>
  `).join(""),n.querySelectorAll(".work-item").forEach(e=>{const t=e.querySelector("video"),i=e.querySelector(".work-media");if(!t||!i)return;const r=()=>{i.classList.add("work-media--video-active"),t.play().catch(()=>{})},o=()=>{i.classList.remove("work-media--video-active"),t.pause(),t.currentTime=0};e.addEventListener("mouseenter",r),e.addEventListener("mouseleave",o),e.addEventListener("touchstart",r,{passive:!0}),e.addEventListener("focus",r),e.addEventListener("blur",o)}))}const _=[{number:"01",title:"Strategy",description:"Research-driven growth roadmaps with channel mix, budget allocation, and clear KPIs tailored to your business stage."},{number:"02",title:"Creative",description:"Scroll-stopping creatives, reels, and brand storytelling tailored to your audience — designed to convert, not just impress."},{number:"03",title:"Performance",description:"High-ROAS paid campaigns across Google, Meta, and beyond — engineered to convert with rigorous testing and optimization."},{number:"04",title:"Technology",description:"Fast, conversion-focused websites and marketing automation that turn visitors into paying customers on autopilot."},{number:"05",title:"Brand",description:"Visual identity systems and brand strategy that make you unmissable — from logo to voice to full guidelines."},{number:"06",title:"Growth",description:"End-to-end funnels that capture, nurture, and convert qualified leads — SEO, email, cold outreach, and retention."}];function S(){const n=document.getElementById("solutions-list");n&&(n.innerHTML=_.map((e,t)=>`
    <article class="solution-item reveal" data-delay="${t+1}" role="listitem">
      <span class="solution-number">${e.number}</span>
      <div class="solution-content">
        <h3 class="solution-title">${e.title}</h3>
        <p class="solution-description">${e.description}</p>
      </div>
    </article>
  `).join(""))}const x=[["01","Lead to Client Processing","We qualify every inbound lead and walk them through a clear, structured intake."],["02","Problem Identification","Deep-dive audits to uncover the real bottlenecks holding your brand back."],["03","Strategy Forming","A tailored roadmap with channels, budget allocation, creative direction and KPIs."],["04","Work Promise & Projection","Transparent deliverables, timelines and realistic growth projections — no fluff."],["05","Agreement Signing","Clear scope, pricing and terms locked in so we can move fast with full alignment."],["06","Client Onboarding","Smooth onboarding, access setup and kickoff so campaigns go live without friction."]];function B(){const n=document.getElementById("process-timeline");n&&(n.innerHTML=x.map((e,t)=>`
    <li class="process-step reveal" data-delay="${t+1}" role="listitem">
      <span class="step-number">${e[0]}</span>
      <div class="step-content">
        <h3 class="step-title">${e[1]}</h3>
        <p class="step-description">${e[2]}</p>
      </div>
    </li>
  `).join(""))}function A(){const n=document.getElementById("about-story");n&&(n.innerHTML=`
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
    <div class="founders-grid" role="list">
      <article class="founder-portrait image-reveal reveal" data-delay="3" role="listitem">
        <picture>
          <source srcset="${l.images.founder1}" type="image/webp">
          <img src="IMG_0281.PNG" alt="Mohamed Aashiq, Founder of Adplix Media" loading="lazy" />
        </picture>
      </article>
      <article class="founder-portrait image-reveal reveal" data-delay="4" role="listitem">
        <picture>
          <source srcset="${l.images.founder2}" type="image/webp">
          <img src="IMG_3074.JPG.jpeg" alt="Barani Dharan, Founder of Adplix Media" loading="lazy" />
        </picture>
      </article>
    </div>
    <div class="founder-info reveal" data-delay="5">
      <div style="display: grid; gap: var(--space-8); grid-template-columns: 1fr;">
        <div style="text-align: center;">
          <h4 class="founder-name">Mohamed Aashiq</h4>
          <p class="founder-role">Founder</p>
          <div class="founder-social">
            <a href="https://www.instagram.com/adplixmedia?igsh=MXhyc2w5Mnhob3Z6" target="_blank" rel="noopener noreferrer" aria-label="Mohamed Aashiq on Instagram"><svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37zM17.5 6.5h.01" /></svg></a>
            <a href="https://www.linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="Mohamed Aashiq on LinkedIn"><svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" /><circle cx="4" cy="4" r="2" /></svg></a>
          </div>
        </div>
        <div style="text-align: center;">
          <h4 class="founder-name">Barani Dharan</h4>
          <p class="founder-role">Founder</p>
          <div class="founder-social">
            <a href="https://www.instagram.com/adplixmedia?igsh=MXhyc2w5Mnhob3Z6" target="_blank" rel="noopener noreferrer" aria-label="Barani Dharan on Instagram"><svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37zM17.5 6.5h.01" /></svg></a>
            <a href="https://www.linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="Barani Dharan on LinkedIn"><svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" /><circle cx="4" cy="4" r="2" /></svg></a>
          </div>
        </div>
      </div>
    </div>
  `)}const I=[["Adplix didn't just run our ads — they rebuilt our entire growth engine. We 4x'd revenue in under a year.","Dr. Shabnam","Personal Branding, Healthcare"],["The most transparent agency we've ever worked with. Real strategy, real numbers, no fluff.","EverGlow Makeup Artistry","Personal Branding, Beauty & Lifestyle"],["Their creative team gets it. Every ad feels native to the platform and converts like crazy.","Nyo Café","Brand Design & Marketing"]];function q(){const n=document.getElementById("testi-grid");n&&(n.innerHTML=I.map((e,t)=>`
    <article class="card-insight reveal" data-delay="${t+1}" role="listitem">
      <div class="card-insight__rating" aria-label="5 star rating">★★★★★</div>
      <p class="card-insight__quote">&ldquo;${e[0]}&rdquo;</p>
      <div class="card-insight__author">
        <div class="card-insight__avatar">${e[1][0]}</div>
        <div>
          <p class="card-insight__name">${e[1]}</p>
          <p class="card-insight__role">${e[2]}</p>
        </div>
      </div>
    </article>
  `).join(""))}function T(){const n=document.getElementById("heroStats");if(!n)return;const e=new IntersectionObserver(t=>{t.forEach(i=>{if(i.isIntersecting){const r=i.target;r.querySelectorAll(".counter").forEach(a=>{const u=parseInt(a.dataset.target),w=2e3,m=performance.now();function h(g){const f=Math.min((g-m)/w,1),y=1-Math.pow(1-f,3);a.textContent=Math.floor(y*u)+(u>=10?"+":"×"),f<1&&requestAnimationFrame(h)}requestAnimationFrame(h)}),e.unobserve(r)}})},{threshold:.9});e.observe(n)}let b;function $(){b=new IntersectionObserver(e=>{e.forEach(t=>{t.isIntersecting&&(t.target.classList.add("visible"),b.unobserve(t.target))})},{root:null,rootMargin:"0px 0px -10% 0px",threshold:.1}),document.querySelectorAll(".reveal").forEach(e=>b.observe(e));const n=new IntersectionObserver(e=>{e.forEach(t=>{t.isIntersecting&&(t.target.classList.add("visible"),n.unobserve(t.target))})},{rootMargin:"0px 0px -5% 0px",threshold:.1});document.querySelectorAll(".image-reveal").forEach(e=>n.observe(e))}function H(){if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const e=document.querySelector(".hero__bg-image");let t=null;function i(){const r=window.scrollY;e&&(e.style.transform=`translateY(${r*.2}px)`),t=null}window.addEventListener("scroll",()=>{t===null&&(t=requestAnimationFrame(i))},{passive:!0})}function C(){const n=document.getElementById("showreelBtn"),e=document.getElementById("showreelModal"),t=document.getElementById("showreelVideo"),i=e==null?void 0:e.querySelector(".modal-close");if(!n||!e)return;function r(){e.classList.add("open"),t.currentTime=0,t.play().catch(()=>{}),document.body.style.overflow="hidden",i==null||i.focus()}function o(){e.classList.remove("open"),t.pause(),document.body.style.overflow=""}n.addEventListener("click",r),i==null||i.addEventListener("click",o),e.addEventListener("click",a=>{a.target===e&&o()}),document.addEventListener("keydown",a=>{a.key==="Escape"&&e.classList.contains("open")&&o()})}function P(){typeof emailjs<"u"&&emailjs.init({publicKey:"KgNOVTtHaCQUo5WGf"})}function F(){const n=document.getElementById("contactForm");n&&n.addEventListener("submit",function(e){e.preventDefault();const t=this.querySelector('button[type="submit"]'),i=t.innerHTML;t.innerHTML='<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Sending...</span>',t.disabled=!0,typeof emailjs<"u"?emailjs.sendForm("service_nkxjsi7","template_e208uof",this).then(()=>{alert("Message sent successfully! We'll get back to you within 24 hours."),n.reset(),t.innerHTML=i,t.disabled=!1},r=>{console.error("FAILED...",r),alert("Error sending message. Please try again or email us directly at adplixupload@gmail.com"),t.innerHTML=i,t.disabled=!1}):setTimeout(()=>{alert("Message sent successfully! We'll get back to you within 24 hours."),n.reset(),t.innerHTML=i,t.disabled=!1},800)})}function O(){const n=document.getElementById("newsletterForm");n&&n.addEventListener("submit",function(e){e.preventDefault();const t=this.querySelector('input[name="email"]').value;if(this.querySelector('input[name="hp"]').checked)return;const r=this.querySelector('button[type="submit"]'),o=r.innerHTML;r.innerHTML='<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Subscribing...</span>',r.disabled=!0,setTimeout(()=>{alert(`Thanks for subscribing! (${t})`),n.reset(),r.innerHTML=o,r.disabled=!1},800)})}function D(){document.querySelectorAll(".btn-magnetic").forEach(n=>{n.addEventListener("mousemove",e=>{const t=n.getBoundingClientRect(),i=e.clientX-t.left-t.width/2,r=e.clientY-t.top-t.height/2;n.style.transform=`translate(${i*.15}px, ${r*.15}px)`}),n.addEventListener("mouseleave",()=>{n.style.transform=""})})}function j(){const n=document.getElementById("yr");n&&(n.textContent=new Date().getFullYear())}document.addEventListener("DOMContentLoaded",()=>{E(),S(),B(),A(),q(),T(),$(),H(),C(),P(),F(),O(),D(),j()});
