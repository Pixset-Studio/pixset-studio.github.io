// game.js — NEON ARENA 3D Shooter
// Offline single-player FPS built with Three.js
// PC: WASD + mouse look (hold LMB) + click to shoot + R to reload
// Mobile: left joystick + right look zone + fire/reload buttons

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ============================================================
// CONSTANTS & CONFIG
// ============================================================
const ARENA_SIZE = 40;
const ARENA_WALL_HEIGHT = 6;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.4;
const PLAYER_SPEED = 8;
const PLAYER_MAX_HEALTH = 100;
const MOUSE_SENSITIVITY = 0.0022;
const TOUCH_LOOK_SENSITIVITY = 0.004;

// Weapons config
const WEAPONS = {
  rifle: {
    name: 'Винтовка',
    damage: 25,
    fireRate: 0.12, // seconds between shots
    magSize: 30,
    reserveAmmo: 90,
    reloadTime: 1.8,
    spread: 0.015,
    auto: true,
    color: 0x4af0c0,
  },
  shotgun: {
    name: 'Дробовик',
    damage: 18, // per pellet
    pellets: 6,
    fireRate: 0.7,
    magSize: 8,
    reserveAmmo: 32,
    reloadTime: 2.2,
    spread: 0.06,
    auto: false,
    color: 0xffaa22,
  },
  smg: {
    name: 'Пистолет-пулемёт',
    damage: 15,
    fireRate: 0.06,
    magSize: 45,
    reserveAmmo: 135,
    reloadTime: 1.5,
    spread: 0.03,
    auto: true,
    color: 0x44aaff,
  },
};

// Enemy types
const ENEMY_TYPES = {
  drone: {
    health: 50,
    speed: 4,
    damage: 8,
    score: 100,
    color: 0xff4466,
    scale: 1.0,
    attackRange: 18,
    attackCooldown: 1.5,
    projectileSpeed: 22,
  },
  runner: {
    health: 30,
    speed: 7,
    damage: 12,
    score: 150,
    color: 0xff8800,
    scale: 0.8,
    attackRange: 3,
    attackCooldown: 1.0,
    projectileSpeed: 0,
  },
  tank: {
    health: 150,
    speed: 2.5,
    damage: 20,
    score: 300,
    color: 0xaa00ff,
    scale: 1.5,
    attackRange: 15,
    attackCooldown: 2.0,
    projectileSpeed: 16,
  },
};

// ============================================================
// GAME STATE
// ============================================================
const state = {
  phase: 'loading', // loading, menu, playing, paused, gameover
  score: 0,
  wave: 1,
  health: PLAYER_MAX_HEALTH,
  currentWeapon: 'rifle',
  weapons: {},
  enemies: [],
  projectiles: [],
  particles: [],
  muzzleFlash: null,
  muzzleFlashTime: 0,
  cameraShake: 0,
  lastShotTime: 0,
  mouseDown: false,
  firing: false,
  reloading: false,
  reloadEndTime: 0,
  enemiesKilledThisWave: 0,
  enemiesToSpawnThisWave: 0,
  waveStartTime: 0,
  spawnTimer: 0,
  nextSpawnTime: 0,
  keys: {},
  // Mobile
  isMobile: false,
  joystickActive: false,
  joystickId: null,
  joystickStart: { x: 0, y: 0 },
  joystickDelta: { x: 0, y: 0 },
  lookId: null,
  lookLast: { x: 0, y: 0 },
  touchFiring: false,
};

// Initialize weapons
for (const key in WEAPONS) {
  state.weapons[key] = {
    magAmmo: WEAPONS[key].magSize,
    reserveAmmo: WEAPONS[key].reserveAmmo,
  };
}

// ============================================================
// THREE.JS SETUP
// ============================================================
let scene, camera, renderer, composer;
let player = { position: new THREE.Vector3(0, PLAYER_HEIGHT, 0), yaw: 0, pitch: 0 };
let arenaObjects = []; // collision objects
let clock;
let gameElapsedTime = 0; // accumulated simulated time (seconds), advanced only via update(dt)
let debugOverlay;
let rafId;

function initThree() {
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e12);
  scene.fog = new THREE.FogExp2(0x0a0e12, 0.025);

  // Camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.copy(player.position);

  // Renderer
  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  // Post-processing
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.6,
    0.5,
    0.85
  );
  composer.addPass(bloomPass);

  clock = new THREE.Clock();

  // Lights
  const ambientLight = new THREE.AmbientLight(0x4a6080, 0.5);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(10, 20, 8);
  scene.add(dirLight);

  // Point lights for atmosphere
  const greenLight = new THREE.PointLight(0x4af0c0, 0.8, 25);
  greenLight.position.set(-ARENA_SIZE / 2 + 5, 4, -ARENA_SIZE / 2 + 5);
  scene.add(greenLight);

  const blueLight = new THREE.PointLight(0x44aaff, 0.8, 25);
  blueLight.position.set(ARENA_SIZE / 2 - 5, 4, ARENA_SIZE / 2 - 5);
  scene.add(blueLight);

  // Build arena
  buildArena();

  // Muzzle flash light
  state.muzzleFlash = new THREE.PointLight(0xffdd66, 0, 8);
  scene.add(state.muzzleFlash);

  // Resize handler
  window.addEventListener('resize', onResize);

  // Debug overlay
  debugOverlay = new DebugOverlay(renderer);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================
