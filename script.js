/**
 * Mushroom Platypus Interactive Experience
 * Registry-driven Character + Vignette runtime (visual parity with legacy splash).
 */

import { CONFIG } from './mainConfig.js';
import { resolveSessionAssignment } from './runtime/SessionAssignment.js';
import { CharacterRuntime } from './runtime/CharacterRuntime.js';
import { vignetteLoader } from './runtime/VignetteLoader.js';
import { globalEffectRunner } from './runtime/GlobalEffectRunner.js';
import { createDefaultSporeExplosion } from './effects/spore/defaultSpore.js';

class MushroomPlatypusApp {
  constructor() {
    this.creature = null;
    this.container = null;
    this.sporeSticker = null;
    this.clickCount = 0;
    this.currentVignette = null;
    this.characterRuntime = null;
    this.assignment = null;
    this.charactersRegistry = null;
    this.vignettesRegistry = null;
    this.lastClickTime = 0;
    this.clickDebounce = CONFIG.APP.CLICK_DEBOUNCE || 50;
  }

  async init() {
    try {
      this.creature = document.getElementById('mainCreature');
      this.container = document.querySelector('.container');
      this.sporeSticker = document.querySelector('.spore-sticker');

      if (!this.creature || !this.container) {
        throw new Error('Required DOM elements not found');
      }

      const session = await resolveSessionAssignment();
      this.charactersRegistry = session.charactersRegistry;
      this.vignettesRegistry = session.vignettesRegistry;
      this.assignment = session.assignment;

      const character = this.resolveCharacter(this.assignment.characterId);
      const vignetteRow = this.resolveVignette(this.assignment.vignetteId, character);

      this.characterRuntime = new CharacterRuntime(
        character,
        this.creature,
        this.sporeSticker,
        this.container
      );
      this.characterRuntime.apply(character);

      this.currentVignette = await vignetteLoader.load(vignetteRow, {
        character,
        assignment: this.assignment
      });

      this.setupEventListeners();
      this.logConsoleArt();

      if (this.assignment?.source === 'url-override') {
        // Harness Preview: auto-demo the assigned vignette / transition (click-driven otherwise)
        setTimeout(() => {
          this.runHarnessPreview().catch((err) => {
            console.warn('YAITG harness preview failed:', err);
          });
        }, 280);
      }

      if (CONFIG.APP.DEBUG_MODE) {
        console.log('YAITG assignment:', this.assignment);
        console.log('YAITG character:', character.id, 'vignette:', vignetteRow.id);
      }
    } catch (error) {
      // Keep static HTML visible — never inject an overlay error screen
      console.error('Failed to initialize Mushroom Platypus:', error);
    }
  }

  /**
   * URL-override Preview path — demo vignette visually, then play transition if requested.
   * Query: ?character=&vignette=&transition=&preview=climax (ghost full finale)
   */
  async runHarnessPreview() {
    const params = new URLSearchParams(window.location.search);
    const previewMode = params.get('preview') || 'demo';
    const hasTransitionParam =
      params.has('transition') || params.has('transitionId');

    if (previewMode === 'climax' && this.currentVignette?.onClimax) {
      await this.currentVignette.onClimax();
    } else if (this.currentVignette?.previewDemo) {
      await this.currentVignette.previewDemo();
    } else if (this.currentVignette?.onSporeClick) {
      const rect = this.container.getBoundingClientRect();
      this.currentVignette.onSporeClick(rect.width / 2, rect.height / 2);
    }

    if (hasTransitionParam && this.assignment?.transitionId) {
      await new Promise((r) => setTimeout(r, 350));
      await globalEffectRunner.play(this.assignment.transitionId, this.container);
    }
  }

  resolveCharacter(characterId) {
    const list = this.charactersRegistry.characters || [];
    return (
      list.find((c) => c.id === characterId) ||
      list.find((c) => c.isSiteDefault) ||
      list[0]
    );
  }

