import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { firebaseConfig, firebaseReady } from "./firebase-config.js";

const RADIUS_METERS = 60;
const EYE_HEIGHT = 1.55;
const EMOTIONS = {
  calma: { label: "Calma", color: "#38bdf8" },
  nostalgia: { label: "Nostalgia", color: "#fbbf24" },
  desahogo: { label: "Desahogo", color: "#c084fc" },
  gratitud: { label: "Gratitud", color: "#34d399" }
};

const ui = {
  landing: document.querySelector("#landing"), arSpace: document.querySelector("#ar-space"),
  enter: document.querySelector("#enter-button"), camera: document.querySelector("#camera-feed"), canvas: document.querySelector("#ar-canvas"),
  message: document.querySelector("#ar-message"), instructions: document.querySelector("#ar-instructions"),
  count: document.querySelector("#memory-count"), demo: document.querySelector("#demo-button"),
  compose: document.querySelector("#compose-button"), composer: document.querySelector("#composer"), closeComposer: document.querySelector("#close-composer"),
  form: document.querySelector("#thought-form"), thought: document.querySelector("#thought-input"), characterCount: document.querySelector("#character-count"), formError: document.querySelector("#form-error"),
  card: document.querySelector("#memory-card"), closeCard: document.querySelector("#close-memory"), cardEmotion: document.querySelector("#memory-emotion"), cardDistance: document.querySelector("#memory-distance"), cardTime: document.querySelector("#memory-time"), cardText: document.querySelector("#memory-text")
};

let renderer, scene, camera, raycaster, clock;
let stream, positionWatchId, unsubscribeSnapshot;
let userPosition = null;
let origin = null;
let deviceOrientation = { alpha: 0, beta: 0, gamma: 0, compass: null };
let orientationAvailable = false;
let manualLook = { yaw: 0, pitch: 0, active: false, x: 0, y: 0 };
let demoMode = false;
let selectedId = null;
let firestore = null;
let firebaseApi = null;
let localThoughts = [];
const orbs = new Map();
const rayTargets = [];
const pulseQuaternion = new THREE.Quaternion();
const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

function showMessage(text, persistent = false) {
  ui.message.textContent = text;
  ui.message.classList.remove("is-idle");
  window.clearTimeout(showMessage.timeout);
  if (!persistent) showMessage.timeout = window.setTimeout(() => ui.message.classList.add("is-idle"), 3800);
}

function hideMessage() { ui.message.classList.add("is-idle"); }

function isSecureEnough() {
  return window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

async function enterExperience() {
  if (!isSecureEnough()) {
    showMessage("Esta experiencia necesita HTTPS para acceder a cámara y ubicación.", true);
    return;
  }
  ui.enter.disabled = true;
  ui.enter.textContent = "Abriendo sensores…";
  ui.landing.hidden = true;
  ui.arSpace.hidden = false;
  initializeThree();
  showMessage("Solicitando permiso de orientación…", true);
  try {
    await requestOrientation();
    showMessage("Solicitando cámara trasera…", true);
    await requestCamera();
    showMessage("Buscando tu ubicación…", true);
    startGeolocation();
    await connectThoughtStore();
    ui.instructions.hidden = false;
    showMessage(orientationAvailable ? "Busca los orbes que aparecen a tu alrededor." : "Activa Modo Demo para mirar con el dedo o mouse.");
  } catch (error) {
    console.error(error);
    showMessage(error.message || "No se pudo iniciar la experiencia. Prueba Modo Demo.", true);
    ui.demo.focus();
  }
}

async function requestOrientation() {
  if (typeof DeviceOrientationEvent === "undefined") {
    orientationAvailable = false;
    return;
  }
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    const response = await DeviceOrientationEvent.requestPermission();
    if (response !== "granted") throw new Error("La orientación fue denegada. Puedes usar Modo Demo para arrastrar la vista.");
  }
  window.addEventListener("deviceorientation", onDeviceOrientation, true);
  orientationAvailable = true;
}

