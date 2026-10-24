/**
 * Apply character sprites and accessories to the static DOM.
 */
export class CharacterRuntime {
  /**
   * @param {object} character — row from characters-registry
   * @param {HTMLElement} creatureEl
   * @param {HTMLElement|null} stickerEl
   * @param {HTMLElement} containerEl
   */
  constructor(character, creatureEl, stickerEl, containerEl) {
    this.character = character;
    this.creatureEl = creatureEl;
    this.stickerEl = stickerEl;
    this.containerEl = containerEl;
    this.accessoryEls = [];
  }

  /**
   * @param {object} character
   */
  apply(character = this.character) {
    this.character = character;
    if (!this.creatureEl || !character) return;

    const assets = character.assets || {};
    if (assets.baseSprite) {
      this.creatureEl.src = assets.baseSprite;
      this.creatureEl.alt = `${character.label} Creature`;
    }
    if (this.stickerEl && assets.sticker) {
      this.stickerEl.src = assets.sticker;
    }

    this.clearAccessories();
    for (const acc of character.accessories || []) {
      this.mountAccessory(acc);
    }
  }

  /**
   * @param {object} acc
   */
  mountAccessory(acc) {
    if (!acc?.src || !this.containerEl) return;
    const img = document.createElement('img');
    img.className = `character-accessory character-accessory--${acc.id || 'accessory'}`;
    img.src = acc.src;
    img.alt = '';
    img.draggable = false;
    img.style.position = 'absolute';
    img.style.pointerEvents = 'none';
    img.style.zIndex = '3';
    if (acc.width) img.style.width = `${acc.width}px`;
    if (acc.offsetX != null) img.style.setProperty('--acc-x', `${acc.offsetX}px`);
    if (acc.offsetY != null) img.style.setProperty('--acc-y', `${acc.offsetY}px`);

    // Anchor relative to creature center via CSS in styles.css
    img.dataset.anchor = acc.anchor || 'head';
    this.containerEl.appendChild(img);
    this.accessoryEls.push(img);
    this.syncAccessoryPositions();
  }

  syncAccessoryPositions() {
    if (!this.creatureEl || !this.containerEl) return;
    const creatureRect = this.creatureEl.getBoundingClientRect();
    const containerRect = this.containerEl.getBoundingClientRect();
    const cx = creatureRect.left - containerRect.left + creatureRect.width / 2;
    const cy = creatureRect.top - containerRect.top;

    for (const el of this.accessoryEls) {
      const ox = parseFloat(el.style.getPropertyValue('--acc-x') || '0');
      const oy = parseFloat(el.style.getPropertyValue('--acc-y') || '0');
      const w = el.offsetWidth || parseFloat(el.style.width) || 0;
      el.style.left = `${cx - w / 2 + ox}px`;
      el.style.top = `${cy + oy}px`;
    }
  }

  clearAccessories() {
    for (const el of this.accessoryEls) el.remove();
    this.accessoryEls = [];
  }
}