  resolveVignette(vignetteId, character) {
    const list = this.vignettesRegistry.vignettes || [];
    // Harness / URL override may request any registry vignette (not only allowed pool)
    if (this.assignment?.source === 'url-override' && vignetteId) {
      const direct = list.find((v) => v.id === vignetteId);
      if (direct) return direct;
    }
    const allowed = character?.allowedVignetteIds || [];
    return (
      list.find((v) => v.id === vignetteId && allowed.includes(v.id)) ||
      list.find((v) => v.id === character?.defaultVignetteId) ||
      list.find((v) => v.isSiteDefault) ||
      list[0]
    );
  }

  setupEventListeners() {
    this.creature.addEventListener('click', (e) => this.handleCreatureClick(e));
    if (this.sporeSticker) {
      this.sporeSticker.addEventListener('click', (e) => this.handleStickerClick(e));
    }
    this.container.addEventListener('click', (e) => {
      if (e.target !== this.creature && e.target !== this.sporeSticker) {
        this.handleContainerClick(e);
      }
    });
    window.addEventListener('resize', () => this.characterRuntime?.syncAccessoryPositions());
  }

  handleCreatureClick(e) {
    if (!this.debounceClick()) return;
    this.clickCount += 1;

    const rect = this.container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.currentVignette?.onSporeClick) {
      this.currentVignette.onSporeClick(x, y);
    }

    this.pulseCreature();
    this.checkConsoleMessages();

    if (this.clickCount % 100 === 0) {
      this.considerVignetteTransition();
    }
  }

  handleStickerClick(e) {
    if (!this.debounceClick()) return;
    this.clickCount += 1;
    const rect = this.container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (this.currentVignette?.onSporeClick) {
      this.currentVignette.onSporeClick(x, y);
    }
    this.checkConsoleMessages();
  }

  handleContainerClick(e) {
    const rect = this.container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    createDefaultSporeExplosion(x, y, this.container);
  }

  debounceClick() {
    const now = Date.now();
    if (now - this.lastClickTime < this.clickDebounce) return false;
    this.lastClickTime = now;
    return true;
  }

  pulseCreature() {
    this.creature.style.filter = CONFIG.VISUALS.CREATURE_PULSE_FILTER;
    setTimeout(() => {
      this.creature.style.filter = CONFIG.VISUALS.CREATURE_INITIAL_FILTER;
    }, CONFIG.ANIMATIONS.CREATURE_PULSE_DURATION);
  }

  checkConsoleMessages() {
    CONFIG.CONSOLE_MESSAGES.forEach((msg) => {
      if (this.clickCount === msg.clicks) {
        console.log(msg.message);
      }
    });
  }

  async considerVignetteTransition() {
    try {
      if (this.assignment?.transitionId) {
        await globalEffectRunner.play(this.assignment.transitionId, this.container);
      }

      if (this.currentVignette?.onClimax) {
        await this.currentVignette.onClimax();
        await new Promise((r) => setTimeout(r, 800));
      }

      await this.transitionToNewVignette();
    } catch (error) {
      console.error('Vignette transition failed:', error);
    }
  }

  async transitionToNewVignette() {
    const character = this.resolveCharacter(this.assignment.characterId);
    const candidates = (this.vignettesRegistry.vignettes || []).filter(
      (v) =>
        character.allowedVignetteIds?.includes(v.id) &&
        v.id !== this.assignment.vignetteId &&
        v.visibleInPool !== false
    );
    if (!candidates.length) return;

    const next =
      candidates[Math.floor(Math.random() * candidates.length)];
    this.assignment.vignetteId = next.id;
    this.currentVignette = await vignetteLoader.load(next, {
      character,
      assignment: this.assignment
    });
  }

  logConsoleArt() {
    console.log(`%c${CONFIG.CONSOLE_ART.EMOJI}`, CONFIG.CONSOLE_ART.EMOJI_STYLE);
    console.log(`%c${CONFIG.CONSOLE_ART.MESSAGE}`, CONFIG.CONSOLE_ART.MESSAGE_STYLE);
  }

  getStats() {
    return {
      clickCount: this.clickCount,
      assignment: this.assignment,
      vignette: this.currentVignette?.constructor?.name || 'None'
    };
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const app = new MushroomPlatypusApp();
  await app.init();
  if (CONFIG.APP.DEBUG_MODE) {
    window.mushroomPlatypusApp = app;
  }
});
