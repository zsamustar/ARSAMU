/* Huellas Sonoras: MindAR + Three.js. No requiere npm ni servidor de desarrollo. */
(() => {
  const TARGET_FILE = "./assets/targets.mind";
  const PARTICLE_COUNT = 1800;

  const state = {
    started: false,
    activeTarget: null,
    audioContext: null,
    mindar: null,
    traces: [],
    messageTimer: null,
  };

  const configs = [
    { name: "Calma", kind: "calm", color: 0x42e8df, audio: "./assets/audio0.mp3", line: "Una respiración azul quedó en este punto." },
    { name: "Euforia", kind: "energy", color: 0xff7655, audio: "./assets/audio1.mp3", line: "Este lugar todavía conserva su impulso." },
    { name: "Nostalgia", kind: "memory", color: 0xffbf50, audio: "./assets/audio2.mp3", line: "Una vuelta lenta entre lo que pasó y lo que vuelve." },
  ];

  const dom = {
    welcome: document.querySelector("#welcome"),
    start: document.querySelector("#start-button"),
    stage: document.querySelector("#ar-stage"),
    status: document.querySelector("#status"),
    signal: document.querySelector("#signal"),
    traceButton: document.querySelector("#leave-trace"),
    panel: document.querySelector("#trace-panel"),
    closePanel: document.querySelector("#close-panel"),
    form: document.querySelector("#trace-form"),
    text: document.querySelector("#trace-text"),
    emotion: document.querySelector("#emotion"),
    message: document.querySelector("#message"),
  };

  function setStatus(text, active = false) {
    dom.status.textContent = text;
    dom.signal.classList.toggle("is-active", active);
  }

  function notify(text) {
    dom.message.textContent = text;
    dom.message.classList.add("is-visible");
    clearTimeout(state.messageTimer);
    state.messageTimer = setTimeout(() => dom.message.classList.remove("is-visible"), 3400);
  }

  function makeParticleTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.92)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }

  function createSystem(config) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const base = new Float32Array(PARTICLE_COUNT * 3);
    const phase = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const p = i * 3;
      phase[i] = Math.random() * Math.PI * 2;
      if (config.kind === "calm") {
        const radius = 0.22 + Math.cbrt(Math.random()) * 0.62;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        base[p] = radius * Math.sin(phi) * Math.cos(theta);
        base[p + 1] = radius * Math.cos(phi);
        base[p + 2] = radius * Math.sin(phi) * Math.sin(theta);
      } else if (config.kind === "energy") {
        const radius = 0.04 + Math.pow(Math.random(), 1.7) * 0.95;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        base[p] = radius * Math.sin(phi) * Math.cos(theta);
        base[p + 1] = radius * Math.cos(phi);
        base[p + 2] = radius * Math.sin(phi) * Math.sin(theta);
      } else {
        const turns = 4.5;
        const t = i / PARTICLE_COUNT;
        const angle = t * Math.PI * 2 * turns;
        const radius = 0.12 + t * 0.83 + (Math.random() - 0.5) * 0.1;
        base[p] = Math.cos(angle) * radius;
        base[p + 1] = (t - 0.5) * 0.7 + (Math.random() - 0.5) * 0.13;
        base[p + 2] = Math.sin(angle) * radius;
      }
      positions[p] = base[p];
      positions[p + 1] = base[p + 1];
      positions[p + 2] = base[p + 2];
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: config.color,
      size: config.kind === "energy" ? 0.042 : 0.035,
      map: makeParticleTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    points.visible = false;
    points.userData = { config, base, phase, opacity: 0, targetOpacity: 0, energy: 0, text: "" };
    return points;
  }

  function getBandEnergy(data, start, end) {
    let total = 0;
    const max = Math.min(end, data.length);
    for (let i = start; i < max; i += 1) total += data[i];
    return total / Math.max(1, max - start) / 255;
  }

  function updateSystem(points, time, analyser) {
    const meta = points.userData;
    const pos = points.geometry.attributes.position.array;
    const data = analyser?.data;
    if (data && analyser.node) analyser.node.getByteFrequencyData(data);
    const bass = data ? getBandEnergy(data, 0, 18) : 0.12;
    const mids = data ? getBandEnergy(data, 18, 74) : 0.1;
    const highs = data ? getBandEnergy(data, 74, 150) : 0.1;
    const level = meta.config.kind === "calm" ? bass : meta.config.kind === "energy" ? highs : mids;
    meta.energy += (level - meta.energy) * 0.12;
    meta.opacity += (meta.targetOpacity - meta.opacity) * 0.11;
    points.material.opacity = meta.opacity;
    points.visible = meta.opacity > 0.012 || meta.targetOpacity > 0.012;
    const scale = meta.config.kind === "calm" ? 1 + meta.energy * 0.45 : meta.config.kind === "energy" ? 1 + meta.energy * 0.86 : 1 + meta.energy * 0.24;
    points.scale.setScalar(scale);

    if (meta.config.kind === "memory") {
      points.rotation.y += 0.005 + meta.energy * 0.028;
    }
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const p = i * 3;
      const wave = Math.sin(time * (meta.config.kind === "energy" ? 0.012 : 0.0025) + meta.phase[i]);
      if (meta.config.kind === "calm") {
        pos[p] = meta.base[p] * (1 + meta.energy * 0.18);
        pos[p + 1] = meta.base[p + 1] + wave * (0.02 + meta.energy * 0.09);
        pos[p + 2] = meta.base[p + 2] * (1 + meta.energy * 0.18);
      } else if (meta.config.kind === "energy") {
        const jitter = wave * (0.012 + meta.energy * 0.13);
        pos[p] = meta.base[p] * (1 + meta.energy * 0.55) + jitter;
        pos[p + 1] = meta.base[p + 1] * (1 + meta.energy * 0.55) + Math.cos(time * 0.014 + meta.phase[i]) * meta.energy * 0.12;
        pos[p + 2] = meta.base[p + 2] * (1 + meta.energy * 0.55) + jitter;
      } else {
        pos[p] = meta.base[p] + Math.cos(time * 0.003 + meta.phase[i]) * meta.energy * 0.055;
        pos[p + 1] = meta.base[p + 1] + wave * meta.energy * 0.11;
        pos[p + 2] = meta.base[p + 2] + Math.sin(time * 0.003 + meta.phase[i]) * meta.energy * 0.055;
      }
    }
    points.geometry.attributes.position.needsUpdate = true;
  }

  function createAudio(config) {
    const element = new Audio(config.audio);
    element.loop = true;
    element.preload = "auto";
    element.volume = 0;
    const source = state.audioContext.createMediaElementSource(element);
    const analyser = state.audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);
    analyser.connect(state.audioContext.destination);
    return { element, node: analyser, data: new Uint8Array(analyser.frequencyBinCount), targetVolume: 0 };
  }

  async function revealTarget(index) {
    if (state.activeTarget !== null && state.activeTarget !== index) hideTarget(state.activeTarget);
    state.activeTarget = index;
    const trace = state.traces[index];
    trace.points.userData.targetOpacity = 1;
    trace.audio.targetVolume = 0.55;
    try { await trace.audio.element.play(); } catch (error) { console.warn("Audio no disponible todavía", error); }
    setStatus(`${configs[index].name}: huella encontrada`, true);
    dom.traceButton.disabled = false;
    notify(configs[index].line);
  }

  function hideTarget(index) {
    const trace = state.traces[index];
    if (!trace) return;
    trace.points.userData.targetOpacity = 0;
    trace.audio.targetVolume = 0;
    if (state.activeTarget === index) {
      state.activeTarget = null;
      dom.traceButton.disabled = true;
      dom.panel.hidden = true;
      setStatus("Busca otro póster para encontrar una huella.", false);
    }
  }

  function updateAudioVolumes() {
    state.traces.forEach((trace) => {
      const { element, targetVolume } = trace.audio;
      element.volume += (targetVolume - element.volume) * 0.12;
      if (targetVolume === 0 && element.volume < 0.012 && !element.paused) element.pause();
    });
  }

  async function startExperience() {
    if (state.started) return;
    if (!window.THREE || !window.MINDAR) {
      setStatus("No se cargaron las librerías. Revisa tu conexión e inténtalo de nuevo.");
      return;
    }
    if (location.protocol === "file:") {
      setStatus("Abre este proyecto desde GitHub Pages o un servidor HTTPS para usar la cámara.");
      return;
    }
    state.started = true;
    dom.start.disabled = true;
    dom.start.textContent = "Abriendo cámara…";
    setStatus("Pide permiso para usar la cámara…", true);
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await state.audioContext.resume();

    const { MindARThree } = MINDAR.IMAGE;
    state.mindar = new MindARThree({ container: dom.stage, imageTargetSrc: TARGET_FILE, maxTrack: 1, uiScanning: "no" });
    const { renderer, scene, camera } = state.mindar;
    renderer.setClearColor(0x000000, 0);

    configs.forEach((config, index) => {
      const anchor = state.mindar.addAnchor(index);
      const points = createSystem(config);
      const audio = createAudio(config);
      anchor.group.add(points);
      state.traces[index] = { anchor, points, audio };
      anchor.onTargetFound = () => revealTarget(index);
      anchor.onTargetLost = () => hideTarget(index);
    });

    try {
      await state.mindar.start();
      dom.welcome.classList.add("is-hidden");
      setStatus("Apunta la cámara a uno de los tres pósteres.", false);
      renderer.setAnimationLoop((time) => {
        state.traces.forEach((trace) => updateSystem(trace.points, time, trace.audio));
        updateAudioVolumes();
        renderer.render(scene, camera);
      });
    } catch (error) {
      console.error(error);
      state.started = false;
      dom.start.disabled = false;
      dom.start.textContent = "Intentar de nuevo";
      setStatus("No fue posible abrir la cámara. Confirma el permiso y que uses HTTPS.");
    }
  }

  function setPanel(open) {
    if (state.activeTarget === null) return;
    dom.panel.hidden = !open;
    if (open) dom.text.focus();
  }

  dom.start.addEventListener("click", startExperience);
  dom.traceButton.addEventListener("click", () => setPanel(true));
  dom.closePanel.addEventListener("click", () => setPanel(false));
  dom.form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.activeTarget === null) return;
    const trace = state.traces[state.activeTarget];
    const next = configs.find((config) => config.kind === dom.emotion.value);
    trace.points.material.color.setHex(next.color);
    trace.points.userData.config = { ...trace.points.userData.config, kind: next.kind, color: next.color };
    trace.points.userData.text = dom.text.value.trim();
    notify(`“${trace.points.userData.text}” quedó ligada a este lugar.`);
    setPanel(false);
    dom.form.reset();
  });
})();
