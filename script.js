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
  const ctx = canvas.getContext('2d');

  const gestureToggle = document.getElementById('gestureToggle');
  const gestureToggleLabel = document.getElementById('gestureToggleLabel');
  const gestureStatus = document.getElementById('gestureStatus');
  const gesturePreview = document.getElementById('gesturePreview');
  const gestureVideo = document.getElementById('gestureVideo');
  const gestureCanvas = document.getElementById('gestureCanvas');
  const gestureCursor = document.getElementById('gestureCursor');
  const statusCamera = document.getElementById('statusCamera');
  const statusGesture = document.getElementById('statusGesture');
  const statusHand = document.getElementById('statusHand');
  const statusFingers = document.getElementById('statusFingers');
  const canvasCtx = gestureCanvas.getContext('2d');

  let gestureEnabled = false;
  let handLandmarker = null;
  let stream = null;
  let animFrameId = null;
  let lastVideoTime = -1;

  let targetRotateX = 4;
  let targetRotateY = -8;
  let currentRotateX = 4;
  let currentRotateY = -8;

  let mouseX = 0;
  let mouseY = 0;
  let cursorX = window.innerWidth * 0.5;
  let cursorY = window.innerHeight * 0.5;
  let smoothHandX = 0.5;
  let smoothHandY = 0.5;
  let noHandFrames = 0;
  let pinchActive = false;
  let pinchLatch = false;
  let hoveredElement = null;
  let particles = [];

  const LERP_FACTOR = 0.14;
  const NO_HAND_THRESHOLD = 15;
  const EDGE_SCROLL_ZONE = 90;
  const EDGE_SCROLL_SPEED = 18;
  const PINCH_THRESHOLD = 0.055;
  const PINCH_RELEASE = 0.085;
  const INTERACTIVE_SELECTOR =
    'a, button, [role="button"], .project-card, .timeline-card, .contact-icon, .nav-logo, .framework-chip, .skill-icon-card, .gesture-toggle';

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function setStatus(el, text, mode) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('on', 'off');
    if (mode) el.classList.add(mode);
  }

  function updateNavbar() {
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

  window.addEventListener('scroll', updateNavbar, { passive: true });
  window.addEventListener('scroll', setActiveNav, { passive: true });
  updateNavbar();
  setActiveNav();

  setTimeout(() => {
    heroContent.classList.add('animate');
  }, 200);

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
      if (gestureEnabled || window.innerWidth < 1024) return;

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
    updateGestureCursor(
      Math.min(cursorX, window.innerWidth - 20),
      Math.min(cursorY, window.innerHeight - 20)
    );
  });

  document.addEventListener('mousemove', (e) => {
    if (gestureEnabled) return;
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

  function updateGestureCursor(x, y) {
    cursorX = x;
    cursorY = y;
    if (gestureCursor) {
      gestureCursor.style.transform = `translate3d(${x - 14}px, ${y - 14}px, 0)`;
    }
  }

  function clearHoveredElement() {
    if (hoveredElement) {
      hoveredElement.classList.remove('gesture-hover');
      hoveredElement = null;
    }

    if (gestureCursor) {
      gestureCursor.classList.remove('hovering');
    }
  }

  function findInteractiveElement(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    return el.closest(INTERACTIVE_SELECTOR);
  }

  function updateHoverTarget(x, y) {
    const nextTarget = findInteractiveElement(x, y);

    if (nextTarget === hoveredElement) return;

    if (hoveredElement) {
      hoveredElement.classList.remove('gesture-hover');
    }

    hoveredElement = nextTarget;

    if (hoveredElement) {
      hoveredElement.classList.add('gesture-hover');
      gestureCursor.classList.add('hovering');
    } else {
      gestureCursor.classList.remove('hovering');
    }
  }

  function activateTarget(target) {
    if (!target) return;

    target.classList.add('gesture-hover');
    target.click?.();
  }

  function handleEdgeScroll(x, y) {
    let scrollDelta = 0;

    if (y < EDGE_SCROLL_ZONE) {
      scrollDelta = -lerp(4, EDGE_SCROLL_SPEED, 1 - y / EDGE_SCROLL_ZONE);
    } else if (y > window.innerHeight - EDGE_SCROLL_ZONE) {
      const ratio = (y - (window.innerHeight - EDGE_SCROLL_ZONE)) / EDGE_SCROLL_ZONE;
      scrollDelta = lerp(4, EDGE_SCROLL_SPEED, ratio);
    }

    if (scrollDelta !== 0) {
      window.scrollBy({ top: scrollDelta, behavior: 'auto' });
    }
  }

  function countRaisedFingers(hand) {
    let count = 0;
    const raised = {
      thumb: false,
      index: false,
      middle: false,
      ring: false,
      pinky: false,
    };

    const thumbTip = hand[4];
    const thumbIP = hand[3];
    const wrist = hand[0];
    const thumbTipDist = Math.abs(thumbTip.x - wrist.x);
    const thumbIPDist = Math.abs(thumbIP.x - wrist.x);

    if (thumbTipDist > thumbIPDist) {
      count += 1;
      raised.thumb = true;
    }

    if (hand[8].y < hand[6].y) {
      count += 1;
      raised.index = true;
    }

    if (hand[12].y < hand[10].y) {
      count += 1;
      raised.middle = true;
    }

    if (hand[16].y < hand[14].y) {
      count += 1;
      raised.ring = true;
    }

    if (hand[20].y < hand[18].y) {
      count += 1;
      raised.pinky = true;
    }

    return { count, raised };
  }

  function applyGestureParallax(normalizedX, normalizedY) {
    if (dashboardInner) {
      targetRotateY = (normalizedX - 0.5) * -30;
      targetRotateX = (normalizedY - 0.5) * 20;
    }

    const floats = document.querySelectorAll('.hero-float');
    floats.forEach((f, i) => {
      const intensity = (i + 1) * 8;
      f.style.transform =
        `translate(${(normalizedX - 0.5) * intensity}px, ${(normalizedY - 0.5) * intensity}px)`;
    });

    const glow1 = document.querySelector('.hero-glow-1');
    const glow2 = document.querySelector('.hero-glow-2');
    if (glow1) {
      glow1.style.transform =
        `translate(${(normalizedX - 0.5) * 50}px, ${(normalizedY - 0.5) * 40}px)`;
    }
    if (glow2) {
      glow2.style.transform =
        `translate(${(normalizedX - 0.5) * -40}px, ${(normalizedY - 0.5) * -30}px)`;
    }
  }

  function clearGestureTransforms() {
    document.querySelectorAll('.hero-float').forEach((f) => {
      f.style.transform = '';
    });

    const glow1 = document.querySelector('.hero-glow-1');
    const glow2 = document.querySelector('.hero-glow-2');
    if (glow1) glow1.style.transform = '';
    if (glow2) glow2.style.transform = '';
  }

  function updateGesturePointer(hand, fingerInfo) {
    const indexTip = hand[8];
    const thumbTip = hand[4];
    const pointerX = (1 - indexTip.x) * window.innerWidth;
    const pointerY = indexTip.y * window.innerHeight;

    const nextX = lerp(cursorX, pointerX, 0.28);
    const nextY = lerp(cursorY, pointerY, 0.28);

    updateGestureCursor(nextX, nextY);
    updateHoverTarget(nextX, nextY);
    handleEdgeScroll(nextX, nextY);

    const pinchDistance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
    const pointerMode =
      fingerInfo.raised.index &&
      !fingerInfo.raised.middle &&
      !fingerInfo.raised.ring &&
      !fingerInfo.raised.pinky;

    if (pointerMode && pinchDistance < PINCH_THRESHOLD && !pinchLatch) {
      pinchLatch = true;
      pinchActive = true;
      gestureCursor.classList.add('clicking');
      activateTarget(hoveredElement);
    } else if (pinchDistance > PINCH_RELEASE) {
      pinchLatch = false;
      pinchActive = false;
      gestureCursor.classList.remove('clicking');
    }
  }

  async function initHandLandmarker() {
    try {
      const vision = await window.FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
      );

      try {
        handLandmarker = await window.HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      } catch (gpuErr) {
        console.warn('GPU delegate failed, using CPU fallback:', gpuErr);
        handLandmarker = await window.HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      }

      return true;
    } catch (err) {
      console.error('HandLandmarker init error:', err);
      return false;
    }
  }

  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      gestureVideo.srcObject = stream;
      gestureCanvas.width = 640;
      gestureCanvas.height = 480;
      await gestureVideo.play();
      return true;
    } catch (err) {
      console.error('Camera error:', err);
      return false;
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    if (gestureVideo) {
      gestureVideo.srcObject = null;
    }

    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  function drawLandmarks(landmarks, raisedInfo) {
    canvasCtx.clearRect(0, 0, gestureCanvas.width, gestureCanvas.height);
    if (!landmarks || landmarks.length === 0) return;

    const hand = landmarks[0];
    const raised = raisedInfo ? raisedInfo.raised : {};

    const fingerGroups = {
      thumb: [1, 2, 3, 4],
      index: [5, 6, 7, 8],
      middle: [9, 10, 11, 12],
      ring: [13, 14, 15, 16],
      pinky: [17, 18, 19, 20],
    };

    const activeLandmarks = new Set([0]);
    Object.entries(fingerGroups).forEach(([finger, indices]) => {
      if (raised[finger]) {
        indices.forEach((i) => activeLandmarks.add(i));
      }
    });

    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17],
    ];

    connections.forEach(([a, b]) => {
      const active = activeLandmarks.has(a) && activeLandmarks.has(b);
      canvasCtx.strokeStyle = active
        ? 'rgba(0, 255, 120, 0.8)'
        : 'rgba(0, 229, 255, 0.4)';
      canvasCtx.lineWidth = active ? 2.5 : 1.5;
      canvasCtx.beginPath();
      canvasCtx.moveTo(hand[a].x * gestureCanvas.width, hand[a].y * gestureCanvas.height);
      canvasCtx.lineTo(hand[b].x * gestureCanvas.width, hand[b].y * gestureCanvas.height);
      canvasCtx.stroke();
    });

    hand.forEach((point, idx) => {
      const active = activeLandmarks.has(idx);
      canvasCtx.beginPath();
      canvasCtx.arc(
        point.x * gestureCanvas.width,
        point.y * gestureCanvas.height,
        active ? 4 : 2.5,
        0,
        Math.PI * 2
      );
      canvasCtx.fillStyle = active
        ? 'rgba(0, 255, 120, 1)'
        : 'rgba(0, 229, 255, 0.7)';
      canvasCtx.fill();
    });

    if (raisedInfo && raisedInfo.raised.index) {
      const point = hand[8];
      canvasCtx.beginPath();
      canvasCtx.arc(
        point.x * gestureCanvas.width,
        point.y * gestureCanvas.height,
        18,
        0,
        Math.PI * 2
      );
      canvasCtx.strokeStyle = 'rgba(0, 255, 120, 0.5)';
      canvasCtx.lineWidth = 2;
      canvasCtx.stroke();
    }
  }

  function detectLoop() {
    if (!gestureEnabled || !handLandmarker) return;

    if (gestureVideo.readyState >= 2) {
      const currentTime = gestureVideo.currentTime;

      if (currentTime !== lastVideoTime) {
        lastVideoTime = currentTime;

        let result;
        try {
          result = handLandmarker.detectForVideo(gestureVideo, performance.now());
        } catch (err) {
          console.warn('Detection frame error:', err);
          animFrameId = requestAnimationFrame(detectLoop);
          return;
        }

        if (result.landmarks && result.landmarks.length > 0) {
          noHandFrames = 0;

          const hand = result.landmarks[0];
          const fingerInfo = countRaisedFingers(hand);
          const trackPoint = hand[9];
          const rawX = 1 - trackPoint.x;
          const rawY = trackPoint.y;

          smoothHandX = lerp(smoothHandX, rawX, LERP_FACTOR);
          smoothHandY = lerp(smoothHandY, rawY, LERP_FACTOR);

          applyGestureParallax(smoothHandX, smoothHandY);
          updateGesturePointer(hand, fingerInfo);
          drawLandmarks(result.landmarks, fingerInfo);

          setStatus(statusHand, 'Yes', 'on');
          setStatus(
            statusFingers,
            `${fingerInfo.count} up / ${pinchActive ? 'Pinch' : 'Tracking'}`,
            fingerInfo.count > 0 ? 'on' : 'off'
          );
        } else {
          noHandFrames += 1;

          if (noHandFrames > NO_HAND_THRESHOLD) {
            canvasCtx.clearRect(0, 0, gestureCanvas.width, gestureCanvas.height);
            setStatus(statusHand, 'No', 'off');
            setStatus(statusFingers, '--', '');
            pinchActive = false;
            pinchLatch = false;
            gestureCursor.classList.remove('clicking');
            clearHoveredElement();
          }
        }
      }
    }

    animFrameId = requestAnimationFrame(detectLoop);
  }

  async function enableGestureMode() {
    gestureToggle.classList.add('active');
    gestureToggleLabel.textContent = 'Starting...';
    gestureStatus.classList.add('visible');
    setStatus(statusGesture, 'Loading', 'on');

    if (!handLandmarker) {
      const modelOk = await initHandLandmarker();
      if (!modelOk) {
        gestureToggle.classList.remove('active');
        gestureToggleLabel.textContent = 'Gesture Unavailable';
        setStatus(statusGesture, 'Unavailable', 'off');
        setStatus(statusCamera, 'Off', 'off');
        return;
      }
    }

    const cameraOk = await startCamera();
    if (!cameraOk) {
      gestureToggle.classList.remove('active');
      gestureToggleLabel.textContent = 'Camera Denied';
      setStatus(statusCamera, 'Denied', 'off');
      setStatus(statusGesture, 'Off', 'off');
      return;
    }

    gestureEnabled = true;
    noHandFrames = 0;
    pinchActive = false;
    pinchLatch = false;
    smoothHandX = 0.5;
    smoothHandY = 0.5;
    lastVideoTime = -1;

    document.body.classList.add('gesture-mode');
    gesturePreview.classList.add('visible');
    gestureCursor.classList.add('visible');
    gestureToggleLabel.textContent = 'Gesture On';
    setStatus(statusCamera, 'Active', 'on');
    setStatus(statusGesture, 'Hand Only', 'on');
    setStatus(statusHand, 'Searching', '');
    setStatus(statusFingers, '--', '');

    updateGestureCursor(window.innerWidth * 0.5, window.innerHeight * 0.5);
    mouseX = cursorX;
    mouseY = cursorY;

    if (gestureVideo.readyState >= 2) {
      detectLoop();
    } else {
      gestureVideo.addEventListener('loadeddata', detectLoop, { once: true });
    }
  }

  function disableGestureMode() {
    gestureEnabled = false;
    pinchActive = false;
    pinchLatch = false;
    stopCamera();
    clearGestureTransforms();
    clearHoveredElement();

    gestureCursor.classList.remove('visible', 'clicking', 'hovering');
    gesturePreview.classList.remove('visible');
    document.body.classList.remove('gesture-mode');

    gestureToggle.classList.remove('active');
    gestureToggleLabel.textContent = 'Gesture Mode';
    setStatus(statusCamera, 'Off', 'off');
    setStatus(statusGesture, 'Off', 'off');
    setStatus(statusHand, '--', '');
    setStatus(statusFingers, '--', '');

    targetRotateX = 4;
    targetRotateY = -8;
  }

  gestureToggle.addEventListener('click', async () => {
    if (gestureEnabled) {
      disableGestureMode();
    } else {
      await enableGestureMode();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gestureEnabled) {
      clearHoveredElement();
    }
  });

  window.addEventListener('beforeunload', stopCamera);

  setStatus(statusCamera, 'Auto', '');
  setStatus(statusGesture, 'Starting', 'on');
  setStatus(statusHand, '--', '');
  setStatus(statusFingers, '--', '');

  enableGestureMode();
});