// ARENA BUILDING
// ============================================================
function buildArena() {
  // Floor
  const floorGeo = new THREE.PlaneGeometry(ARENA_SIZE * 2, ARENA_SIZE * 2);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1a2028,
    roughness: 0.8,
    metalness: 0.3,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // Grid lines
  const grid = new THREE.GridHelper(ARENA_SIZE * 2, 40, 0x4af0c0, 0x2a3040);
  grid.material.opacity = 0.3;
  grid.material.transparent = true;
  scene.add(grid);

  // Outer walls
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x2a3040,
    roughness: 0.7,
    metalness: 0.4,
  });
  const wallThickness = 0.5;
  const halfSize = ARENA_SIZE;

  // Four walls
  const wallConfigs = [
    { w: ARENA_SIZE * 2, h: ARENA_WALL_HEIGHT, d: wallThickness, x: 0, z: -halfSize },
    { w: ARENA_SIZE * 2, h: ARENA_WALL_HEIGHT, d: wallThickness, x: 0, z: halfSize },
    { w: wallThickness, h: ARENA_WALL_HEIGHT, d: ARENA_SIZE * 2, x: -halfSize, z: 0 },
    { w: wallThickness, h: ARENA_WALL_HEIGHT, d: ARENA_SIZE * 2, x: halfSize, z: 0 },
  ];

  for (const cfg of wallConfigs) {
    const geo = new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d);
    const wall = new THREE.Mesh(geo, wallMat);
    wall.position.set(cfg.x, cfg.h / 2, cfg.z);
    scene.add(wall);
    arenaObjects.push({
      mesh: wall,
      min: new THREE.Vector3(cfg.x - cfg.w / 2, 0, cfg.z - cfg.d / 2),
      max: new THREE.Vector3(cfg.x + cfg.w / 2, cfg.h, cfg.z + cfg.d / 2),
    });
  }

  // Cover blocks — scattered crates and barriers
  const coverPositions = [
    { x: -10, z: -8, w: 3, h: 2, d: 3 },
    { x: 8, z: -12, w: 4, h: 3, d: 2 },
    { x: -6, z: 10, w: 2, h: 2.5, d: 4 },
    { x: 12, z: 6, w: 3, h: 2, d: 3 },
    { x: 0, z: -6, w: 5, h: 1.5, d: 1.5 },
    { x: -14, z: 4, w: 2, h: 4, d: 2 },
    { x: 14, z: -4, w: 3, h: 3, d: 3 },
    { x: -4, z: -16, w: 6, h: 2, d: 1.5 },
    { x: 6, z: 14, w: 2, h: 2, d: 2 },
    { x: -12, z: 14, w: 4, h: 2.5, d: 2 },
  ];

  const crateMat = new THREE.MeshStandardMaterial({
    color: 0x3a4050,
    roughness: 0.6,
    metalness: 0.5,
  });
  const neonMat = new THREE.MeshStandardMaterial({
    color: 0x4af0c0,
    emissive: 0x4af0c0,
    emissiveIntensity: 0.5,
    roughness: 0.4,
    metalness: 0.6,
  });

  for (const c of coverPositions) {
    const geo = new THREE.BoxGeometry(c.w, c.h, c.d);
    const crate = new THREE.Mesh(geo, crateMat);
    crate.position.set(c.x, c.h / 2, c.z);
    scene.add(crate);
    arenaObjects.push({
      mesh: crate,
      min: new THREE.Vector3(c.x - c.w / 2, 0, c.z - c.d / 2),
      max: new THREE.Vector3(c.x + c.w / 2, c.h, c.z + c.d / 2),
    });

    // Neon strip on top
    const stripGeo = new THREE.BoxGeometry(c.w * 0.9, 0.1, c.d * 0.9);
    const strip = new THREE.Mesh(stripGeo, neonMat);
    strip.position.set(c.x, c.h + 0.05, c.z);
    scene.add(strip);
  }

  // Ceiling lights (decorative)
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const r = 15;
    const lightStrip = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.1, 0.5),
      new THREE.MeshStandardMaterial({
        color: 0x4af0c0,
        emissive: 0x4af0c0,
        emissiveIntensity: 1.5,
      })
    );
    lightStrip.position.set(Math.cos(angle) * r, ARENA_WALL_HEIGHT - 0.1, Math.sin(angle) * r);
    lightStrip.rotation.y = angle;
    scene.add(lightStrip);
  }
}

// ============================================================
// WEAPON MODEL (view model)
// ============================================================
let weaponGroup;
let weaponMeshes = {};

function createWeaponModels() {
  weaponGroup = new THREE.Group();

  // Rifle
  const rifle = new THREE.Group();
  const rifleBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.4, metalness: 0.7 })
  );
  rifle.add(rifleBody);
  const rifleBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.3, metalness: 0.8 })
  );
  rifleBarrel.rotation.x = Math.PI / 2;
  rifleBarrel.position.z = 0.4;
  rifle.add(rifleBarrel);
  const rifleGrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.2, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.5, metalness: 0.4 })
  );
  rifleGrip.position.y = -0.15;
  rifleGrip.position.z = -0.1;
  rifle.add(rifleGrip);
  rifle.visible = false;
  weaponGroup.add(rifle);
  weaponMeshes.rifle = rifle;

  // Shotgun
  const shotgun = new THREE.Group();
  const sgBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.14, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.5, metalness: 0.4 })
  );
  shotgun.add(sgBody);
  const sgBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.3, metalness: 0.8 })
  );
  sgBarrel.rotation.x = Math.PI / 2;
  sgBarrel.position.z = 0.5;
  shotgun.add(sgBarrel);
  const sgGrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.22, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.6, metalness: 0.3 })
  );
  sgGrip.position.y = -0.16;
  sgGrip.position.z = -0.15;
  shotgun.add(sgGrip);
  shotgun.visible = false;
  weaponGroup.add(shotgun);
  weaponMeshes.shotgun = shotgun;

  // SMG
  const smg = new THREE.Group();
  const smgBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.1, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x202830, roughness: 0.4, metalness: 0.7 })
  );
  smg.add(smgBody);
  const smgBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.25, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.3, metalness: 0.8 })
  );
  smgBarrel.rotation.x = Math.PI / 2;
  smgBarrel.position.z = 0.3;
  smg.add(smgBarrel);
  const smgGrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.18, 0.07),
    new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.5, metalness: 0.4 })
  );
  smgGrip.position.y = -0.13;
  smgGrip.position.z = -0.05;
  smg.add(smgGrip);
  smg.visible = false;
  weaponGroup.add(smg);
  weaponMeshes.smg = smg;

  // Position weapon group in view
  weaponGroup.position.set(0.3, -0.25, -0.6);
  camera.add(weaponGroup);
  scene.add(camera);
}

function showWeapon(weaponKey) {
  for (const key in weaponMeshes) {
    weaponMeshes[key].visible = key === weaponKey;
  }
}

// ============================================================
// ENEMY CREATION
// ============================================================
function createEnemy(type, position) {
  const config = ENEMY_TYPES[type];
  const group = new THREE.Group();

  // Body
  const bodyGeo = new THREE.CapsuleGeometry(0.4 * config.scale, 0.8 * config.scale, 4, 8);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: config.color,
    emissive: config.color,
    emissiveIntensity: 0.3,
    roughness: 0.5,
    metalness: 0.4,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.8 * config.scale;
  group.add(body);

  // Head
  const headGeo = new THREE.IcosahedronGeometry(0.3 * config.scale, 0);
  const headMat = new THREE.MeshStandardMaterial({
    color: config.color,
    emissive: config.color,
    emissiveIntensity: 0.5,
    roughness: 0.3,
    metalness: 0.6,
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.6 * config.scale;
  group.add(head);

  // Glowing eyes
  const eyeGeo = new THREE.SphereGeometry(0.05 * config.scale, 4, 4);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 2,
  });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.1 * config.scale, 1.65 * config.scale, 0.25 * config.scale);
  group.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.1 * config.scale, 1.65 * config.scale, 0.25 * config.scale);
  group.add(rightEye);

  // Ring at base (glowing)
  const ringGeo = new THREE.TorusGeometry(0.5 * config.scale, 0.03, 4, 16);
  const ringMat = new THREE.MeshStandardMaterial({
    color: config.color,
    emissive: config.color,
    emissiveIntensity: 1,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);

  group.position.copy(position);
  group.position.y = 0;
  scene.add(group);

  return {
    type,
    mesh: group,
    body,
    head,
    config,
    health: config.health,
    maxHealth: config.health,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    state: 'seek', // seek, attack, retreat
    attackCooldown: gameElapsedTime, // require a full cooldown before first attack
    alive: true,
    hitFlashTime: 0,
    spawnTime: gameElapsedTime,
    bobOffset: Math.random() * Math.PI * 2,
  };
}

