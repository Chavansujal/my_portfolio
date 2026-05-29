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
  let stream = null;
  let gestureSocket = null;
  let socketReady = false;
  let frameInFlight = false;
  let captureTimerId = null;

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
  let pendingAirTap = false;
  let lastAirTapTime = 0;
  let hoveredElement = null;
  let particles = [];
  let lastScrollHandY = null;

  const LERP_FACTOR = 0.14;
  const NO_HAND_THRESHOLD = 15;
  const EDGE_SCROLL_ZONE = 90;
  const EDGE_SCROLL_SPEED = 18;
  const GESTURE_SCROLL_GAIN = 160;
  const GESTURE_SCROLL_DEADZONE = 0.008;
  const PINCH_THRESHOLD = 0.055;
  const PINCH_RELEASE = 0.085;
  const DOUBLE_TAP_WINDOW = 550;
  const INTERACTIVE_SELECTOR =
    'a, button, [role="button"], .project-card, .timeline-card, .contact-icon, .nav-logo, .framework-chip, .skill-icon-card, .gesture-toggle';
  const CAMERA_LABEL_PREFERENCES = [
    { pattern: /integrated|internal|built-?in/i, score: 80 },
    { pattern: /facetime|front|user/i, score: 60 },
    { pattern: /laptop|notebook/i, score: 50 },
    { pattern: /hd webcam|camera/i, score: 30 },
    { pattern: /virtual|obs|snap|droidcam|epoccam|camo/i, score: -120 },
    { pattern: /usb|external/i, score: -40 },
  ];
  const FRAME_SEND_INTERVAL = 90;
  const CAPTURE_WIDTH = 320;
  const CAPTURE_HEIGHT = 240;
  const captureCanvas = document.createElement('canvas');
  const captureCtx = captureCanvas.getContext('2d', { willReadFrequently: true });

  captureCanvas.width = CAPTURE_WIDTH;
  captureCanvas.height = CAPTURE_HEIGHT;

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function setStatus(el, text, mode) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('on', 'off');
    if (mode) el.classList.add(mode);
  }

  function getPreferredCameraDeviceId(devices) {
    const videoInputs = devices.filter((device) => device.kind === 'videoinput');
    if (videoInputs.length === 0) return null;

    const ranked = videoInputs
      .map((device, index) => {
        const label = device.label || '';
        let score = 0;

        CAMERA_LABEL_PREFERENCES.forEach(({ pattern, score: value }) => {
          if (pattern.test(label)) score += value;
        });

        return { deviceId: device.deviceId, score, index };
      })
      .sort((a, b) => b.score - a.score || a.index - b.index);

    return ranked[0].deviceId;
  }

  function getCameraConstraints(deviceId) {
    const video = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 60 },
      facingMode: { ideal: 'user' },
    };

    if (deviceId) {
      video.deviceId = { exact: deviceId };
    }

    return { video, audio: false };
  }

  function syncGestureSurfaceSize() {
    const width = gestureVideo.videoWidth || 640;
    const height = gestureVideo.videoHeight || 480;
    gestureCanvas.width = width;
    gestureCanvas.height = height;
  }

  function toGestureSocketUrl(baseUrl) {
    if (!baseUrl) return null;

    try {
      const url = new URL(baseUrl);

      if (url.protocol === 'http:') {
        url.protocol = 'ws:';
      } else if (url.protocol === 'https:') {
        url.protocol = 'wss:';
      }

      url.pathname = '/ws/gesture';
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch (err) {
      console.error('Invalid gesture backend URL:', err);
      return null;
    }
  }

  function getGestureSocketUrl() {
    const configuredBackend = window.GESTURE_BACKEND_URL;
    const configuredSocket = toGestureSocketUrl(configuredBackend);
    if (configuredSocket) return configuredSocket;

    if (!window.location.host) return null;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/gesture`;
  }

  function clearCaptureTimer() {
    if (captureTimerId) {
      window.clearTimeout(captureTimerId);
      captureTimerId = null;
    }
  }

  function resetGestureTracking() {
    noHandFrames = 0;
    pinchActive = false;
    pinchLatch = false;
    pendingAirTap = false;
    lastAirTapTime = 0;
    smoothHandX = 0.5;
    smoothHandY = 0.5;
    lastScrollHandY = null;
  }

  function isPointerMode(fingerInfo) {
    return (
      fingerInfo.raised.index &&
      !fingerInfo.raised.middle &&
      !fingerInfo.raised.ring &&
      !fingerInfo.raised.pinky
    );
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

  function handleGestureScroll(hand, fingerInfo) {
    const indexTip = hand[8];
    const pointerMode = isPointerMode(fingerInfo);

    if (!pointerMode) {
      lastScrollHandY = null;
      return;
    }

    if (lastScrollHandY === null) {
      lastScrollHandY = indexTip.y;
      return;
    }

    const deltaY = indexTip.y - lastScrollHandY;
    lastScrollHandY = indexTip.y;

    if (Math.abs(deltaY) < GESTURE_SCROLL_DEADZONE) return;

    window.scrollBy({
      top: deltaY * window.innerHeight * GESTURE_SCROLL_GAIN,
      behavior: 'auto',
    });
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
    const pointerMode = isPointerMode(fingerInfo);

    handleGestureScroll(hand, fingerInfo);

    if (pointerMode) {
      const nextX = lerp(cursorX, pointerX, 0.28);
      const nextY = lerp(cursorY, pointerY, 0.28);
      updateGestureCursor(nextX, nextY);
      updateHoverTarget(nextX, nextY);
    } else {
      pendingAirTap = false;
      clearHoveredElement();
      gestureCursor.classList.remove('clicking');
    }

    const pinchDistance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);

    if (pointerMode && pinchDistance < PINCH_THRESHOLD && !pinchLatch) {
      const now = performance.now();
      pinchLatch = true;
      pinchActive = true;
      gestureCursor.classList.add('clicking');

      if (pendingAirTap && now - lastAirTapTime <= DOUBLE_TAP_WINDOW) {
        activateTarget(hoveredElement);
        pendingAirTap = false;
        lastAirTapTime = 0;
      } else {
        pendingAirTap = true;
        lastAirTapTime = now;
      }
    } else if (pinchDistance > PINCH_RELEASE) {
      pinchLatch = false;
      pinchActive = false;
      gestureCursor.classList.remove('clicking');
    }

    if (pendingAirTap && performance.now() - lastAirTapTime > DOUBLE_TAP_WINDOW) {
      pendingAirTap = false;
      lastAirTapTime = 0;
    }
  }

  function disconnectGestureBackend() {
    socketReady = false;
    frameInFlight = false;
    clearCaptureTimer();

    if (gestureSocket) {
      gestureSocket.onopen = null;
      gestureSocket.onmessage = null;
      gestureSocket.onerror = null;
      gestureSocket.onclose = null;

      if (
        gestureSocket.readyState === WebSocket.OPEN ||
        gestureSocket.readyState === WebSocket.CONNECTING
      ) {
        gestureSocket.close();
      }

      gestureSocket = null;
    }
  }

  function processGestureResult(payload) {
    if (!gestureEnabled) return;

    if (payload.landmarks && payload.landmarks.length > 0) {
      noHandFrames = 0;

      const hand = payload.landmarks[0];
      const fingerInfo = payload.fingerInfo || countRaisedFingers(hand);
      const trackPoint = hand[9];
      const rawX = 1 - trackPoint.x;
      const rawY = trackPoint.y;

      smoothHandX = lerp(smoothHandX, rawX, LERP_FACTOR);
      smoothHandY = lerp(smoothHandY, rawY, LERP_FACTOR);

      applyGestureParallax(smoothHandX, smoothHandY);
      updateGesturePointer(hand, fingerInfo);
      drawLandmarks(payload.landmarks, fingerInfo);

      setStatus(statusHand, 'Yes', 'on');
      setStatus(
        statusFingers,
        `${fingerInfo.count} up / ${pinchActive ? 'Pinch' : 'Tracking'}`,
        fingerInfo.count > 0 ? 'on' : 'off'
      );
      return;
    }

    noHandFrames += 1;

    if (noHandFrames > NO_HAND_THRESHOLD) {
      canvasCtx.clearRect(0, 0, gestureCanvas.width, gestureCanvas.height);
      setStatus(statusHand, 'No', 'off');
      setStatus(statusFingers, '--', '');
      pinchActive = false;
      pinchLatch = false;
      pendingAirTap = false;
      lastAirTapTime = 0;
      lastScrollHandY = null;
      gestureCursor.classList.remove('clicking');
      clearHoveredElement();
    }
  }

  function queueGestureFrame(delay = FRAME_SEND_INTERVAL) {
    clearCaptureTimer();

    if (!gestureEnabled || !socketReady) return;

    captureTimerId = window.setTimeout(sendGestureFrame, delay);
  }

  function sendGestureFrame() {
    if (!gestureEnabled || !socketReady || !gestureSocket) return;

    if (frameInFlight) {
      queueGestureFrame(FRAME_SEND_INTERVAL);
      return;
    }

    if (gestureVideo.readyState < 2) {
      queueGestureFrame(120);
      return;
    }

    captureCtx.drawImage(gestureVideo, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
    frameInFlight = true;

    captureCanvas.toBlob((blob) => {
      if (!blob || !gestureSocket || gestureSocket.readyState !== WebSocket.OPEN) {
        frameInFlight = false;
        queueGestureFrame(150);
        return;
      }

      try {
        gestureSocket.send(blob);
      } catch (err) {
        console.error('Gesture frame send error:', err);
        frameInFlight = false;
        queueGestureFrame(200);
      }
    }, 'image/jpeg', 0.7);
  }

  async function initGestureBackend() {
    const socketUrl = getGestureSocketUrl();
    if (!socketUrl) {
      console.error('Set GESTURE_BACKEND_URL to your Render backend URL.');
      return false;
    }

    if (gestureSocket && socketReady) {
      return true;
    }

    disconnectGestureBackend();

    return new Promise((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        disconnectGestureBackend();
        resolve(false);
      }, 15000);
      const socket = new WebSocket(socketUrl);
      gestureSocket = socket;
      socket.binaryType = 'arraybuffer';

      socket.onopen = () => {
        window.clearTimeout(timeoutId);
        socketReady = true;
        settled = true;
        resolve(true);
      };

      socket.onmessage = (event) => {
        frameInFlight = false;

        try {
          const payload = JSON.parse(event.data);
          processGestureResult(payload);
        } catch (err) {
          console.error('Gesture payload error:', err);
        }

        queueGestureFrame();
      };

      socket.onerror = (err) => {
        console.error('Gesture backend connection error:', err);
        window.clearTimeout(timeoutId);
        socketReady = false;

        if (!settled) {
          settled = true;
          resolve(false);
        }
      };

      socket.onclose = () => {
        window.clearTimeout(timeoutId);
        socketReady = false;
        frameInFlight = false;
        clearCaptureTimer();

        if (gestureEnabled) {
          setStatus(statusGesture, 'Python Offline', 'off');
        }

        if (!settled) {
          settled = true;
          resolve(false);
        }
      };
    });
  }

  async function startCamera() {
    try {
      if (stream) {
        stopCamera();
      }

      let preferredDeviceId = null;
      let nextStream = await navigator.mediaDevices.getUserMedia(getCameraConstraints());

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        preferredDeviceId = getPreferredCameraDeviceId(devices);
      } catch (deviceErr) {
        console.warn('Could not enumerate cameras, using default camera:', deviceErr);
      }

      const activeTrack = nextStream.getVideoTracks()[0];
      const activeDeviceId = activeTrack?.getSettings?.().deviceId;

      if (preferredDeviceId && preferredDeviceId !== activeDeviceId) {
        nextStream.getTracks().forEach((track) => track.stop());
        nextStream = await navigator.mediaDevices.getUserMedia(
          getCameraConstraints(preferredDeviceId)
        );
      }

      stream = nextStream;
      gestureVideo.srcObject = stream;
      await gestureVideo.play();
      syncGestureSurfaceSize();
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

    clearCaptureTimer();
    frameInFlight = false;
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


  async function enableGestureMode() {
    gestureToggle.classList.add('active');
    gestureToggleLabel.textContent = 'Starting...';
    gestureStatus.classList.add('visible');
    setStatus(statusGesture, 'Loading', 'on');
    setStatus(statusCamera, 'Connecting', '');

    const backendOk = await initGestureBackend();
    if (!backendOk) {
      gestureToggle.classList.remove('active');
      gestureToggleLabel.textContent = 'Gesture Unavailable';
      setStatus(statusGesture, 'Python Offline', 'off');
      setStatus(statusCamera, 'Off', 'off');
      return;
    }

    setStatus(statusGesture, 'Backend Ready', 'on');
    setStatus(statusCamera, 'Requesting', '');
    const cameraOk = await startCamera();
    if (!cameraOk) {
      disconnectGestureBackend();
      gestureToggle.classList.remove('active');
      gestureToggleLabel.textContent = 'Camera Denied';
      setStatus(statusCamera, 'Denied', 'off');
      setStatus(statusGesture, 'Off', 'off');
      return;
    }

    gestureEnabled = true;
    resetGestureTracking();

    document.body.classList.add('gesture-mode');
    gesturePreview.classList.remove('visible');
    gesturePreview.setAttribute('hidden', 'hidden');
    gestureCursor.classList.add('visible');
    gestureToggleLabel.textContent = 'Gesture On';
    setStatus(statusCamera, 'Active', 'on');
    setStatus(statusGesture, 'Python Active', 'on');
    setStatus(statusHand, 'Searching', '');
    setStatus(statusFingers, '--', '');

    updateGestureCursor(window.innerWidth * 0.5, window.innerHeight * 0.5);
    mouseX = cursorX;
    mouseY = cursorY;
    queueGestureFrame(120);
  }

  function disableGestureMode() {
    gestureEnabled = false;
    pinchActive = false;
    pinchLatch = false;
    pendingAirTap = false;
    lastAirTapTime = 0;
    stopCamera();
    disconnectGestureBackend();
    clearGestureTransforms();
    clearHoveredElement();

    gestureCursor.classList.remove('visible', 'clicking', 'hovering');
    gesturePreview.classList.remove('visible');
    gesturePreview.setAttribute('hidden', 'hidden');
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

  window.addEventListener('beforeunload', () => {
    stopCamera();
    disconnectGestureBackend();
  });

  setStatus(statusCamera, 'Auto', '');
  setStatus(statusGesture, 'Ready', '');
  setStatus(statusHand, '--', '');
  setStatus(statusFingers, '--', '');
  gesturePreview.setAttribute('hidden', 'hidden');
});
