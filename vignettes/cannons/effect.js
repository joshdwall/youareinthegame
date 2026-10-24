/**
 * Cannons vignette — battery ring BEHIND the character; projectiles fire OUTWARD from center.
 * Layout + speeds + sprites are registry-driven (`vignettes-registry.json` props / projectile).
 */
import { creatureCenter } from '../../runtime/creatureCenter.js';

export default class CannonsVignette {
  /**
   * @param {object} vignetteRow
   */
  constructor(vignetteRow) {
    this.config = vignetteRow;
    this.container = null;
    this.creature = null;
    this.cannons = [];
    this.clickCount = 0;
    this.props = vignetteRow.props || {};
    this.projectile = vignetteRow.projectile || {};
  }

  async init() {
    this.container = document.querySelector('.container');
    this.creature = document.getElementById('mainCreature');
    const initial = this.props.initialCannons ?? 4;
    this.spawnRing(initial);
  }

  getCenter() {
    return creatureCenter(this.container, this.creature);
  }

  ringRadius() {
    const { x: _cx, y: _cy } = this.getCenter();
    const base = this.props.ringRadiusPx ?? 130;
    if (this.creature) {
      const half = Math.max(this.creature.offsetWidth, this.creature.offsetHeight) / 2;
      return Math.max(base, half + (this.props.ringPaddingPx ?? 36));
    }
    return base;
  }