// ============================================================
// ENEMY SPAWNING
// ============================================================
function getSpawnPosition() {
  // Spawn at arena edges, away from player
  const angle = Math.random() * Math.PI * 2;
  const radius = ARENA_SIZE * 0.7;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  // Clamp to arena bounds
  return new THREE.Vector3(
    THREE.MathUtils.clamp(x, -ARENA_SIZE + 2, ARENA_SIZE - 2),
    0,
    THREE.MathUtils.clamp(z, -ARENA_SIZE + 2, ARENA_SIZE - 2)
  );
}

function pickEnemyType(wave) {
  const rand = Math.random();
  if (wave <= 2) {
    return rand < 0.7 ? 'drone' : 'runner';
  } else if (wave <= 5) {
    if (rand < 0.5) return 'drone';
    if (rand < 0.85) return 'runner';
    return 'tank';
  } else {
    if (rand < 0.35) return 'drone';
    if (rand < 0.7) return 'runner';
    return 'tank';
  }
}

function startWave(waveNum) {
  state.wave = waveNum;
  state.enemiesKilledThisWave = 0;
  state.enemiesToSpawnThisWave = Math.min(5 + waveNum * 2, 20);
  state.spawnTimer = 0;
  state.nextSpawnTime = 0.5;
  state.waveStartTime = gameElapsedTime;

  // Show wave announcement
  const announce = document.getElementById('wave-announce');
  announce.textContent = `ВОЛНА ${waveNum}`;
  announce.classList.remove('show');
  void announce.offsetWidth; // force reflow
  announce.classList.add('show');

  updateHUD();
}

function spawnEnemy() {
  if (state.enemiesToSpawnThisWave <= 0) return;
  const type = pickEnemyType(state.wave);
  const pos = getSpawnPosition();
  const enemy = createEnemy(type, pos);
  state.enemies.push(enemy);
  state.enemiesToSpawnThisWave--;

  // Spawn effect
  createSpawnParticles(pos);
}

// ============================================================
// PROJECTILES (enemy attacks)
// ============================================================
function createProjectile(position, direction, config) {
  const geo = new THREE.SphereGeometry(0.15, 8, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: config.color,
    emissive: config.color,
    emissiveIntensity: 1.5,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(position);
  scene.add(mesh);

  // Add a point light
  const light = new THREE.PointLight(config.color, 1, 5);
  mesh.add(light);

  state.projectiles.push({
    mesh,
    velocity: direction.clone().multiplyScalar(config.projectileSpeed),
    damage: config.damage,
    life: 3.0,
    alive: true,
  });
}

// ============================================================
// PARTICLES
// ============================================================
function createHitParticles(position, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const geo = new THREE.SphereGeometry(0.05, 4, 4);
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    scene.add(mesh);

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 6,
      Math.random() * 4,
      (Math.random() - 0.5) * 6
    );

    state.particles.push({
      mesh,
      velocity: vel,
      life: 0.6,
      maxLife: 0.6,
      gravity: true,
    });
  }
}

function createSpawnParticles(position) {
  for (let i = 0; i < 12; i++) {
    const geo = new THREE.SphereGeometry(0.06, 4, 4);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff4466,
      emissive: 0xff4466,
      emissiveIntensity: 1.5,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.position.y = Math.random() * 2;
    scene.add(mesh);

    state.particles.push({
      mesh,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 3
      ),
      life: 0.8,
      maxLife: 0.8,
      gravity: true,
    });
  }
}

function createMuzzleFlash() {
  const weaponConfig = WEAPONS[state.currentWeapon];
  // Flash light
  state.muzzleFlash.color.setHex(0xffdd66);
  state.muzzleFlash.intensity = 3;
  state.muzzleFlashTime = 0.06;

  // Flash mesh at gun barrel
  const flashGeo = new THREE.SphereGeometry(0.1, 6, 6);
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffeeaa,
    transparent: true,
    opacity: 0.8,
  });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  // Position at barrel of current weapon
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  flash.position.copy(camera.position).addScaledVector(dir, 0.8).addScaledVector(new THREE.Vector3(0.3, -0.2, 0).applyQuaternion(camera.quaternion));
  scene.add(flash);

  state.particles.push({
    mesh: flash,
    velocity: new THREE.Vector3(),
    life: 0.05,
    maxLife: 0.05,
    gravity: false,
    fade: true,
  });
}

// ============================================================
// SHOOTING
// ============================================================
function shoot() {
  const now = gameElapsedTime;
  const weaponConfig = WEAPONS[state.currentWeapon];
  const weaponState = state.weapons[state.currentWeapon];

  if (state.reloading) return;
  if (now - state.lastShotTime < weaponConfig.fireRate) return;
  if (weaponState.magAmmo <= 0) {
    // Auto reload if empty
    reload();
    return;
  }

  state.lastShotTime = now;
  weaponState.magAmmo--;
  updateHUD();

  createMuzzleFlash();
  state.cameraShake = Math.max(state.cameraShake, weaponConfig === WEAPONS.shotgun ? 0.3 : 0.1);

  // Raycast for hits
  const raycaster = new THREE.Raycaster();
  const shootOrigin = camera.position.clone();

  // Number of pellets (shotgun fires multiple)
  const pellets = weaponConfig.pellets || 1;

  for (let p = 0; p < pellets; p++) {
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    // Add spread
    const spread = weaponConfig.spread;
    direction.x += (Math.random() - 0.5) * spread;
    direction.y += (Math.random() - 0.5) * spread;
    direction.z += (Math.random() - 0.5) * spread;
    direction.normalize();

    raycaster.set(shootOrigin, direction);
    raycaster.far = 100;

    // Check enemy hits
    let hit = false;
    let closestDist = Infinity;
    let hitEnemy = null;
    let hitPoint = null;

    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const intersects = raycaster.intersectObject(enemy.mesh, true);
      if (intersects.length > 0) {
        const dist = intersects[0].distance;
        if (dist < closestDist) {
          closestDist = dist;
          hitEnemy = enemy;
          hitPoint = intersects[0].point;
          hit = true;
        }
      }
    }

    // Check wall hits (to limit range visually)
    if (hitEnemy) {
      damageEnemy(hitEnemy, weaponConfig.damage, hitPoint);
      createHitParticles(hitPoint, hitEnemy.config.color);
      showHitMarker();
    }
  }

  // Play shoot sound
  playSFX('shoot');
}

function damageEnemy(enemy, damage, hitPoint) {
  enemy.health -= damage;
  enemy.hitFlashTime = 0.15;

  if (enemy.health <= 0 && enemy.alive) {
    enemy.alive = false;
    state.score += enemy.config.score;
    state.enemiesKilledThisWave++;
    createHitParticles(enemy.position.clone().setY(1), enemy.config.color, 20);
    showScorePopup(enemy.config.score, enemy.position);
    updateHUD();
    playSFX('kill');
  }
}

