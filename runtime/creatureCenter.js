/**
 * Creature / container center in container-local coordinates (for preview demos).
 * @param {HTMLElement|null} container
 * @param {HTMLElement|null} creature
 * @returns {{ x: number, y: number }}
 */
export function creatureCenter(container, creature) {
  const host = container || document.querySelector('.container');
  if (!host) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const hostRect = host.getBoundingClientRect();
  const el = creature || document.getElementById('mainCreature');
  if (el) {
    const r = el.getBoundingClientRect();
    return {
      x: r.left - hostRect.left + r.width / 2,
      y: r.top - hostRect.top + r.height / 2
    };
  }
  return { x: hostRect.width / 2, y: hostRect.height / 2 };
}