  /**
   * Evenly space cannons on a ring around the creature (behind via z-index).
   * @param {number} count
   */
  spawnRing(count) {
    this.clearCannons();
    const n = Math.max(1, Math.min(count, this.props.maxCannons ?? 6));
    const { x: cx, y: cy } = this.getCenter();
    const radius = this.ringRadius();
    // Start at bottom-ish so the battery reads “behind” the standing creature
    const startAngle = this.props.ringStartRad ?? Math.PI * 0.15;
    const sweep = this.props.ringSweepRad ?? Math.PI * 1.7;

    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const angle = startAngle + sweep * t;
      this.spawnCannonAt(cx, cy, radius, angle);
    }
  }

  /**
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   * @param {number} angle — radians; 0 = right, clockwise-down in screen space
   */
  spawnCannonAt(cx, cy, radius, angle) {
    const width = this.props.cannonWidthPx ?? 96;
    const half = width / 2;
    const cannon = document.createElement('img');
    cannon.className = 'cannon-prop';
    cannon.src = this.props.cannonSprite || 'assets/vignettes/cannons/cannon.png';
    cannon.alt = 'cannon';
    cannon.draggable = false;
    cannon.dataset.angle = String(angle);
    cannon.style.position = 'absolute';
    cannon.style.zIndex = String(this.props.cannonZIndex ?? 2);
    cannon.style.width = `${width}px`;
    cannon.style.height = 'auto';
    cannon.style.pointerEvents = 'none';
    cannon.style.transformOrigin = '50% 50%';
    cannon.style.transition = 'filter 0.12s ease, transform 0.15s ease';

    const x = cx + Math.cos(angle) * radius - half;
    const y = cy + Math.sin(angle) * radius - half * 0.66;
    cannon.style.left = `${x}px`;
    cannon.style.top = `${y}px`;
    // Art faces right (muzzle +x); rotate so muzzle points outward along `angle`
    cannon.style.transform = `rotate(${angle}rad)`;

    this.container.appendChild(cannon);
    this.cannons.push(cannon);
    return cannon;
  }

  maybeSpawnExtraCannon() {
    const max = this.props.maxCannons ?? 6;
    if (this.cannons.length >= max) return;
    if (Math.random() > (this.props.spawnChanceOnClick ?? 0.25)) return;
    // Rebuild ring with +1 so spacing stays even
    this.spawnRing(this.cannons.length + 1);
  }

  onSporeClick(clickX, clickY) {
    this.clickCount += 1;
    this.maybeSpawnExtraCannon();

    const volleyChance = this.props.volleyChanceOnClick ?? 0.85;
    if (Math.random() < volleyChance) {
      this.fireOutwardVolley({ biasX: clickX, biasY: clickY });
    } else {
      this.fireOutwardFromCannon(this.pickNearestCannon(clickX, clickY));
    }

    if (this.config.rareRoll?.enabled && Math.random() < (this.config.rareRoll.chance ?? 0.08)) {
      this.fireBroadside();
    }
  }

  pickNearestCannon(x, y) {
    if (!this.cannons.length) return null;
    let best = this.cannons[0];
    let bestD = Infinity;
    for (const c of this.cannons) {
      const mx = parseFloat(c.style.left) + (this.props.cannonWidthPx ?? 96) / 2;
      const my = parseFloat(c.style.top) + 32;
      const d = (mx - x) ** 2 + (my - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  pickRandomCannon() {
    if (!this.cannons.length) return null;
    return this.cannons[Math.floor(Math.random() * this.cannons.length)];
  }

  /**
   * All cannons fire outward (away from creature center).
   * @param {{ biasX?: number, biasY?: number }} [opts]
   */
  fireOutwardVolley(opts = {}) {
    for (const cannon of [...this.cannons]) {
      this.fireOutwardFromCannon(cannon, opts);
    }
  }

  fireBroadside() {
    for (const cannon of this.cannons) {
      const angle = Number(cannon.dataset.angle || 0);
      cannon.style.transform = `rotate(${angle}rad) scale(1.12)`;
      setTimeout(() => {
        cannon.style.transform = `rotate(${angle}rad)`;
      }, 180);
    }
    // Triple staggered outward volley
    for (let wave = 0; wave < 3; wave++) {
      setTimeout(() => this.fireOutwardVolley(), wave * 90);
    }
  }

  /**
   * Projectile leaves the cannon muzzle traveling radially outward from center.
   * @param {HTMLImageElement|null} cannon
   * @param {{ biasX?: number, biasY?: number }} [opts]
   */
  fireOutwardFromCannon(cannon, opts = {}) {
    if (!this.container) return;
    const { x: cx, y: cy } = this.getCenter();
    let angle = cannon ? Number(cannon.dataset.angle || 0) : Math.random() * Math.PI * 2;

    // Slight bias toward click while staying in the outward hemisphere
    if (opts.biasX != null && opts.biasY != null) {
      const toClick = Math.atan2(opts.biasY - cy, opts.biasX - cx);
      let delta = toClick - angle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      angle += delta * 0.25;
    }

    const width = this.props.cannonWidthPx ?? 96;
    let originX = cx + Math.cos(angle) * this.ringRadius();
    let originY = cy + Math.sin(angle) * this.ringRadius();
    if (cannon) {
      // Muzzle = sprite center + outward offset along facing angle
      originX = parseFloat(cannon.style.left) + width / 2 + Math.cos(angle) * (width * 0.42);
      originY = parseFloat(cannon.style.top) + width * 0.35 + Math.sin(angle) * (width * 0.42);
      cannon.style.filter = 'brightness(1.45) drop-shadow(0 0 6px rgba(255,200,80,0.7))';
      setTimeout(() => {
        cannon.style.filter = '';
      }, 140);
    }

    const speedMin = this.props.projectileSpeedMin ?? 200;
    const speedMax = this.props.projectileSpeedMax ?? 320;
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    this.spawnProjectile(originX, originY, vx, vy);
  }

  /**
   * @param {number} originX
   * @param {number} originY
   * @param {number} vx
   * @param {number} vy
   */
  spawnProjectile(originX, originY, vx, vy) {
    const sprite = document.createElement('img');
    sprite.className = 'spore cannon-projectile';
    sprite.src = this.projectile.sprite || 'assets/vignettes/cannons/pirate-spore.png';
    sprite.alt = '';
    sprite.draggable = false;

    const pw = this.props.projectileWidthPx ?? 48;
    const ph = this.props.projectileHeightPx ?? 32;
    sprite.style.width = `${pw}px`;
    sprite.style.height = 'auto';
    sprite.style.left = `${originX - pw / 2}px`;
    sprite.style.top = `${originY - ph / 2}px`;
    sprite.style.setProperty('--tx', `${vx}px`);
    sprite.style.setProperty('--ty', `${vy}px`);
    sprite.style.setProperty('--rotation', `${360 + Math.random() * 720}deg`);
    sprite.style.zIndex = '12';

    const duration = 0.7 + Math.random() * 0.35;
    sprite.style.animation = `explode ${duration}s ease-out forwards`;
    this.container.appendChild(sprite);
    setTimeout(() => sprite.remove(), duration * 1000 + 80);
  }

  async onClimax() {
    this.fireBroadside();
    await new Promise((r) => setTimeout(r, 1400));
  }

  /** Harness Preview: ring of cannons behind creature + staggered outward volley. */
  async previewDemo() {
    if (!this.container) await this.init();
    const n = this.props.previewCannons ?? this.props.maxCannons ?? 6;
    this.spawnRing(n);
    await new Promise((r) => setTimeout(r, 200));
    // Two waves so motion is unmistakable
    this.fireOutwardVolley();
    await new Promise((r) => setTimeout(r, 280));
    this.fireOutwardVolley();
    await new Promise((r) => setTimeout(r, 900));
  }

  clearCannons() {
    for (const c of this.cannons) c.remove();
    this.cannons = [];
  }

  async reset() {
    this.clearCannons();
    this.clickCount = 0;
  }
}