function reload() {
  const weaponConfig = WEAPONS[state.currentWeapon];
  const weaponState = state.weapons[state.currentWeapon];

  if (state.reloading) return;
  if (weaponState.magAmmo >= weaponConfig.magSize) return;
  if (weaponState.reserveAmmo <= 0) return;

  state.reloading = true;
  state.reloadEndTime = gameElapsedTime + weaponConfig.reloadTime;
  playSFX('reload');
  updateHUD();
}

function switchWeapon(weaponKey) {
  if (!WEAPONS[weaponKey]) return;
  if (state.currentWeapon === weaponKey) return;
  state.currentWeapon = weaponKey;
  state.reloading = false;
  showWeapon(weaponKey);
  updateHUD();
  playSFX('switch');
}

// ============================================================
// COLLISION
// ============================================================
function checkCollision(newPos, radius) {
  // Arena bounds
  const halfArena = ARENA_SIZE - radius;
  if (newPos.x < -halfArena) newPos.x = -halfArena;
  if (newPos.x > halfArena) newPos.x = halfArena;
  if (newPos.z < -halfArena) newPos.z = -halfArena;
  if (newPos.z > halfArena) newPos.z = halfArena;

  // Check cover objects (simple AABB vs circle on XZ plane)
  for (const obj of arenaObjects) {
    // Skip walls (already handled by bounds)
    if (obj.max.y >= ARENA_WALL_HEIGHT) continue;

    const closestX = Math.max(obj.min.x, Math.min(newPos.x, obj.max.x));
    const closestZ = Math.max(obj.min.z, Math.min(newPos.z, obj.max.z));
    const dx = newPos.x - closestX;
    const dz = newPos.z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq) || 0.001;
      const pushX = (dx / dist) * (radius - dist);
      const pushZ = (dz / dist) * (radius - dist);
      newPos.x += pushX;
      newPos.z += pushZ;
    }
  }

  return newPos;
}

function enemyCheckCollision(newPos, radius) {
  // Arena bounds
  const halfArena = ARENA_SIZE - radius;
  if (newPos.x < -halfArena) newPos.x = -halfArena;
  if (newPos.x > halfArena) newPos.x = halfArena;
  if (newPos.z < -halfArena) newPos.z = -halfArena;
  if (newPos.z > halfArena) newPos.z = halfArena;

  // Check cover objects
  for (const obj of arenaObjects) {
    if (obj.max.y >= ARENA_WALL_HEIGHT) continue;
    const closestX = Math.max(obj.min.x, Math.min(newPos.x, obj.max.x));
    const closestZ = Math.max(obj.min.z, Math.min(newPos.z, obj.max.z));
    const dx = newPos.x - closestX;
    const dz = newPos.z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq) || 0.001;
      newPos.x += (dx / dist) * (radius - dist);
      newPos.z += (dz / dist) * (radius - dist);
    }
  }

  return newPos;
}

// ============================================================
// ENEMY AI
// ============================================================
function updateEnemy(enemy, dt) {
  if (!enemy.alive) return;

  const now = gameElapsedTime;
  const toPlayer = new THREE.Vector3().subVectors(player.position, enemy.position);
  toPlayer.y = 0;
  const distToPlayer = toPlayer.length();
  const config = enemy.config;

  // Hit flash
  if (enemy.hitFlashTime > 0) {
    enemy.hitFlashTime -= dt;
    const flash = Math.max(0, enemy.hitFlashTime / 0.15);
    enemy.body.material.emissiveIntensity = 0.3 + flash * 2;
    enemy.head.material.emissiveIntensity = 0.5 + flash * 2;
  }

  // Face player
  const targetAngle = Math.atan2(toPlayer.x, toPlayer.z);
  enemy.mesh.rotation.y = targetAngle;

  // State machine
  if (distToPlayer > config.attackRange) {
    // Seek player
    enemy.state = 'seek';
    const moveDir = toPlayer.clone().normalize();
    const newPos = enemy.position.clone().addScaledVector(moveDir, config.speed * dt);
    enemy.position.copy(enemyCheckCollision(newPos, 0.4 * config.scale));
  } else {
    // In attack range
    enemy.state = 'attack';
    if (now - enemy.attackCooldown >= config.attackCooldown) {
      enemy.attackCooldown = now;

      if (config.projectileSpeed > 0) {
        // Ranged attack
        const shootDir = new THREE.Vector3().subVectors(player.position, enemy.position).normalize();
        const shootPos = enemy.position.clone();
        shootPos.y = 1.2 * config.scale;
        createProjectile(shootPos, shootDir, config);
        playSFX('enemyShoot');
      } else {
        // Melee attack
        if (distToPlayer < 2.5) {
          state.health -= config.damage;
          state.cameraShake = Math.max(state.cameraShake, 0.2);
          flashDamage();
          updateHUD();
          playSFX('hurt');
          if (state.health <= 0) {
            gameOver();
          }
        } else {
          // Move closer
          const moveDir = toPlayer.clone().normalize();
          const newPos = enemy.position.clone().addScaledVector(moveDir, config.speed * dt);
          enemy.position.copy(enemyCheckCollision(newPos, 0.4 * config.scale));
        }
      }
    }

    // Strafe slightly
    if (config.projectileSpeed > 0 && distToPlayer < config.attackRange * 0.7) {
      // Keep distance — back away
      const moveDir = toPlayer.clone().normalize().negate();
      const newPos = enemy.position.clone().addScaledVector(moveDir, config.speed * 0.5 * dt);
      enemy.position.copy(enemyCheckCollision(newPos, 0.4 * config.scale));
    }
  }

  // Update mesh position
  enemy.mesh.position.copy(enemy.position);
  // Bob up and down
  const bob = Math.sin(now * 6 + enemy.bobOffset) * 0.05;
  enemy.mesh.position.y = bob;

  // Ring rotation
  enemy.mesh.children[4].rotation.z += dt * 3;
}

// ============================================================
// PROJECTILE UPDATE
// ============================================================
function updateProjectiles(dt) {
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const proj = state.projectiles[i];
    if (!proj.alive) continue;

    proj.mesh.position.addScaledVector(proj.velocity, dt);
    proj.life -= dt;

    // Check player hit
    const distToPlayer = proj.mesh.position.distanceTo(player.position);
    if (distToPlayer < 0.6) {
      state.health -= proj.damage;
      state.cameraShake = Math.max(state.cameraShake, 0.2);
      flashDamage();
      updateHUD();
      playSFX('hurt');
      createHitParticles(proj.mesh.position, 0xff4466, 5);
      proj.alive = false;
      if (state.health <= 0) {
        gameOver();
      }
    }

    // Check wall/cover hit
    const projPos = proj.mesh.position;
    for (const obj of arenaObjects) {
      if (projPos.x > obj.min.x && projPos.x < obj.max.x &&
          projPos.y > obj.min.y && projPos.y < obj.max.y &&
          projPos.z > obj.min.z && projPos.z < obj.max.z) {
        createHitParticles(projPos, 0xff4466, 5);
        proj.alive = false;
        break;
      }
    }

    // Out of bounds
    if (Math.abs(projPos.x) > ARENA_SIZE || Math.abs(projPos.z) > ARENA_SIZE || projPos.y < 0 || projPos.y > ARENA_WALL_HEIGHT) {
      proj.alive = false;
    }

    if (proj.life <= 0) {
      proj.alive = false;
    }

    if (!proj.alive) {
      scene.remove(proj.mesh);
      proj.mesh.geometry.dispose();
      proj.mesh.material.dispose();
      state.projectiles.splice(i, 1);
    }
  }
}

