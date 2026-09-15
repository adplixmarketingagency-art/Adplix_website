(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))n(i);new MutationObserver(i=>{for(const a of i)if(a.type==="childList")for(const l of a.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function t(i){const a={};return i.integrity&&(a.integrity=i.integrity),i.referrerPolicy&&(a.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?a.credentials="include":i.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function n(i){if(i.ep)return;i.ep=!0;const a=t(i);fetch(i.href,a)}})();function M(){const r=document.getElementById("nav"),e=document.getElementById("scrollProgress"),t=document.getElementById("mobileMenuBtn"),n=document.getElementById("mobileMenu"),i=document.getElementById("mobileMenuClose");if(!r)return;let a=null;function l(){const s=window.scrollY,d=document.documentElement.scrollHeight-window.innerHeight,c=d>0?s/d:0;e&&(e.style.transform=`scaleX(${c})`),a=null}window.addEventListener("scroll",()=>{a===null&&(a=requestAnimationFrame(l))},{passive:!0});let u=null;function y(){window.scrollY>100?r.classList.add("nav--scrolled"):r.classList.remove("nav--scrolled"),u=null}window.addEventListener("scroll",()=>{u===null&&(u=requestAnimationFrame(y))},{passive:!0});let m=!1;function f(){m=!0,t.setAttribute("aria-expanded","true"),t.setAttribute("aria-label","Close menu"),n.classList.add("open"),document.body.style.overflow="hidden";const s=n.querySelector(".nav__mobile-link");s&&s.focus(),w(n)}function g(){m=!1,t.setAttribute("aria-expanded","false"),t.setAttribute("aria-label","Open menu"),n.classList.remove("open"),document.body.style.overflow="",t.focus()}function h(){m?g():f()}t==null||t.addEventListener("click",h),i==null||i.addEventListener("click",g),n==null||n.querySelectorAll(".nav__mobile-link, .nav__mobile-cta").forEach(s=>{s.addEventListener("click",g)}),document.addEventListener("keydown",s=>{s.key==="Escape"&&m&&g()}),document.querySelectorAll('a[href^="#"]').forEach(s=>{s.addEventListener("click",function(d){const c=this.getAttribute("href");if(c==="#")return;const v=document.querySelector(c);if(v){d.preventDefault();const k=r.offsetHeight,p=v.getBoundingClientRect().top+window.scrollY-k;window.scrollTo({top:p,behavior:"smooth"})}})});function w(s){const d=s.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'),c=d[0],v=d[d.length-1];s.addEventListener("keydown",function(p){p.key==="Tab"&&(p.shiftKey?document.activeElement===c&&(p.preventDefault(),v.focus()):document.activeElement===v&&(p.preventDefault(),c.focus()))})}}M();const o={images:{founder1:"images/IMG_0281.webp",founder2:"images/IMG_3074.webp",drShabnamLogo:"images/dr_shabnam_logo.webp",everglowLogo:"images/everglow_logo.webp",skLogo:"images/sk_logo.webp"},videos:{drShabnam:{mp4:"videos/dr_shabnam_compressed.mp4",webm:"videos/dr_shabnam.webm",poster:"videos/dr_shabnam_poster.webp"},everglow:{mp4:"videos/everglow_compressed.mp4",webm:"videos/everglow.webm",poster:"videos/everglow_poster.webp"},naanUngalSk:{mp4:"videos/naan_ungal_sk_compressed.mp4",webm:"videos/naan_ungal_sk.webm",poster:"videos/naan_ungal_sk_poster.webp"}}},L=[{title:"Dr. Shabnam's Personal Branding",category:"Healthcare · Personal Brand",description:"Brand Design & Strategy",link:"https://www.instagram.com/dr.shabnams_fertility_center/?hl=en",video:o.videos.drShabnam,image:o.images.drShabnamLogo,logo:o.images.drShabnamLogo},{title:"Everglow Makeup Artistry",category:"Beauty & Lifestyle",description:"Visual Identity & Creative",link:"https://www.instagram.com/everglow_makeupartistry?igsh=ejNoNDdkd2J1cHdu",video:o.videos.everglow,image:o.images.everglowLogo,logo:o.images.everglowLogo},{title:"Naan Ungal SK",category:"Personal Brand · Creator",description:"Content Creation & Media",link:"https://www.instagram.com/naan.ungal_sk/",video:o.videos.naanUngalSk,image:o.images.skLogo,logo:o.images.skLogo}];function E(){const r=document.getElementById("work-showcase");r&&(r.innerHTML=L.map((e,t)=>`
    <article class="work-item reveal" data-delay="${t+1}" role="listitem">
      <div class="work-media">
        <picture>
          <source srcset="${e.image}" type="image/webp">
          <img src="${e.logo}" alt="${e.title}" loading="lazy" />
        </picture>
        <video loop muted playsinline aria-hidden="true" poster="${e.video.poster}" preload="none">
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
  `).join(""),r.querySelectorAll(".work-item").forEach(e=>{const t=e.querySelector("video"),n=e.querySelector(".work-media");if(!t||!n)return;const i=()=>{n.classList.add("work-media--video-active"),t.play().catch(()=>{})},a=()=>{n.classList.remove("work-media--video-active"),t.pause()};e.addEventListener("pointerenter",i),e.addEventListener("pointerleave",a),e.addEventListener("focus",i),e.addEventListener("blur",a)}))}const S=[{number:"01",title:"Strategy",description:"Research-driven growth roadmaps with channel mix, budget allocation, and clear KPIs tailored to your business stage."},{number:"02",title:"Creative",description:"Scroll-stopping creatives, reels, and brand storytelling tailored to your audience — designed to convert, not just impress."},{number:"03",title:"Performance",description:"High-ROAS paid campaigns across Google, Meta, and beyond — engineered to convert with rigorous testing and optimization."},{number:"04",title:"Technology",description:"Fast, conversion-focused websites and marketing automation that turn visitors into paying customers on autopilot."},{number:"05",title:"Brand",description:"Visual identity systems and brand strategy that make you unmissable — from logo to voice to full guidelines."},{number:"06",title:"Growth",description:"End-to-end funnels that capture, nurture, and convert qualified leads — SEO, email, cold outreach, and retention."}];function _(){const r=document.getElementById("solutions-list");r&&(r.innerHTML=S.map((e,t)=>`
    <article class="solution-item reveal" data-delay="${t+1}" role="listitem">
      <span class="solution-number">${e.number}</span>
      <div class="solution-content">
        <h3 class="solution-title">${e.title}</h3>
        <p class="solution-description">${e.description}</p>
      </div>
    </article>
  `).join(""))}const x=[["01","Lead to Client Processing","We qualify every inbound lead and walk them through a clear, structured intake."],["02","Problem Identification","Deep-dive audits to uncover the real bottlenecks holding your brand back."],["03","Strategy Forming","A tailored roadmap with channels, budget allocation, creative direction and KPIs."],["04","Work Promise & Projection","Transparent deliverables, timelines and realistic growth projections — no fluff."],["05","Agreement Signing","Clear scope, pricing and terms locked in so we can move fast with full alignment."],["06","Client Onboarding","Smooth onboarding, access setup and kickoff so campaigns go live without friction."]];function A(){const r=document.getElementById("process-timeline");r&&(r.innerHTML=x.map((e,t)=>`
    <li class="process-step reveal" data-delay="${t+1}" role="listitem">
      <span class="step-number">${e[0]}</span>
      <div class="step-content">
        <h3 class="step-title">${e[1]}</h3>
        <p class="step-description">${e[2]}</p>
      </div>
    </li>
  `).join(""))}function B(){var e;const r=document.getElementById("about-story");r&&(r.innerHTML=`
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
          <source srcset="${o.images.founder1}" type="image/webp">
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
          <source srcset="${o.images.founder2}" type="image/webp">
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
            <source srcset="${o.images.founder1}" type="image/webp">
            <img src="${o.images.founder1}" alt="Mohamed Aashiq, Founder of Adplix Media" loading="lazy" />
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
            <source srcset="${o.images.founder2}" type="image/webp">
            <img src="${o.images.founder2}" alt="Barani Dharan, Founder of Adplix Media" loading="lazy" />
          </picture>
        </div>
        <div class="founder-info">
          <h4 class="founder-name">Barani Dharan</h4>
          <p class="founder-role">Founder</p>
        </div>
      </article>
    </div>
  `,(e=r.querySelector(".founders-grid--legacy"))==null||e.remove(),r.insertAdjacentHTML("beforeend",`
    <div class="founders-grid founders-grid--clean" role="list">
      <article class="founder-card reveal" data-delay="3" role="listitem">
        <div class="founder-portrait image-reveal">
          <picture>
            <source srcset="${o.images.founder1}" type="image/webp">
            <img src="${o.images.founder1}" alt="Mohamed Aashiq, Founder of Adplix Media" loading="lazy" />
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
            <source srcset="${o.images.founder2}" type="image/webp">
            <img src="${o.images.founder2}" alt="Barani Dharan, Founder of Adplix Media" loading="lazy" />
          </picture>
        </div>
        <div class="founder-info">
          <h4 class="founder-name">Barani Dharan</h4>
          <p class="founder-role">Founder</p>
        </div>
      </article>
    </div>
  `))}const q=[["Adplix didn't just run our ads — they rebuilt our entire growth engine. We 4x'd revenue in under a year.","Dr. Shabnam","Personal Branding, Healthcare"],["The most transparent agency we've ever worked with. Real strategy, real numbers, no fluff.","EverGlow Makeup Artistry","Personal Branding, Beauty & Lifestyle"],["Their creative team gets it. Every ad feels native to the platform and converts like crazy.","Nyo Café","Brand Design & Marketing"]];function I(){const r=document.getElementById("testi-grid");r&&(r.innerHTML=q.map((e,t)=>`
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
  `).join(""))}function $(){const r=document.getElementById("heroStats");if(!r)return;const e=new IntersectionObserver(t=>{t.forEach(n=>{if(n.isIntersecting){const i=n.target;i.querySelectorAll(".counter").forEach(l=>{const u=parseInt(l.dataset.target),y=2e3,m=performance.now();function f(g){const h=Math.min((g-m)/y,1),w=1-Math.pow(1-h,3);l.textContent=Math.floor(w*u)+(u>=10?"+":"×"),h<1&&requestAnimationFrame(f)}requestAnimationFrame(f)}),e.unobserve(i)}})},{threshold:.9});e.observe(r)}let b;function T(){b=new IntersectionObserver(e=>{e.forEach(t=>{t.isIntersecting&&(t.target.classList.add("visible"),b.unobserve(t.target))})},{root:null,rootMargin:"0px 0px -10% 0px",threshold:.1}),document.querySelectorAll(".reveal").forEach(e=>b.observe(e));const r=new IntersectionObserver(e=>{e.forEach(t=>{t.isIntersecting&&(t.target.classList.add("visible"),r.unobserve(t.target))})},{rootMargin:"0px 0px -5% 0px",threshold:.1});document.querySelectorAll(".image-reveal").forEach(e=>r.observe(e))}function F(){const r=document.getElementById("showreelBtn"),e=document.getElementById("showreelModal"),t=document.getElementById("showreelVideo"),n=e==null?void 0:e.querySelector(".modal-close");if(!r||!e)return;function i(){e.classList.add("open"),t.currentTime=0,t.play().catch(()=>{}),document.body.style.overflow="hidden",n==null||n.focus()}function a(){e.classList.remove("open"),t.pause(),document.body.style.overflow=""}r.addEventListener("click",i),n==null||n.addEventListener("click",a),e.addEventListener("click",l=>{l.target===e&&a()}),document.addEventListener("keydown",l=>{l.key==="Escape"&&e.classList.contains("open")&&a()})}function H(){typeof emailjs<"u"&&emailjs.init({publicKey:"KgNOVTtHaCQUo5WGf"})}function C(){const r=document.getElementById("contactForm");r&&r.addEventListener("submit",function(e){e.preventDefault();const t=this.querySelector('button[type="submit"]'),n=t.innerHTML;t.innerHTML='<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Sending...</span>',t.disabled=!0,typeof emailjs<"u"?emailjs.sendForm("service_nkxjsi7","template_e208uof",this).then(()=>{alert("Message sent successfully! We'll get back to you within 24 hours."),r.reset(),t.innerHTML=n,t.disabled=!1},i=>{console.error("FAILED...",i),alert("Error sending message. Please try again or email us directly at adplixupload@gmail.com"),t.innerHTML=n,t.disabled=!1}):setTimeout(()=>{alert("Message sent successfully! We'll get back to you within 24 hours."),r.reset(),t.innerHTML=n,t.disabled=!1},800)})}function P(){const r=document.getElementById("newsletterForm");r&&r.addEventListener("submit",function(e){e.preventDefault();const t=this.querySelector('input[name="email"]').value;if(this.querySelector('input[name="hp"]').checked)return;const i=this.querySelector('button[type="submit"]'),a=i.innerHTML;i.innerHTML='<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Subscribing...</span>',i.disabled=!0,setTimeout(()=>{alert(`Thanks for subscribing! (${t})`),r.reset(),i.innerHTML=a,i.disabled=!1},800)})}function D(){document.querySelectorAll(".btn-magnetic").forEach(r=>{r.addEventListener("mousemove",e=>{const t=r.getBoundingClientRect(),n=e.clientX-t.left-t.width/2,i=e.clientY-t.top-t.height/2;r.style.transform=`translate(${n*.15}px, ${i*.15}px)`}),r.addEventListener("mouseleave",()=>{r.style.transform=""})})}function z(){const r=document.getElementById("yr");r&&(r.textContent=new Date().getFullYear())}document.addEventListener("DOMContentLoaded",()=>{E(),_(),A(),B(),I(),$(),T(),F(),H(),C(),P(),D(),z()});