function onDeviceOrientation(event) {
  deviceOrientation.alpha = event.alpha ?? 0;
  deviceOrientation.beta = event.beta ?? 0;
  deviceOrientation.gamma = event.gamma ?? 0;
  deviceOrientation.compass = typeof event.webkitCompassHeading === "number" ? event.webkitCompassHeading : null;
}

async function requestCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador no permite usar la cámara. Abre el sitio en un navegador actualizado con HTTPS.");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    ui.camera.srcObject = stream;
    await ui.camera.play();
  } catch (error) {
    if (error.name === "NotAllowedError") throw new Error("La cámara fue denegada. Permítela desde el navegador y vuelve a intentarlo.");
    throw new Error("No se pudo abrir la cámara trasera. Prueba Modo Demo o revisa los permisos.");
  }
}

function startGeolocation() {
  if (!navigator.geolocation) {
    showMessage("Tu navegador no ofrece geolocalización. Modo Demo usará una posición simulada.", true);
    return;
  }
  positionWatchId = navigator.geolocation.watchPosition(onPosition, onGeoError, {
    enableHighAccuracy: true, maximumAge: 5000, timeout: 15000
  });
}

function onPosition(position) {
  userPosition = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy };
  if (!origin) origin = { ...userPosition };
  refreshOrbs();
  const precision = Math.round(userPosition.accuracy);
  showMessage(precision > 35 ? `Ubicación aproximada (±${precision} m). Los orbes se ajustarán al mejorar.` : "Ubicación conectada.");
}

function onGeoError(error) {
  const errors = { 1: "La ubicación fue denegada. Activa Modo Demo para probar los orbes.", 2: "No se pudo determinar tu ubicación. Activa Modo Demo para continuar.", 3: "La ubicación tardó demasiado. Puedes probar con Modo Demo." };
  showMessage(errors[error.code] || "Ocurrió un problema al obtener la ubicación.", true);
}

function initializeThree() {
  if (renderer) return;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, .03, 250);
  camera.position.set(0, EYE_HEIGHT, 0);
  renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  raycaster = new THREE.Raycaster();
  raycaster.params.Mesh.threshold = .36;
  clock = new THREE.Clock();
  scene.add(new THREE.HemisphereLight(0xa7efe0, 0x071012, 1.65));
  window.addEventListener("resize", resizeThree);
  ui.canvas.addEventListener("pointerdown", onCanvasPointerDown);
  ui.canvas.addEventListener("pointermove", onCanvasPointerMove);
  ui.canvas.addEventListener("pointerup", onCanvasPointerUp);
  ui.canvas.addEventListener("pointercancel", onCanvasPointerUp);
  animate();
}