// ============================================================
// PARTICLE UPDATE
// ============================================================
function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;

    if (p.gravity) {
      p.velocity.y -= 15 * dt;
    }
    p.mesh.position.addScaledVector(p.velocity, dt);

    if (p.fade) {
      p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
      p.mesh.material.transparent = true;
    }

    // Scale down
    const scale = Math.max(0.01, p.life / p.maxLife);
    p.mesh.scale.setScalar(scale);

    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      state.particles.splice(i, 1);
    }
  }

  // Muzzle flash decay
  if (state.muzzleFlashTime > 0) {
    state.muzzleFlashTime -= dt;
    state.muzzleFlash.intensity = Math.max(0, (state.muzzleFlashTime / 0.06) * 3);
  }
}

// ============================================================
// PLAYER UPDATE
// ============================================================
function updatePlayer(dt) {
  if (state.phase !== 'playing') return;

  // Movement
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  const moveDir = new THREE.Vector3();
  if (state.keys['w'] || state.keys['ц']) moveDir.add(forward);
  if (state.keys['s'] || state.keys['ы']) moveDir.sub(forward);
  if (state.keys['d'] || state.keys['в']) moveDir.sub(right);
  if (state.keys['a'] || state.keys['ф']) moveDir.add(right);

  // Joystick movement (mobile)
  if (state.joystickActive) {
    moveDir.addScaledVector(right, state.joystickDelta.x);
    moveDir.addScaledVector(forward, -state.joystickDelta.y);
  }

  if (moveDir.lengthSq() > 0) {
    moveDir.normalize();
    const newPos = player.position.clone().addScaledVector(moveDir, PLAYER_SPEED * dt);
    newPos.y = PLAYER_HEIGHT;
    player.position.copy(checkCollision(newPos, PLAYER_RADIUS));
  }

  // Camera shake
  if (state.cameraShake > 0) {
    state.cameraShake -= dt * 2;
    const shake = Math.max(0, state.cameraShake);
    camera.position.copy(player.position);
    camera.position.x += (Math.random() - 0.5) * shake * 0.3;
    camera.position.y += (Math.random() - 0.5) * shake * 0.2;
  } else {
    camera.position.copy(player.position);
  }

  // Weapon view bob
  if (weaponGroup) {
    const moving = moveDir.lengthSq() > 0;
    const bobAmount = moving ? 0.02 : 0;
    const bobTime = gameElapsedTime * (moving ? 10 : 3);
    weaponGroup.position.x = 0.3 + Math.sin(bobTime) * bobAmount;
    weaponGroup.position.y = -0.25 + Math.cos(bobTime * 0.5) * bobAmount * 0.5;
  }

  // Auto-fire if holding fire
  if (state.firing || state.touchFiring) {
    const weaponConfig = WEAPONS[state.currentWeapon];
    if (weaponConfig.auto) {
      shoot();
    } else if (gameElapsedTime - state.lastShotTime >= weaponConfig.fireRate) {
      shoot();
    }
  }

  // Reload check
  if (state.reloading && gameElapsedTime >= state.reloadEndTime) {
    const weaponConfig = WEAPONS[state.currentWeapon];
    const weaponState = state.weapons[state.currentWeapon];
    const needed = weaponConfig.magSize - weaponState.magAmmo;
    const taken = Math.min(needed, weaponState.reserveAmmo);
    weaponState.magAmmo += taken;
    weaponState.reserveAmmo -= taken;
    state.reloading = false;
    updateHUD();
  }
}

// ============================================================
// CAMERA / LOOK
// ============================================================
function updateCameraLook() {
  // Apply yaw and pitch
  camera.rotation.set(0, 0, 0, 'YXZ');
  camera.rotateY(player.yaw);
  camera.rotateX(player.pitch);
}

function onMouseMove(e) {
  if (state.phase !== 'playing') return;
  if (!state.mouseDown) return;

  player.yaw -= e.movementX * MOUSE_SENSITIVITY;
  player.pitch -= e.movementY * MOUSE_SENSITIVITY;
  player.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, player.pitch));

  updateCameraLook();
}

// ============================================================
// GAME LOOP
// ============================================================
let accumulator = 0;
const FIXED_TIMESTEP = 1 / 60;

function gameLoop() {
  rafId = requestAnimationFrame(gameLoop);

  const delta = Math.min(clock.getDelta(), 0.1);
  accumulator += delta;

  while (accumulator >= FIXED_TIMESTEP) {
    update(FIXED_TIMESTEP);
    accumulator -= FIXED_TIMESTEP;
  }

  renderer.info.reset();
  composer.render();
  if (debugOverlay) debugOverlay.update();
}

function update(dt) {
  if (state.phase !== 'playing') return;

  gameElapsedTime += dt; // advance simulated time for all gameplay timers

  updatePlayer(dt);
  updateCameraLook();

  // Spawn enemies
  if (state.enemiesToSpawnThisWave > 0) {
    state.spawnTimer += dt;
    if (state.spawnTimer >= state.nextSpawnTime) {
      spawnEnemy();
      state.spawnTimer = 0;
      state.nextSpawnTime = Math.max(0.8, 2.0 - state.wave * 0.1);
    }
  }

  // Update enemies
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];
    if (!enemy.alive) {
      // Remove dead enemy after delay
      scene.remove(enemy.mesh);
      enemy.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      state.enemies.splice(i, 1);
      continue;
    }
    updateEnemy(enemy, dt);
  }

  // Check wave complete
  if (state.enemiesToSpawnThisWave === 0 && state.enemies.length === 0) {
    // Wave complete!
    state.score += state.wave * 200; // wave bonus
    startWave(state.wave + 1);
  }

  // Update projectiles
  updateProjectiles(dt);

  // Update particles
  updateParticles(dt);
}

// ============================================================
// HUD UPDATE
// ============================================================
function updateHUD() {
  document.getElementById('hud-health').textContent = Math.max(0, Math.round(state.health));
  document.getElementById('hud-score').textContent = state.score.toLocaleString('ru-RU');
  document.getElementById('hud-wave').textContent = state.wave;

  const weaponConfig = WEAPONS[state.currentWeapon];
  const weaponState = state.weapons[state.currentWeapon];
  const ammoText = state.reloading ? 'Перезарядка...' : `${weaponState.magAmmo} / ${weaponState.reserveAmmo}`;
  document.getElementById('hud-ammo').textContent = ammoText;
  document.getElementById('hud-weapon').textContent = weaponConfig.name;

  // Health bar
  const healthPercent = Math.max(0, (state.health / PLAYER_MAX_HEALTH) * 100);
  document.getElementById('health-bar').style.width = healthPercent + '%';
}

