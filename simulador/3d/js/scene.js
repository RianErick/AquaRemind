// Cena 3D do AquaRemind: garrafa de vidro, água dinâmica, tampa com HC-SR04,
// módulo eletrônico com OLED, LED, botão e motor vibratório. Unidades em centímetros.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const PIVOT_Y = 11;        // altura em torno da qual a garrafa inclina
const SENSOR_Y = 24.3;     // face dos transdutores do HC-SR04
const WATER_R = 3.95;
const WATER_MAX_Y = 20.95;
const HINGE = new THREE.Vector3(3.5, 25.05, 0);
const CAP_OPEN_ANGLE = 1.92;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

// Transparência dependente do ângulo de visão: bordas mais opacas, centro limpo, reflexos preservados.
function fresnelAlpha(material, min, max, power, spec) {
  const f = (n) => n.toFixed(3);
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float aqFresnel = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), ${f(power)});
      float aqSpec = dot(reflectedLight.directSpecular + reflectedLight.indirectSpecular, vec3(0.3333));
      diffuseColor.a = clamp(mix(${f(min)}, ${f(max)}, aqFresnel) + aqSpec * ${f(spec)}, 0.0, 1.0);
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `aq-${min}-${max}-${power}-${spec}`;
  return material;
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function glowTexture() {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  });
}