function resizeThree() {
  if (!renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

function updateCameraOrientation() {
  if (manualLook.active || (demoMode && !orientationAvailable)) {
    camera.rotation.set(manualLook.pitch, manualLook.yaw, 0, "YXZ");
    return;
  }
  if (!orientationAvailable) return;
  // Compensa el sistema de ejes de pantalla y usa el rumbo calibrado de Safari cuando existe.
  const alpha = THREE.MathUtils.degToRad(deviceOrientation.compass !== null ? 360 - deviceOrientation.compass : deviceOrientation.alpha);
  const beta = THREE.MathUtils.degToRad(deviceOrientation.beta);
  const gamma = THREE.MathUtils.degToRad(deviceOrientation.gamma);
  const screenAngle = THREE.MathUtils.degToRad(window.screen.orientation?.angle || window.orientation || 0);
  euler.set(beta, alpha, -gamma, "YXZ");
  camera.quaternion.setFromEuler(euler);
  camera.quaternion.multiply(q1);
  camera.quaternion.multiply(q0.setFromAxisAngle(zee, -screenAngle));
}

function animate() {
  requestAnimationFrame(animate);
  if (!renderer) return;
  const elapsed = clock.getElapsedTime();
  updateCameraOrientation();
  orbs.forEach((orb) => updateOrb(orb, elapsed));
  renderer.render(scene, camera);
}

function updateOrb(orb, time) {
  const { group, mesh, halo, baseY, seed, originalPositions } = orb;
  group.position.y = baseY + Math.sin(time * (0.72 + seed * .25) + seed * 12) * .18;
  group.rotation.y = time * (.12 + seed * .05);
  const positions = mesh.geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const x = originalPositions[i * 3], y = originalPositions[i * 3 + 1], z = originalPositions[i * 3 + 2];
    const variation = 1 + Math.sin(time * (1.2 + seed) + x * 5 + y * 4 + z * 3) * .055 + Math.sin(time * .7 + x * 9) * .025;
    positions.setXYZ(i, x * variation, y * variation, z * variation);
  }
  positions.needsUpdate = true;
  if (Math.floor(time * 12) % 3 === 0) mesh.geometry.computeVertexNormals();
  const selected = selectedId === orb.id;
  const scale = selected ? 1.14 + Math.sin(time * 7) * .07 : 1;
  mesh.scale.setScalar(scale);
  halo.material.opacity = selected ? .92 : .58 + Math.sin(time * 1.8 + seed) * .12;
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 1, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(.18, "rgba(255,255,255,.72)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function makeOrb(thought) {
  const group = new THREE.Group();
  const color = new THREE.Color(EMOTIONS[thought.emotion]?.color || EMOTIONS.calma.color);
  const geometry = new THREE.SphereGeometry(.54, 28, 20);
  const originalPositions = Float32Array.from(geometry.attributes.position.array);
  const material = new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: .62, transparent: true, opacity: .72, roughness: .26, metalness: .08, transmission: .18, thickness: .5, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: createGlowTexture(), color, transparent: true, opacity: .63, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(2.9, 2.9, 1);
  const hitBox = new THREE.Mesh(new THREE.SphereGeometry(.92, 14, 10), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hitBox.userData.thoughtId = thought.id;
  group.add(halo, mesh, hitBox);
  scene.add(group);
  rayTargets.push(hitBox);
  return { id: thought.id, thought, group, mesh, halo, hitBox, originalPositions, baseY: EYE_HEIGHT + .38, seed: seeded(thought.id) };
}

function seeded(value) {
  let hash = 2166136261;
  for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return ((hash >>> 0) % 1000) / 1000;
}

function localENU(lat, lng, reference) {
  const earthRadius = 6378137;
  const dLat = THREE.MathUtils.degToRad(lat - reference.lat);
  const dLng = THREE.MathUtils.degToRad(lng - reference.lng);
  return { x: dLng * earthRadius * Math.cos(THREE.MathUtils.degToRad(reference.lat)), z: -dLat * earthRadius };
}

function distanceMeters(a, b) {
  const earthRadius = 6371000;
  const dLat = THREE.MathUtils.degToRad(b.lat - a.lat);
  const dLng = THREE.MathUtils.degToRad(b.lng - a.lng);
  const aValue = Math.sin(dLat / 2) ** 2 + Math.cos(THREE.MathUtils.degToRad(a.lat)) * Math.cos(THREE.MathUtils.degToRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(aValue), Math.sqrt(1 - aValue));
}

function getJitter(thought) {
  const peerCount = [...allThoughts()].filter(item => Math.abs(item.lat - thought.lat) < 0.000001 && Math.abs(item.lng - thought.lng) < 0.000001).length;
  if (peerCount < 2) return { x: 0, z: 0 };
  const seed = seeded(thought.id);
  const distance = 1.5 + seed * 2;
  const angle = seed * Math.PI * 2;
  return { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance };
}

function allThoughts() { return firestore ? firestore.thoughts : localThoughts; }

function refreshOrbs() {
  if (!scene || !userPosition || !origin) return;
  const nearby = allThoughts().filter(thought => Number.isFinite(thought.lat) && Number.isFinite(thought.lng) && distanceMeters(userPosition, thought) <= RADIUS_METERS);
  const nearbyIds = new Set(nearby.map(item => item.id));
  orbs.forEach((orb, id) => { if (!nearbyIds.has(id)) removeOrb(id); });
  nearby.forEach(thought => {
    const enu = localENU(thought.lat, thought.lng, origin);
    const jitter = getJitter(thought);
    let orb = orbs.get(thought.id);
    if (!orb) { orb = makeOrb(thought); orbs.set(thought.id, orb); }
    orb.thought = thought;
    orb.group.position.x = enu.x + jitter.x;
    orb.group.position.z = enu.z + jitter.z;
    orb.baseY = EYE_HEIGHT + .36 + seeded(thought.id) * .6;
  });
  ui.count.textContent = `${nearby.length} ${nearby.length === 1 ? "memoria cerca" : "memorias cerca"}`;
}

function removeOrb(id) {
  const orb = orbs.get(id);
  if (!orb) return;
  const targetIndex = rayTargets.indexOf(orb.hitBox);
  if (targetIndex >= 0) rayTargets.splice(targetIndex, 1);
  scene.remove(orb.group);
  orb.mesh.geometry.dispose(); orb.mesh.material.dispose(); orb.halo.material.map.dispose(); orb.halo.material.dispose(); orb.hitBox.geometry.dispose(); orb.hitBox.material.dispose();
  orbs.delete(id);
}

function onCanvasPointerDown(event) {
  if (ui.composer.hidden === false) return;
  manualLook.active = demoMode || !orientationAvailable;
  manualLook.x = event.clientX; manualLook.y = event.clientY;
  ui.canvas.setPointerCapture?.(event.pointerId);
}

function onCanvasPointerMove(event) {
  if (!manualLook.active) return;
  const dx = event.clientX - manualLook.x, dy = event.clientY - manualLook.y;
  if (Math.abs(dx) + Math.abs(dy) > 2) manualLook.dragged = true;
  manualLook.yaw -= dx * .006; manualLook.pitch = THREE.MathUtils.clamp(manualLook.pitch - dy * .006, -1.35, 1.35);
  manualLook.x = event.clientX; manualLook.y = event.clientY;
}

function onCanvasPointerUp(event) {
  if (!manualLook.dragged) pickOrb(event);
  manualLook.active = false; manualLook.dragged = false;
}

function pickOrb(event) {
  if (!raycaster || !rayTargets.length) return;
  const rect = ui.canvas.getBoundingClientRect();
  const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(rayTargets, false)[0];
  if (!hit) { closeMemoryCard(); return; }
  openMemoryCard(hit.object.userData.thoughtId);
}

function openMemoryCard(id) {
  const orb = orbs.get(id);
  if (!orb) return;
  selectedId = id;
  const thought = orb.thought;
  const emotion = EMOTIONS[thought.emotion] || EMOTIONS.calma;
  ui.cardEmotion.textContent = emotion.label;
  ui.cardEmotion.style.color = emotion.color;
  ui.cardDistance.textContent = `a ${Math.max(1, Math.round(distanceMeters(userPosition, thought)))} m de ti`;
  ui.cardTime.textContent = relativeTime(thought.createdAt || thought.createdAtClient);
  ui.cardText.textContent = thought.text;
  ui.card.hidden = false;
}

function closeMemoryCard() { selectedId = null; ui.card.hidden = true; }

function relativeTime(value) {
  const date = value?.toDate ? value.toDate() : new Date(value || Date.now());
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

async function connectThoughtStore() {
  if (!firebaseReady) {
    firestore = { thoughts: localThoughts, local: true };
    showMessage("Modo local: conecta Firebase para compartir pensamientos en tiempo real.");
    return;
  }
  try {
    const [{ initializeApp, getApps }, { getFirestore, collection, addDoc, onSnapshot, serverTimestamp }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js")
    ]);
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const db = getFirestore(app);
    firebaseApi = { collection, addDoc, onSnapshot, serverTimestamp, db };
    firestore = { thoughts: [], local: false };
    unsubscribeSnapshot = onSnapshot(collection(db, "pensamientos"), (snapshot) => {
      firestore.thoughts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      refreshOrbs();
    }, (error) => {
      console.error(error);
      showMessage("No se pudo sincronizar Firestore. Revisa tus credenciales y reglas.", true);
    });
  } catch (error) {
    console.error(error);
    firestore = { thoughts: localThoughts, local: true };
    showMessage("No fue posible conectar Firebase. La sesión seguirá en modo local.", true);
  }
}

function showComposer() {
  closeMemoryCard(); ui.composer.hidden = false; ui.compose.hidden = true; ui.thought.focus();
}
function hideComposer() { ui.composer.hidden = true; ui.compose.hidden = false; ui.formError.textContent = ""; }

async function saveThought(event) {
  event.preventDefault();
  const text = ui.thought.value.trim();
  const emotion = new FormData(ui.form).get("emotion");
  if (!text) { ui.formError.textContent = "Escribe un pensamiento antes de guardarlo."; ui.thought.focus(); return; }
  if (!userPosition) { ui.formError.textContent = "Aún no tenemos una ubicación. Activa Modo Demo o espera unos segundos."; return; }
  const payload = { text, emotion, lat: userPosition.lat, lng: userPosition.lng, createdAtClient: new Date().toISOString() };
  const submit = ui.form.querySelector("button[type=submit]");
  submit.disabled = true; submit.textContent = "Guardando…";
  try {
    if (firestore?.local || !firebaseApi) {
      localThoughts.push({ id: `local-${Date.now()}`, ...payload, createdAt: new Date().toISOString() });
      firestore.thoughts = localThoughts;
      refreshOrbs();
    } else {
      await firebaseApi.addDoc(firebaseApi.collection(firebaseApi.db, "pensamientos"), { ...payload, createdAt: firebaseApi.serverTimestamp() });
    }
    ui.form.reset(); ui.characterCount.textContent = "0"; hideComposer(); showMessage("Tu pensamiento ahora habita este lugar.");
  } catch (error) {
    console.error(error);
    ui.formError.textContent = "No se pudo guardar. Revisa tu conexión y las reglas de Firestore.";
  } finally { submit.disabled = false; submit.innerHTML = "Guardar pensamiento <span aria-hidden=\"true\">↗</span>"; }
}

function addDemoThoughts() {
  demoMode = true;
  manualLook.yaw = 0; manualLook.pitch = 0;
  if (!userPosition) {
    userPosition = { lat: -0.180653, lng: -78.467838, accuracy: 0 };
    origin = { ...userPosition };
  }
  const metersToLat = 1 / 111111;
  const metersToLng = 1 / (111111 * Math.cos(THREE.MathUtils.degToRad(userPosition.lat)));
  const samples = [
    ["Hay lugares que te devuelven una versión de ti que ya no recordabas.", "nostalgia", 7, -11],
    ["Hoy vine sin buscar nada y encontré un poco de aire.", "calma", -10, -8],
    ["No sabía que necesitaba soltar esto hasta estar aquí.", "desahogo", 11, 6],
    ["Gracias por todo lo que pasó antes de que yo llegara.", "gratitud", -4, 13]
  ];
  const additions = samples.map(([text, emotion, east, north], index) => ({ id: `demo-${index}-${Date.now()}`, text, emotion, lat: userPosition.lat + north * metersToLat, lng: userPosition.lng + east * metersToLng, createdAt: new Date(Date.now() - (index + 1) * 900000).toISOString() }));
  localThoughts = [...localThoughts.filter(item => !item.id.startsWith("demo-")), ...additions];
  if (!firestore || firestore.local) firestore = { thoughts: localThoughts, local: true };
  else firestore.thoughts = [...firestore.thoughts.filter(item => !item.id.startsWith("demo-")), ...additions];
  refreshOrbs();
  ui.demo.textContent = "Demo activo";
  ui.instructions.hidden = false;
  showMessage("Demo activo: arrastra para mirar y toca un orbe para leerlo.");
}

function tidyUp() {
  stream?.getTracks().forEach(track => track.stop());
  if (positionWatchId !== undefined) navigator.geolocation?.clearWatch(positionWatchId);
  unsubscribeSnapshot?.();
}

ui.enter.addEventListener("click", enterExperience);
ui.demo.addEventListener("click", addDemoThoughts);
ui.compose.addEventListener("click", showComposer);
ui.closeComposer.addEventListener("click", hideComposer);
ui.closeCard.addEventListener("click", closeMemoryCard);
ui.thought.addEventListener("input", () => { ui.characterCount.textContent = ui.thought.value.length; ui.formError.textContent = ""; });
ui.form.addEventListener("submit", saveThought);
window.addEventListener("beforeunload", tidyUp);
