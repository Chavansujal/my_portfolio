document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const navbar = document.getElementById('navbar');
  const navLinks = document.getElementById('navLinks');
  const navHamburger = document.getElementById('navHamburger');
  const allNavLinks = document.querySelectorAll('.nav-links a:not(.nav-cta)');
  const sections = document.querySelectorAll('section[id]');
  const heroContent = document.getElementById('heroContent');
  const dashboardInner = document.getElementById('dashboardInner');
  const heroDashboard = document.getElementById('heroDashboard');
  const revealElements = document.querySelectorAll(
    '.reveal, .reveal-left, .reveal-right, .reveal-scale, .stagger-children'
  );

  const canvas = document.getElementById('particles-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;

  let targetRotateX = 4;
  let targetRotateY = -8;
  let currentRotateX = 4;
  let currentRotateY = -8;

  let mouseX = 0;
  let mouseY = 0;
  let particles = [];

  function updateNavbar() {
    if (!navbar) return;
    if (window.scrollY > 60) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }

  function setActiveNav() {
    const scrollY = window.scrollY + 120;
    sections.forEach((section) => {
      const top = section.offsetTop;
      const height = section.offsetHeight;
      const id = section.getAttribute('id');
      const link = document.querySelector(`.nav-links a[href="#${id}"]`);

      if (!link) return;

      if (scrollY >= top && scrollY < top + height) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  if (navHamburger && navLinks) {
    navHamburger.addEventListener('click', () => {
      navHamburger.classList.toggle('active');
      navLinks.classList.toggle('mobile-open');
    });

    allNavLinks.forEach((link) => {
      link.addEventListener('click', () => {
        navHamburger.classList.remove('active');
        navLinks.classList.remove('mobile-open');
      });
    });
  }

  window.addEventListener('scroll', updateNavbar, { passive: true });
  window.addEventListener('scroll', setActiveNav, { passive: true });
  updateNavbar();
  setActiveNav();

  if (heroContent) {
    setTimeout(() => {
      heroContent.classList.add('animate');
    }, 200);
  }

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );

  revealElements.forEach((el) => revealObserver.observe(el));

  if (heroDashboard) {
    document.addEventListener('mousemove', (e) => {
      if (window.innerWidth < 1024) return;

      const rect = heroDashboard.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = (e.clientX - centerX) / (rect.width / 2);
      const dy = (e.clientY - centerY) / (rect.height / 2);

      targetRotateY = -8 + dx * 12;
      targetRotateX = 4 - dy * 8;
    });
  }

  function animateDashboard() {
    if (dashboardInner) {
      currentRotateX += (targetRotateX - currentRotateX) * 0.06;
      currentRotateY += (targetRotateY - currentRotateY) * 0.06;
      dashboardInner.style.transform =
        `rotateY(${currentRotateY}deg) rotateX(${currentRotateX}deg)`;
    }

    requestAnimationFrame(animateDashboard);
  }

  animateDashboard();

  if (canvas && ctx) {
    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    class Particle {
      constructor() {
        this.reset();
      }

      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.3;
        this.speedY = (Math.random() - 0.5) * 0.3;
        this.opacity = Math.random() * 0.4 + 0.1;
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;

        const dx = mouseX - this.x;
        const dy = mouseY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 200) {
          this.x += dx * 0.0005;
          this.y += dy * 0.0005;
        }

        if (
          this.x < 0 ||
          this.x > canvas.width ||
          this.y < 0 ||
          this.y > canvas.height
        ) {
          this.reset();
        }
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 229, 255, ${this.opacity})`;
        ctx.fill();
      }
    }

    function initParticles() {
      resizeCanvas();
      particles = [];

      const particleCount = Math.min(80, Math.floor(window.innerWidth / 20));
      for (let i = 0; i < particleCount; i += 1) {
        particles.push(new Particle());
      }
    }

    function animateParticles() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((particle) => {
        particle.update();
        particle.draw();
      });

      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 229, 255, ${0.06 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      requestAnimationFrame(animateParticles);
    }

    initParticles();
    animateParticles();

    window.addEventListener('resize', () => {
      resizeCanvas();
      initParticles();
    });
  }

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function onAnchorClick(e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (!target) return;

      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const activityBars = document.querySelectorAll('.activity-bars .bar');
  if (activityBars.length) {
    setInterval(() => {
      activityBars.forEach((bar) => {
        const h = Math.floor(Math.random() * 60 + 30);
        bar.style.height = `${h}%`;
        bar.style.transition = 'height 1.5s cubic-bezier(0.4, 0, 0.2, 1)';
      });
    }, 3000);
  }
});