function showHitMarker() {
  const marker = document.getElementById('hit-marker');
  marker.classList.add('show');
  setTimeout(() => marker.classList.remove('show'), 100);
}

function flashDamage() {
  const flash = document.getElementById('damage-flash');
  flash.classList.add('show');
  setTimeout(() => flash.classList.remove('show'), 200);
}

function showScorePopup(score, worldPos) {
  // Project world position to screen
  const screenPos = worldPos.clone();
  screenPos.y += 1.5;
  screenPos.project(camera);

  const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

  const popup = document.createElement('div');
  popup.className = 'score-popup';
  popup.textContent = `+${score}`;
  popup.style.left = x + 'px';
  popup.style.top = y + 'px';
  document.body.appendChild(popup);

  setTimeout(() => popup.remove(), 1000);
}

// ============================================================
// AUDIO
// ============================================================
let audioCtx = null;

function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.warn('Audio not supported');
  }
}

function playSFX(type) {
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  switch (type) {
    case 'shoot':
      osc.type = 'square';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);
      filter.type = 'lowpass';
      filter.frequency.value = 1500;
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(filter).connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
      // Noise burst
      const noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.05, audioCtx.sampleRate);
      const noiseData = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) noiseData[i] = (Math.random() - 0.5) * 2;
      const noiseSrc = audioCtx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.1, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      noiseSrc.connect(noiseGain).connect(audioCtx.destination);
      noiseSrc.start(now);
      break;

    case 'reload':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.3);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
      break;

    case 'kill':
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
      break;

    case 'hurt':
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
      break;

    case 'enemyShoot':
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
      break;

    case 'switch':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.linearRampToValueAtTime(800, now + 0.05);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
      break;
  }
}

// ============================================================
// PROCEDURAL MUSIC (offline — no external audio)
// ============================================================
let musicGain = null;
let musicNodes = [];
let musicInterval = null;

function startMusic() {
  if (!audioCtx) return;
  if (musicInterval) return; // already playing

  musicGain = audioCtx.createGain();
  musicGain.gain.setValueAtTime(0, audioCtx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 2); // fade in
  musicGain.connect(audioCtx.destination);

  // Dark synthwave bassline + arpeggio pattern
  // Notes in Hz (A minor scale)
  const bassNotes = [55, 55, 82.41, 55, 65.41, 55, 73.42, 82.41]; // A1, A1, E2, A1, C2, A1, D2, E2
  const arpNotes = [220, 261.63, 329.63, 440, 329.63, 261.63]; // A3 C4 E4 A4 E4 C4
  const beatDur = 0.25; // 240 BPM sixteenth notes
  let step = 0;

  function scheduleStep() {
    if (!audioCtx || !musicGain) return;
    const now = audioCtx.currentTime;

    // Bass on every beat
    if (step % 4 === 0) {
      const bassIdx = (step / 4) % bassNotes.length;
      const bassOsc = audioCtx.createOscillator();
      const bassFilter = audioCtx.createBiquadFilter();
      const bassGain = audioCtx.createGain();
      bassOsc.type = 'sawtooth';
      bassOsc.frequency.value = bassNotes[bassIdx];
      bassFilter.type = 'lowpass';
      bassFilter.frequency.setValueAtTime(400, now);
      bassFilter.frequency.exponentialRampToValueAtTime(80, now + beatDur * 4);
      bassGain.gain.setValueAtTime(0.25, now);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + beatDur * 4);
      bassOsc.connect(bassFilter).connect(bassGain).connect(musicGain);
      bassOsc.start(now);
      bassOsc.stop(now + beatDur * 4);
    }

    // Arpeggio every sixteenth
    const arpIdx = step % arpNotes.length;
    const arpOsc = audioCtx.createOscillator();
    const arpGain = audioCtx.createGain();
    arpOsc.type = 'triangle';
    arpOsc.frequency.value = arpNotes[arpIdx];
    arpGain.gain.setValueAtTime(0.08, now);
    arpGain.gain.exponentialRampToValueAtTime(0.001, now + beatDur * 2);
    arpOsc.connect(arpGain).connect(musicGain);
    arpOsc.start(now);
    arpOsc.stop(now + beatDur * 2);

    // Hi-hat (noise burst) on offbeats
    if (step % 2 === 1) {
      const noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.03, audioCtx.sampleRate);
      const noiseData = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) noiseData[i] = (Math.random() - 0.5) * 2;
      const noiseSrc = audioCtx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      const noiseFilter = audioCtx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 6000;
      const noiseGain2 = audioCtx.createGain();
      noiseGain2.gain.setValueAtTime(0.04, now);
      noiseGain2.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      noiseSrc.connect(noiseFilter).connect(noiseGain2).connect(musicGain);
      noiseSrc.start(now);
    }

    step++;
  }

  scheduleStep();
  musicInterval = setInterval(scheduleStep, beatDur * 1000);
}

function stopMusic() {
  if (musicInterval) {
    clearInterval(musicInterval);
    musicInterval = null;
  }
  if (musicGain && audioCtx) {
    musicGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
    const oldGain = musicGain;
    setTimeout(() => { try { oldGain.disconnect(); } catch (e) {} }, 600);
    musicGain = null;
  }
}

// ============================================================
// DEBUG OVERLAY
// ============================================================
class DebugOverlay {
  constructor(renderer) {
    this.renderer = renderer;
    this.el = document.getElementById('debug-overlay');
    this.frames = 0;
    this.lastTime = performance.now();
    this.lastFrameTime = performance.now();
    this.frameTimes = [];
  }

  update() {
    const now = performance.now();
    this.frameTimes.push(now - this.lastFrameTime);
    this.lastFrameTime = now;
    this.frames++;

    if (now - this.lastTime >= 1000) {
      const fps = (this.frames * 1000) / (now - this.lastTime);
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      const max = Math.max(...this.frameTimes);
      const info = this.renderer.info;

      const lines = [`FPS:${fps.toFixed(0)} Frame:${avg.toFixed(1)}ms (max ${max.toFixed(1)}ms)`];
      if (info) {
        lines.push(`Draw:${info.render?.calls} Tri:${info.render?.triangles} Geo:${info.memory?.geometries} Tex:${info.memory?.textures}`);
      }
      if (performance.memory) {
        lines.push(`Heap:${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)}MB`);
      }
      lines.push(`Enemies:${state.enemies.length} Particles:${state.particles.length} Projectiles:${state.projectiles.length}`);

      const warn = [];
      if (fps < 30) warn.push('⚠LOW FPS');
      if (info?.render?.calls > 200) warn.push('⚠DRAW CALLS');
      if (warn.length) lines.push(warn.join(' '));

      this.el.textContent = lines.join('\n');
      this.frames = 0;
      this.lastTime = now;
      this.frameTimes = [];
    }
  }
}