// Malha da água: fundo, parede e superfície em grade polar; a superfície é recalculada a cada quadro.
function createWater(material) {
  const SEG = 64, RINGS = 7;
  const BOT_C = 0, BOT = 1, TOP = BOT + SEG, SURF_C = TOP + SEG, SURF = SURF_C + 1;
  const count = SURF + RINGS * SEG;
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const idx = [];
  const put = (i, x, y, z, c) => { pos.set([x, y, z], i * 3); col.set([c, c, c], i * 3); };
  put(BOT_C, 0, 0.04, 0, 0.45); put(SURF_C, 0, 1, 0, 1);
  for (let i = 0; i < SEG; i++) {
    const a = i / SEG * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a), j = (i + 1) % SEG;
    put(BOT + i, cx * WATER_R, 0.04, cz * WATER_R, 0.45);
    put(TOP + i, cx * WATER_R, 1, cz * WATER_R, 0.95);
    for (let k = 1; k <= RINGS; k++) put(SURF + (k - 1) * SEG + i, cx * WATER_R * k / RINGS, 1, cz * WATER_R * k / RINGS, 1);
    idx.push(BOT_C, BOT + i, BOT + j);
    idx.push(BOT + j, BOT + i, TOP + i, BOT + j, TOP + i, TOP + j);
    idx.push(SURF_C, SURF + j, SURF + i);
    for (let k = 1; k < RINGS; k++) {
      const ic = SURF + (k - 1) * SEG + i, inx = SURF + (k - 1) * SEG + j, oc = SURF + k * SEG + i, on = SURF + k * SEG + j;
      idx.push(ic, inx, on, ic, on, oc);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setIndex(idx);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;

  mesh.userData.update = (heightAt) => {
    for (let i = TOP; i < count; i++) {
      if (i === SURF_C) { pos[i * 3 + 1] = heightAt(0, 0); continue; }
      pos[i * 3 + 1] = heightAt(pos[i * 3], pos[i * 3 + 2]);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  };
  return mesh;
}

export function createScene(stage, labelLayer, oledCanvas) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;

  const camera = new THREE.PerspectiveCamera(30, 1, 1, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 16; controls.maxDistance = 120;
  controls.maxPolarAngle = Math.PI * 0.56; controls.enablePan = false;
  controls.autoRotateSpeed = 0.9;

  // ---------- Iluminação e palco ----------
  scene.add(new THREE.HemisphereLight(0xbfefff, 0x06141a, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(16, 42, 24); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -24, right: 24, top: 34, bottom: -8, near: 5, far: 110 });
  key.shadow.bias = -0.0006; key.shadow.radius = 5;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x48dcf2, 2.2);
  rim.position.set(-22, 16, -24); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xbde34b, 0.35);
  fill.position.set(24, 6, -10); scene.add(fill);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(70, 96), new THREE.MeshStandardMaterial({
    color: 0x0c2630, roughness: 0.85, metalness: 0.1, transparent: true,
    alphaMap: canvasTexture(256, 256, (ctx) => {
      const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
      g.addColorStop(0, '#fff'); g.addColorStop(1, '#000'); ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    }),
  }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.3; floor.receiveShadow = true; scene.add(floor);

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(9.6, 10.1, 0.75, 128),
    new THREE.MeshStandardMaterial({ color: 0x0b2028, roughness: 0.62, metalness: 0.25, envMapIntensity: 0.35 }));
  pedestal.position.y = -0.93; pedestal.receiveShadow = true; pedestal.castShadow = true; scene.add(pedestal);

  // Anéis no pedestal: externo = meta diária, interno = tempo até o próximo lembrete.
  const ringSegments = 160;
  function ring(inner, outer, color, opacity) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, toneMapped: false, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, ringSegments, 1, Math.PI / 2, Math.PI * 2), material);
    mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = 0; mesh.position.y = -0.545; mesh.scale.x = -1;
    material.side = THREE.DoubleSide;
    scene.add(mesh); return mesh;
  }
  ring(8.25, 8.75, 0xffffff, 0.07);
  const goalRing = ring(8.25, 8.75, 0xbde34b, 0.95);
  ring(7.55, 7.8, 0xffffff, 0.06);
  const timerRing = ring(7.55, 7.8, 0x2fd3e0, 0.95);
  const setArc = (mesh, fraction) => mesh.geometry.setDrawRange(0, Math.round(clamp(fraction, 0, 1) * ringSegments) * 6);

  // ---------- Garrafa ----------
  const rig = new THREE.Group(); rig.position.y = PIVOT_Y; scene.add(rig);
  const bottle = new THREE.Group(); bottle.position.y = -PIVOT_Y; rig.add(bottle);

  const profile = [
    [0.001, -0.5], [3.7, -0.5], [4.1, -0.38], [4.25, 0], [4.25, 20.9], [4.2, 21.5], [4.0, 22.1], [3.6, 22.6],
    [3.2, 22.9], [3.05, 23.2], [3.0, 23.6], [3.0, 25.0], [3.12, 25.1], [3.12, 25.3], [2.75, 25.3], [2.7, 25.1],
    [2.7, 23.6], [2.76, 23.2], [2.95, 22.9], [3.38, 22.5], [3.78, 21.95], [3.98, 21.3], [4.03, 20.8], [4.03, 0.25],
    [3.9, 0.06], [3.5, 0], [0.001, 0],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const glassGeometry = new THREE.LatheGeometry(profile, 96);
  const glassMaterial = (side) => fresnelAlpha(new THREE.MeshPhysicalMaterial({
    color: 0xd9f6fa, roughness: 0.03, metalness: 0, transparent: true, depthWrite: false, side, envMapIntensity: 1.5,
  }), 0.035, 0.6, 2.4, 1.0);
  const glassBack = new THREE.Mesh(glassGeometry, glassMaterial(THREE.BackSide)); glassBack.renderOrder = 1;
  const glassFront = new THREE.Mesh(glassGeometry, glassMaterial(THREE.FrontSide)); glassFront.renderOrder = 6;
  bottle.add(glassBack, glassFront);

  // Escala de volume gravada no vidro (200 ml = 3,98 cm numa garrafa de raio 4 cm).
  const marks = new THREE.Mesh(
    new THREE.CylinderGeometry(4.275, 4.275, 20, 32, 1, true, -0.6, 0.72),
    new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, opacity: 0.85, toneMapped: false,
      map: canvasTexture(256, 1024, (ctx, w, h) => {
        ctx.fillStyle = '#eaffff'; ctx.font = '600 34px system-ui, sans-serif'; ctx.textBaseline = 'middle';
        for (let ml = 100; ml <= 1000; ml += 100) {
          const y = h - ml / (Math.PI * 16) / 20 * h, major = ml % 200 === 0;
          ctx.globalAlpha = major ? 1 : 0.55;
          ctx.fillRect(w - (major ? 96 : 52), y - (major ? 2.5 : 1.5), major ? 96 : 52, major ? 5 : 3);
          if (major) ctx.fillText(String(ml), 34, y - 24);
        }
        ctx.globalAlpha = 0.7; ctx.font = '600 24px system-ui, sans-serif'; ctx.fillText('ml', 34, h - 26);
      }),
    }));
  marks.position.y = 10; marks.renderOrder = 7; bottle.add(marks);

  const waterMaterial = fresnelAlpha(new THREE.MeshPhysicalMaterial({
    color: 0x0f9fdc, roughness: 0.06, metalness: 0, transparent: true, depthWrite: false, vertexColors: true,
    emissive: 0x0a6f96, emissiveIntensity: 1, envMapIntensity: 0.55,
  }), 0.8, 0.97, 2.0, 0.5);
  const water = createWater(waterMaterial); water.castShadow = true; bottle.add(water);

  const bubbleCount = 80;
  const bubblePos = new Float32Array(bubbleCount * 3).fill(-999);
  const bubbleSpeed = new Float32Array(bubbleCount);
  const bubbleGeometry = new THREE.BufferGeometry();
  bubbleGeometry.setAttribute('position', new THREE.BufferAttribute(bubblePos, 3).setUsage(THREE.DynamicDrawUsage));
  const bubbles = new THREE.Points(bubbleGeometry, new THREE.PointsMaterial({
    map: glowTexture(), size: 0.42, transparent: true, opacity: 0.75, depthWrite: false, color: 0xeaffff, sizeAttenuation: true,
  }));
  bubbles.frustumCulled = false; bubbles.renderOrder = 4; bottle.add(bubbles);
  let bubbleCursor = 0;
  function spawnBubble(x, y, z, speed) {
    bubblePos.set([x, y, z], bubbleCursor * 3); bubbleSpeed[bubbleCursor] = speed; bubbleCursor = (bubbleCursor + 1) % bubbleCount;
  }

  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.36, 1, 20, 1, true), new THREE.MeshPhysicalMaterial({
    color: 0x7fe0f7, roughness: 0.05, transparent: true, opacity: 0.92, depthWrite: false, emissive: 0x1b9cc4, emissiveIntensity: 0.5,
  }));
  stream.renderOrder = 5; stream.visible = false; bottle.add(stream);

  // ---------- Materiais dos componentes ----------
  const plastic = new THREE.MeshStandardMaterial({ color: 0x12303b, roughness: 0.42, metalness: 0.15 });
  const plasticDark = new THREE.MeshStandardMaterial({ color: 0x0a1c23, roughness: 0.55, metalness: 0.1 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x16b4c2, roughness: 0.35, metalness: 0.25 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x081419, roughness: 0.85 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.22, metalness: 1 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b45a, roughness: 0.3, metalness: 1 });
  const pcbBlue = new THREE.MeshStandardMaterial({ color: 0x134a8a, roughness: 0.5, metalness: 0.2 });
  const pcbDark = new THREE.MeshStandardMaterial({ color: 0x10202e, roughness: 0.5, metalness: 0.2 });
  const solid = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; return mesh;
  };
  const exploding = [];
  const explodable = (object, dx, dy, dz) => { exploding.push({ object, base: object.position.clone(), offset: new THREE.Vector3(dx, dy, dz) }); return object; };

  // ---------- Tampa inteligente: todo o equipamento fica nela ----------
  // De baixo para cima: HC-SR04 voltado para a água, ESP32 e motor, e o topo com OLED, botão e LED.
  const collar = solid(new THREE.TorusGeometry(3.14, 0.24, 14, 72), plasticDark, 0, 23.72, 0); collar.rotation.x = Math.PI / 2;
  const hingeBracket = solid(new RoundedBoxGeometry(0.7, 1.5, 1.5, 3, 0.15), plasticDark, 3.42, 24.35, 0);
  const hingePin = solid(new THREE.CylinderGeometry(0.2, 0.2, 1.8, 16), steel, HINGE.x, HINGE.y, 0); hingePin.rotation.x = Math.PI / 2;
  bottle.add(collar, hingeBracket, hingePin);

  const capPivot = new THREE.Group(); capPivot.position.copy(HINGE); bottle.add(capPivot);
  explodable(capPivot, 0, 3.4, 0);
  const cx = -HINGE.x; // centro da tampa em relação à dobradiça
  const wallMaterial = plastic.clone(); wallMaterial.side = THREE.DoubleSide;
  const capWall = solid(new THREE.CylinderGeometry(3.42, 3.42, 1.9, 72, 1, true), wallMaterial, cx, -0.15, 0);
  const capFloor = solid(new THREE.CylinderGeometry(3.42, 3.42, 0.16, 72), plastic, cx, 0.8, 0);
  const capRing = solid(new THREE.TorusGeometry(3.43, 0.07, 8, 72), accent, cx, 0.88, 0); capRing.rotation.x = Math.PI / 2;
  const sonarBoard = solid(new THREE.BoxGeometry(4.5, 0.14, 2.0), pcbBlue, cx, 0.98, 0);
  capPivot.add(capWall, capFloor, capRing, sonarBoard);
  for (const side of [-1, 1]) {
    capPivot.add(solid(new THREE.CylinderGeometry(0.8, 0.8, 1.35, 28), steel, cx + side * 1.3, 0.02, 0));
    const face = solid(new THREE.CircleGeometry(0.66, 28), plasticDark, cx + side * 1.3, -0.662, 0); face.rotation.x = Math.PI / 2;
    capPivot.add(face);
  }

  const board = new THREE.Group(); board.position.set(cx, 1.5, 0); capPivot.add(explodable(board, 0, 1.9, 0));
  board.add(solid(new THREE.BoxGeometry(5.2, 0.14, 2.6), pcbDark, 0, 0, 0));
  board.add(solid(new THREE.BoxGeometry(1.9, 0.34, 1.7), steel, 1.3, 0.2, 0));
  board.add(solid(new THREE.BoxGeometry(0.7, 0.2, 0.7), plasticDark, -0.6, 0.14, 0));
  board.add(solid(new THREE.BoxGeometry(0.8, 0.3, 0.6), steel, -2.4, 0.12, 0));
  for (const z of [-1.15, 1.15]) board.add(solid(new THREE.BoxGeometry(5.0, 0.4, 0.18), gold, 0, -0.22, z));
  const motor = solid(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 28), steel, cx, 1.5, 2.35);
  capPivot.add(explodable(motor, 0, 1.9, 0));

  const housing = solid(new THREE.CylinderGeometry(3.42, 3.42, 1.7, 72, 1, true), wallMaterial, cx, 1.75, 0);
  housing.add(solid(new RoundedBoxGeometry(1.0, 0.36, 0.3, 2, 0.08), plasticDark, 0, -0.3, -3.36)); // porta USB
  capPivot.add(explodable(housing, 0, 3.9, 0));

  const cover = new THREE.Group(); cover.position.set(cx, 2.6, 0); capPivot.add(explodable(cover, 0, 6.2, 0));
  cover.add(solid(new THREE.CylinderGeometry(3.28, 3.42, 0.22, 72), plasticDark, 0, 0.11, 0));
  const topRing = solid(new THREE.TorusGeometry(3.3, 0.06, 8, 72), accent, 0, 0.2, 0); topRing.rotation.x = Math.PI / 2; cover.add(topRing);
  cover.add(solid(new RoundedBoxGeometry(3.9, 0.08, 2.2, 3, 0.04), new THREE.MeshStandardMaterial({ color: 0x020507, roughness: 0.12, metalness: 0.4 }), 0, 0.24, -0.6));
  const oledTexture = new THREE.CanvasTexture(oledCanvas); oledTexture.colorSpace = THREE.SRGBColorSpace; oledTexture.anisotropy = 8;
  const oled = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), new THREE.MeshBasicMaterial({ map: oledTexture, toneMapped: false }));
  oled.position.set(0, 0.29, -0.6); oled.rotation.x = -Math.PI / 2; cover.add(oled);
  const brand = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.42), new THREE.MeshBasicMaterial({
    transparent: true, toneMapped: false, opacity: 0.9,
    map: canvasTexture(600, 100, (ctx) => {
      ctx.fillStyle = '#9fdfe6'; ctx.font = '700 58px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('AquaRemind', 300, 54);
    }),
  }));
  brand.position.set(0, 0.225, 0.88); brand.rotation.x = -Math.PI / 2; cover.add(brand);

  const buttonBezel = solid(new THREE.TorusGeometry(0.68, 0.08, 10, 40), steel, -0.95, 0.22, 1.95); buttonBezel.rotation.x = Math.PI / 2;
  const button = solid(new THREE.CylinderGeometry(0.56, 0.56, 0.36, 36), accent.clone(), -0.95, 0.34, 1.95);
  cover.add(buttonBezel, button);
  const ledMaterial = new THREE.MeshStandardMaterial({ color: 0x3a1410, emissive: 0xff4a2a, emissiveIntensity: 0, roughness: 0.3 });
  const led = solid(new THREE.SphereGeometry(0.22, 20, 14), ledMaterial, 0.95, 0.26, 1.95); cover.add(led);
  const ledGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff5a36, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  ledGlow.scale.setScalar(3.2); ledGlow.position.copy(led.position).y += 0.25; cover.add(ledGlow);
  const ledLight = new THREE.PointLight(0xff5a36, 0, 14, 2); ledLight.position.copy(led.position).y += 0.8; cover.add(ledLight);

  // ---------- Sonda DS18B20 com cabo flexível ----------
  const probeTip = solid(new THREE.CylinderGeometry(0.3, 0.3, 3.4, 16), steel, 1.2, 2.2, 0.6);
  bottle.add(probeTip);
  const cable = new THREE.Mesh(new THREE.BufferGeometry(), rubber); bottle.add(cable);
  const cableAttach = new THREE.Vector3(cx + 2.1, -0.25, 0.4);
  let cableKey = -1;
  function updateCable(open, lift) {
    const key = Math.round(open * 400) + Math.round(lift * 100) * 1000;
    if (key === cableKey) return; cableKey = key;
    capPivot.updateMatrix();
    const start = cableAttach.clone().applyMatrix4(capPivot.matrix);
    const points = [start, new THREE.Vector3(lerp(2.05, 2.5, open), lerp(24.1, 25.75, open) + lift * 0.5, 0.42),
      new THREE.Vector3(2.0, 23.0, 0.45), new THREE.Vector3(1.5, 18.5, 0.55), new THREE.Vector3(1.25, 10, 0.6), new THREE.Vector3(1.2, 3.9, 0.6)];
    cable.geometry.dispose();
    cable.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.11, 8);
  }

  // ---------- Visualização do ultrassom ----------
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 2.7, 1, 40, 1, true), new THREE.MeshBasicMaterial({
    color: 0x2fd3e0, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  beam.renderOrder = 2; bottle.add(beam);
  const pulseRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 8, 64), new THREE.MeshBasicMaterial({
    color: 0x7df3ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  pulseRing.rotation.x = Math.PI / 2; pulseRing.renderOrder = 2; bottle.add(pulseRing);
  const beamAnchor = new THREE.Object3D(); bottle.add(beamAnchor);

  // ---------- Rótulos HTML ancorados na cena ----------
  const labels = [];
  function addLabel(object, title, detail, side, dy = 0, kind = 'part') {
    const el = document.createElement('div');
    el.style.setProperty('--dy', `${dy}px`); el.style.setProperty('--line-top', `${Math.min(0, dy)}px`); el.style.setProperty('--line-height', `${Math.abs(dy)}px`);
    el.className = `tag tag-${kind} ${side < 0 ? 'tag-left' : 'tag-right'}`;
    el.innerHTML = `<i></i><span><b></b><small></small></span>`;
    el.querySelector('b').textContent = title; el.querySelector('small').textContent = detail;
    labelLayer.appendChild(el);
    const entry = { el, object, kind, detailEl: el.querySelector('small') }; labels.push(entry); return entry;
  }
  addLabel(oled, 'OLED SSD1306', 'I²C · SDA 21 · SCL 22', 1, -34);
  addLabel(button, 'Botão', 'GPIO14 · soneca e confirmação', -1);
  addLabel(led, 'LED de alerta', 'GPIO26', 1, 16);
  addLabel(motor, 'Motor vibratório', 'GPIO27 · 3 pulsos', -1, -8);
  addLabel(board, 'ESP32', 'firmware AquaRemind', 1);
  addLabel(sonarBoard, 'HC-SR04', 'TRIG 5 · ECHO 18', -1, 30);
  const probeAnchor = new THREE.Object3D(); probeAnchor.position.set(1.9, 21.5, 0.47); bottle.add(probeAnchor);
  addLabel(probeAnchor, 'DS18B20', 'GPIO4 · sonda dentro da água', 1);
  const beamLabel = addLabel(beamAnchor, 'Ultrassom', '', -1, 0, 'beam');

  // ---------- Câmera ----------
  const views = {
    geral: { target: [0, 13.6, 0], azimuth: 0.42, polar: 1.2, distance: 68 },
    display: { target: [0, 27.4, 0.3], azimuth: 0.0, polar: 0.5, distance: 20 },
    sensor: { target: [0, 22.5, 0], azimuth: 0.35, polar: 1.3, distance: 34 },
    explodida: { target: [0, 28.5, 0], azimuth: 0.42, polar: 1.2, distance: 56 },
  };
  const viewPosition = (v) => new THREE.Vector3(...v.target).add(new THREE.Vector3(
    Math.sin(v.azimuth) * Math.sin(v.polar), Math.cos(v.polar), Math.cos(v.azimuth) * Math.sin(v.polar)).multiplyScalar(v.distance));
  let tween = null;
  let fit = 1, insetBottom = 0, currentView = 'geral';
  function setView(name, instant = false) {
    currentView = name;
    const v = { ...views[name], distance: views[name].distance * fit };
    const toPos = viewPosition(v), toTarget = new THREE.Vector3(...v.target);
    if (instant) { camera.position.copy(toPos); controls.target.copy(toTarget); controls.update(); return; }
    tween = { k: 0, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos, toTarget };
  }
  controls.addEventListener('start', () => { tween = null; });

  function resize() {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Afasta a câmera em telas estreitas e desloca o quadro para cima da barra de controles.
    const inset = Math.min(insetBottom, h * 0.4);
    fit = clamp(1.25 / camera.aspect, 1, 2.1) * h / (h - inset);
    if (inset > 0) camera.setViewOffset(w, h, 0, inset / 2, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize(); setView('geral', true);

  // ---------- Botão físico clicável na cena ----------
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let buttonHandler = () => {}, pointerOnButton = false;
  function hitsButton(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects([button, buttonBezel]).length > 0;
  }
  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (!hitsButton(event)) return;
    pointerOnButton = true; controls.enabled = false; buttonHandler(true);
  }, true);
  window.addEventListener('pointerup', () => {
    if (!pointerOnButton) return;
    pointerOnButton = false; controls.enabled = true; buttonHandler(false);
  });
  renderer.domElement.addEventListener('pointermove', (event) => {
    renderer.domElement.style.cursor = hitsButton(event) ? 'pointer' : 'grab';
  });

  // ---------- Estado de animação ----------
  const state = { explode: 0, slosh: 0, sloshV: 0, sloshZ: 0, sloshZV: 0, lastTilt: 0, pulse: 2, ripple: 0, ledLevel: 0, showPulses: true, time: 0 };
  const cold = new THREE.Color(0x2f7dff), normal = new THREE.Color(0x0f9fdc), warm = new THREE.Color(0x8a6bff), hot = new THREE.Color(0xff5f45), tint = new THREE.Color();
  const amber = new THREE.Color(0xf0a13a), aqua = new THREE.Color(0x2fd3e0), lime = new THREE.Color(0xbde34b);
  const world = new THREE.Vector3();

  function update(dt, w) {
    state.time += dt;
    const t = state.time;

    // Vista explodida
    state.explode += (w.explode - state.explode) * (1 - Math.exp(-dt * 5));
    const e = ease(clamp(state.explode, 0, 1));
    for (const part of exploding) part.object.position.copy(part.base).addScaledVector(part.offset, e);

    // Garrafa: inclinação ao beber e tremor do motor
    rig.rotation.z = w.tilt;
    rig.position.set(-Math.sin(w.tilt) * 4, PIVOT_Y + Math.abs(Math.sin(w.tilt)) * 4.5, 0);
    if (w.motor) {
      rig.position.x += (Math.random() - 0.5) * 0.09; rig.position.z += (Math.random() - 0.5) * 0.09;
      rig.rotation.z += (Math.random() - 0.5) * 0.014;
    }
    capPivot.rotation.z = -w.capOpen * CAP_OPEN_ANGLE;
    updateCable(w.capOpen, e);
    button.position.y = w.buttonDown ? 0.22 : 0.34;

    // Água: plano horizontal no mundo + oscilação amortecida + ondulações
    const tiltVel = (w.tilt - state.lastTilt) / Math.max(dt, 1e-3); state.lastTilt = w.tilt;
    const kick = w.motor ? (Math.random() - 0.5) * 9 : 0;
    state.sloshV += (-42 * state.slosh - 2.6 * state.sloshV - tiltVel * 7 + kick) * dt; state.slosh += state.sloshV * dt;
    state.sloshZV += (-42 * state.sloshZ - 2.6 * state.sloshZV + (w.motor ? (Math.random() - 0.5) * 9 : 0)) * dt; state.sloshZ += state.sloshZV * dt;
    state.ripple += ((w.pouring ? 0.2 : w.drinking ? 0.06 : 0) - state.ripple) * (1 - Math.exp(-dt * 4));
    const slopeX = Math.tan(w.tilt) + clamp(state.slosh, -0.25, 0.25), slopeZ = clamp(state.sloshZ, -0.25, 0.25);
    const ripple = state.ripple, buzz = w.motor ? 0.035 : 0, level = w.level;
    water.visible = level > 0.05;
    if (water.visible) {
      water.userData.update((x, z) => {
        const r = Math.hypot(x, z);
        const wave = ripple * Math.sin(2.4 * r - 10 * t) / (1 + 0.4 * r) + 0.022 * Math.sin(1.1 * x + 1.7 * t) * Math.cos(0.9 * z - 1.3 * t)
          + buzz * Math.sin(8 * r - 46 * t);
        return clamp(level - slopeX * x - slopeZ * z + wave, 0.05, WATER_MAX_Y);
      });
    }
    const heat = clamp((w.tempC - 40) / 18, 0, 1), chill = clamp((14 - w.tempC) / 10, 0, 1);
    // Rampa térmica: azul, violeta e coral, sem passar por tons acinzentados.
    if (heat < 0.5) tint.copy(normal).lerp(warm, heat * 2); else tint.copy(warm).lerp(hot, heat * 2 - 1);
    tint.lerp(cold, chill * 0.7);
    waterMaterial.color.copy(tint); waterMaterial.emissive.copy(tint).multiplyScalar(0.38);
    rim.color.copy(aqua).lerp(tint, heat);

    // Jato de reabastecimento e bolhas
    stream.visible = w.pouring;
    if (w.pouring) {
      const top = 46; stream.scale.set(1 + 0.12 * Math.sin(t * 31), top - level, 1 + 0.12 * Math.cos(t * 27));
      stream.position.set(0, (top + level) / 2, 0);
      for (let i = 0; i < 3; i++) {
        const ang = Math.random() * 6.283, rad = Math.random() * 1.6;
        spawnBubble(Math.cos(ang) * rad, Math.max(0.3, level - 1 - Math.random() * Math.min(level, 7)), Math.sin(ang) * rad, 5 + Math.random() * 7);
      }
    } else if (w.tempC > 50 && level > 1 && Math.random() < dt * 14) {
      const ang = Math.random() * 6.283, rad = Math.sqrt(Math.random()) * 3.5;
      spawnBubble(Math.cos(ang) * rad, 0.2, Math.sin(ang) * rad, 3 + Math.random() * 4);
    }
    for (let i = 0; i < bubbleCount; i++) {
      if (bubblePos[i * 3 + 1] < -100) continue;
      bubblePos[i * 3 + 1] += bubbleSpeed[i] * dt;
      bubblePos[i * 3] += Math.sin(t * 9 + i) * 0.012;
      if (bubblePos[i * 3 + 1] > level - 0.15 || Math.abs(w.tilt) > 0.05) bubblePos[i * 3 + 1] = -999;
    }
    bubbleGeometry.attributes.position.needsUpdate = true;

    // Ultrassom
    const sensing = state.showPulses && w.sensorOk && e < 0.2;
    beam.visible = sensing; beam.scale.y = Math.max(0.01, SENSOR_Y - level); beam.position.y = (SENSOR_Y + level) / 2;
    beamAnchor.position.set(-1.6, (SENSOR_Y + level) / 2, 0);
    state.pulse += dt / 0.46;
    if (sensing && state.pulse < 1) {
      const p = state.pulse < 0.5 ? state.pulse * 2 : 2 - state.pulse * 2;
      pulseRing.visible = true; pulseRing.position.y = lerp(SENSOR_Y, level + 0.05, p); pulseRing.scale.setScalar(lerp(1.0, 2.7, p));
      pulseRing.material.opacity = 0.95 * (1 - state.pulse * 0.55);
      pulseRing.material.color.copy(state.pulse < 0.5 ? aqua : lime);
    } else pulseRing.visible = false;
    beamLabel.detailEl.textContent = `${w.distanceCm.toFixed(1)} cm até a água`;

    // LED e anéis do pedestal
    state.ledLevel += ((w.led ? 1 : 0) - state.ledLevel) * (1 - Math.exp(-dt * 40));
    ledMaterial.emissiveIntensity = state.ledLevel * 3.2; ledGlow.material.opacity = state.ledLevel * 0.95; ledLight.intensity = state.ledLevel * 60;
    setArc(goalRing, w.goalFraction);
    goalRing.material.opacity = w.goalFraction >= 1 ? 0.7 + 0.3 * Math.sin(t * 3) : 0.95;
    setArc(timerRing, w.reminder ? 1 : w.timerFraction);
    timerRing.material.color.copy(w.reminder ? amber : w.snooze ? lime : aqua);
    timerRing.material.opacity = w.reminder ? 0.35 + 0.65 * state.ledLevel : 0.95;

    // Câmera
    if (tween) {
      tween.k = Math.min(1, tween.k + dt / 0.9);
      const k = ease(tween.k);
      camera.position.lerpVectors(tween.fromPos, tween.toPos, k); controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
      if (tween.k >= 1) tween = null;
    }
    controls.update();
    renderer.render(scene, camera);

    // Rótulos
    const width = stage.clientWidth, height = stage.clientHeight;
    for (const label of labels) {
      const visible = label.kind === 'beam' ? sensing : state.explode > 0.55;
      label.el.classList.toggle('on', visible);
      if (!visible) continue;
      label.object.getWorldPosition(world).project(camera);
      label.el.style.transform = `translate(${((world.x + 1) / 2 * width).toFixed(1)}px, ${((1 - world.y) / 2 * height).toFixed(1)}px)`;
    }
  }

  return {
    update,
    setView,
    pulse() { state.pulse = 0; },
    oledChanged() { oledTexture.needsUpdate = true; },
    onButton(handler) { buttonHandler = handler; },
    setAutoRotate(on) { controls.autoRotate = on; },
    setInsetBottom(px) { if (px === insetBottom) return; insetBottom = px; resize(); setView(currentView, true); },
    setPulses(on) { state.showPulses = on; },
    get rendererInfo() { return renderer.info.render; },
  };
}