// ============================================================
// GAME FLOW
// ============================================================
function startGame() {
  // Reset state
  state.phase = 'playing';
  state.score = 0;
  state.health = PLAYER_MAX_HEALTH;
  state.wave = 0;
  state.currentWeapon = 'rifle';
  state.enemies = [];
  state.projectiles = [];
  state.particles = [];
  state.firing = false;
  state.touchFiring = false;
  state.reloading = false;

  // Reset weapons
  for (const key in WEAPONS) {
    state.weapons[key] = {
      magAmmo: WEAPONS[key].magSize,
      reserveAmmo: WEAPONS[key].reserveAmmo,
    };
  }

  // Reset player position
  player.position.set(0, PLAYER_HEIGHT, 0);
  player.yaw = 0;
  player.pitch = 0;
  updateCameraLook();

  // Show weapon
  showWeapon('rifle');

  // Start first wave
  startWave(1);

  // Show HUD
  document.getElementById('hud').style.display = 'block';
  document.getElementById('crosshair').style.display = 'block';
  document.getElementById('title-screen').style.display = 'none';
  document.getElementById('gameover-screen').style.display = 'none';

  // Mobile controls
  if (state.isMobile) {
    document.getElementById('mobile-controls').classList.add('active');
  }

  updateHUD();
  startMusic();
}

function pauseGame() {
  if (state.phase !== 'playing') return;
  state.phase = 'paused';
  document.getElementById('pause-screen').classList.add('active');
  state.firing = false;
  state.touchFiring = false;
  stopMusic();
}

function resumeGame() {
  state.phase = 'playing';
  document.getElementById('pause-screen').classList.remove('active');
  startMusic();
}

function quitToMenu() {
  state.phase = 'menu';
  state.firing = false;
  state.touchFiring = false;
  document.getElementById('pause-screen').classList.remove('active');
  document.getElementById('hud').style.display = 'none';
  document.getElementById('crosshair').style.display = 'none';
  document.getElementById('mobile-controls').classList.remove('active');
  document.getElementById('title-screen').style.display = 'flex';

  // Clear enemies
  for (const enemy of state.enemies) {
    scene.remove(enemy.mesh);
  }
  state.enemies = [];
  state.projectiles = [];
  state.particles = [];
  stopMusic();
}

function gameOver() {
  state.phase = 'gameover';
  state.health = 0;
  state.firing = false;
  state.touchFiring = false;
  stopMusic();

  document.getElementById('final-score').textContent = state.score.toLocaleString('ru-RU');
  document.getElementById('final-wave').textContent = state.wave;
  document.getElementById('hud').style.display = 'none';
  document.getElementById('crosshair').style.display = 'none';
  document.getElementById('mobile-controls').classList.remove('active');
  document.getElementById('gameover-screen').style.display = 'flex';
}

// ============================================================
// INPUT HANDLING
// ============================================================
function initInput() {
  // Detect mobile
  state.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    ('ontouchstart' in window && window.innerWidth < 1024);

  // Keyboard
  window.addEventListener('keydown', (e) => {
    state.keys[e.key.toLowerCase()] = true;

    if (state.phase === 'playing') {
      if (e.key.toLowerCase() === 'r') reload();
      if (e.key === '1') switchWeapon('rifle');
      if (e.key === '2') switchWeapon('shotgun');
      if (e.key === '3') switchWeapon('smg');
      if (e.key === 'Escape') pauseGame();
    }
  });

  window.addEventListener('keyup', (e) => {
    state.keys[e.key.toLowerCase()] = false;
  });

  // Mouse
  const canvas = document.getElementById('game-canvas');

  canvas.addEventListener('mousedown', (e) => {
    if (state.phase !== 'playing') return;
    if (e.button === 0) {
      state.mouseDown = true;
      state.firing = true;
      // Shoot immediately for semi-auto
      shoot();
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      state.mouseDown = false;
      state.firing = false;
    }
  });

  canvas.addEventListener('mousemove', onMouseMove);

  // Touch controls
  initTouchControls();
}

function initTouchControls() {
  const joystickZone = document.getElementById('joystick-zone');
  const lookZone = document.getElementById('look-zone');
  const joystickBase = document.getElementById('joystick-base');
  const joystickThumb = document.getElementById('joystick-thumb');
  const fireBtn = document.getElementById('fire-btn');
  const reloadBtnMobile = document.getElementById('reload-btn-mobile');

  // Joystick
  joystickZone.addEventListener('touchstart', (e) => {
    if (state.phase !== 'playing') return;
    e.preventDefault();
    const touch = e.changedTouches[0];
    state.joystickActive = true;
    state.joystickId = touch.identifier;
    state.joystickStart = { x: touch.clientX, y: touch.clientY };
    joystickBase.style.display = 'block';
    joystickBase.style.left = (touch.clientX - 60) + 'px';
    joystickBase.style.top = (touch.clientY - 60) + 'px';
    joystickThumb.style.left = '32px';
    joystickThumb.style.top = '32px';
  }, { passive: false });

  joystickZone.addEventListener('touchmove', (e) => {
    if (state.phase !== 'playing') return;
    e.preventDefault();
    for (const touch of e.changedTouches) {
      if (touch.identifier === state.joystickId) {
        const dx = touch.clientX - state.joystickStart.x;
        const dy = touch.clientY - state.joystickStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 50;
        const clampedDist = Math.min(dist, maxDist);
        const angle = Math.atan2(dy, dx);
        const thumbX = Math.cos(angle) * clampedDist;
        const thumbY = Math.sin(angle) * clampedDist;
        joystickThumb.style.left = (32 + thumbX) + 'px';
        joystickThumb.style.top = (32 + thumbY) + 'px';

        // Normalized delta
        state.joystickDelta.x = (thumbX / maxDist);
        state.joystickDelta.y = (thumbY / maxDist);
      }
    }
  }, { passive: false });

  joystickZone.addEventListener('touchend', (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier === state.joystickId) {
        state.joystickActive = false;
        state.joystickId = null;
        state.joystickDelta = { x: 0, y: 0 };
        joystickBase.style.display = 'none';
      }
    }
  }, { passive: false });

  // Look zone
  lookZone.addEventListener('touchstart', (e) => {
    if (state.phase !== 'playing') return;
    e.preventDefault();
    const touch = e.changedTouches[0];
    state.lookId = touch.identifier;
    state.lookLast = { x: touch.clientX, y: touch.clientY };
  }, { passive: false });

  lookZone.addEventListener('touchmove', (e) => {
    if (state.phase !== 'playing') return;
    e.preventDefault();
    for (const touch of e.changedTouches) {
      if (touch.identifier === state.lookId) {
        const dx = touch.clientX - state.lookLast.x;
        const dy = touch.clientY - state.lookLast.y;
        state.lookLast = { x: touch.clientX, y: touch.clientY };

        player.yaw -= dx * TOUCH_LOOK_SENSITIVITY;
        player.pitch -= dy * TOUCH_LOOK_SENSITIVITY;
        player.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, player.pitch));
        updateCameraLook();
      }
    }
  }, { passive: false });

  lookZone.addEventListener('touchend', (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier === state.lookId) {
        state.lookId = null;
      }
    }
  }, { passive: false });

  // Fire button
  fireBtn.addEventListener('touchstart', (e) => {
    if (state.phase !== 'playing') return;
    e.preventDefault();
    state.touchFiring = true;
    shoot();
  }, { passive: false });

  fireBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    state.touchFiring = false;
  }, { passive: false });

  // Reload button
  reloadBtnMobile.addEventListener('touchstart', (e) => {
    if (state.phase !== 'playing') return;
    e.preventDefault();
    reload();
  }, { passive: false });
}

// ============================================================
// UI EVENT LISTENERS
// ============================================================
function initUI() {
  document.getElementById('start-btn').addEventListener('click', () => {
    initAudio();
    startGame();
  });

  document.getElementById('resume-btn').addEventListener('click', resumeGame);

  document.getElementById('quit-btn').addEventListener('click', quitToMenu);

  document.getElementById('restart-btn').addEventListener('click', () => {
    startGame();
  });

  document.getElementById('menu-btn').addEventListener('click', () => {
    document.getElementById('gameover-screen').style.display = 'none';
    quitToMenu();
  });

  // Debug toggle (press F3)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F3') {
      const el = document.getElementById('debug-overlay');
      el.classList.toggle('visible');
    }
  });
}

// ============================================================
// RENDER GAME TO TEXT (for testing)
// ============================================================
window.render_game_to_text = function () {
  return JSON.stringify({
    phase: state.phase,
    player: {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: player.yaw,
      pitch: player.pitch,
    },
    health: state.health,
    score: state.score,
    wave: state.wave,
    weapon: state.currentWeapon,
    ammo: state.weapons[state.currentWeapon].magAmmo,
    reserveAmmo: state.weapons[state.currentWeapon].reserveAmmo,
    reloading: state.reloading,
    enemies: state.enemies.map((e) => ({
      type: e.type,
      x: e.position.x,
      z: e.position.z,
      health: e.health,
      alive: e.alive,
      state: e.state,
    })),
    projectiles: state.projectiles.length,
    particles: state.particles.length,
    enemiesToSpawn: state.enemiesToSpawnThisWave,
  });
};

// Deterministic time stepping for testing
window.advanceTime = function (ms) {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) update(1 / 60);
  renderer.info.reset();
  composer.render();
};

// Test-only helpers to allow deterministic QA (aim, teleport, force kill)
window.__testSetYawPitch = function (yaw, pitch) {
  player.yaw = yaw;
  player.pitch = pitch;
  updateCameraLook();
};
window.__testTeleportPlayer = function (x, z) {
  player.position.set(x, PLAYER_HEIGHT, z);
  camera.position.copy(player.position);
};
window.__testSetHealth = function (hp) {
  state.health = hp;
  updateHUD();
};
window.__testMoveEnemy = function (index, x, z) {
  const enemy = state.enemies[index];
  if (!enemy) return false;
  enemy.position.set(x, 0, z);
  enemy.mesh.position.copy(enemy.position);
  return true;
};
window.__testDiagnoseAim = function (index) {
  const enemy = state.enemies[index];
  if (!enemy) return { error: 'no enemy at index' };
  const cameraDir = new THREE.Vector3();
  camera.getWorldDirection(cameraDir);
  const raycaster = new THREE.Raycaster();
  raycaster.set(camera.position, cameraDir);
  raycaster.far = 100;
  const intersects = raycaster.intersectObject(enemy.mesh, true);
  return {
    cameraPos: camera.position.toArray(),
    enemyMeshPos: enemy.mesh.position.toArray(),
    enemyPositionField: enemy.position.toArray(),
    cameraDir: cameraDir.toArray(),
    hits: intersects.length,
    hitDetails: intersects.slice(0, 2).map(i => ({ dist: i.distance, point: i.point.toArray(), objName: i.object.name || i.object.type })),
    playerYaw: player.yaw,
    playerPitch: player.pitch,
  };
};
window.__testDiagnoseRay = function (index) {
  const enemy = state.enemies[index];
  if (!enemy) return { error: 'no enemy at index' };
  const cameraDir = new THREE.Vector3();
  camera.getWorldDirection(cameraDir);
  const raycaster = new THREE.Raycaster();
  raycaster.set(camera.position, cameraDir);
  raycaster.far = 100;
  const enemyHits = raycaster.intersectObject(enemy.mesh, true);
  const sceneHits = raycaster.intersectObjects(scene.children, true);
  return {
    cameraPos: camera.position.toArray(),
    cameraDir: cameraDir.toArray(),
    enemyPos: enemy.position.toArray(),
    enemyMeshVisible: enemy.mesh.visible,
    enemyHitsCount: enemyHits.length,
    sceneHitsFirst5: sceneHits.slice(0, 5).map(h => ({ dist: h.distance, type: h.object.type, name: h.object.name, parentType: h.object.parent?.type })),
  };
};
window.__testFaceEnemyDebug = function (index) {
  const enemy = state.enemies[index];
  if (!enemy) return 'no enemy';
  const targetPos = enemy.position.clone();
  targetPos.y = camera.position.y;
  const tmpCam = camera.clone();
  tmpCam.position.copy(camera.position);
  tmpCam.lookAt(targetPos);
  const euler = new THREE.Euler().setFromQuaternion(tmpCam.quaternion, 'YXZ');
  const expectedDir = new THREE.Vector3().subVectors(targetPos, camera.position).normalize();
  return {
    enemyPos: enemy.position.toArray(),
    cameraPos: camera.position.toArray(),
    targetPos: targetPos.toArray(),
    expectedDir: expectedDir.toArray(),
    computedYaw: euler.y,
    computedPitch: euler.x,
    currentYaw: player.yaw,
    tmpCamQuaternion: tmpCam.quaternion.toArray(),
  };
};
window.__testFaceEnemy = function (index) {
  const enemy = state.enemies[index];
  if (!enemy) return false;
  const targetPos = enemy.position.clone();
  // Aim at enemy center mass (body center ~1.0 * scale), not camera height
  targetPos.y = 0.8 * enemy.config.scale;
  const tmpCam = camera.clone();
  tmpCam.position.copy(camera.position);
  tmpCam.lookAt(targetPos);
  const euler = new THREE.Euler().setFromQuaternion(tmpCam.quaternion, 'YXZ');
  player.yaw = euler.y;
  player.pitch = euler.x;
  updateCameraLook();
  return true;
};

// ============================================================
// INIT
// ============================================================
function init() {
  initThree();
  createWeaponModels();
  initInput();
  initUI();

  // Hide loading screen, show title
  setTimeout(() => {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('title-screen').style.display = 'flex';
    state.phase = 'menu';
  }, 500);

  // Start game loop
  gameLoop();
}

// Wait for fonts to load
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(init);
} else {
  init();
}
