/**
 * Generic per-type objectAction field schemas for Cambio editors.
 * New character OAs reuse these modes + HTML ie-rows; add a schema entry + field group.
 */

/** Safe web-font stacks for dropdown (plus empty = browser default / current look). */
export const SAFE_FONT_OPTIONS = [
  { value: '', label: 'Default (current look)' },
  { value: 'system-ui, sans-serif', label: 'system-ui' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
  { value: "'Courier New', Courier, monospace", label: 'Courier New' },
  { value: 'Impact, Haettenschweiler, sans-serif', label: 'Impact' },
  { value: 'cursive', label: 'cursive' },
  { value: 'fantasy', label: 'fantasy' }
];

/**
 * Field modes for textProjectile. Each maps to an isolated ie-row (pencil/✓/✕).
 * @type {Array<{ mode: string, label: string }>}
 */
export const TEXT_PROJECTILE_FIELD_MODES = [
  { mode: 'oaText', label: 'Text' },
  { mode: 'oaDuration', label: 'Duration until fade (ms)' },
  { mode: 'oaDistance', label: 'Distance from origin' },
  { mode: 'oaFontFamily', label: 'Font' },
  { mode: 'oaFontSize', label: 'Font size' },
  { mode: 'oaColor', label: 'Text color' }
];

/** @type {Record<string, Array<{ mode: string, label: string }>>} */
export const OBJECT_ACTION_FIELD_SCHEMAS = {
  textProjectile: TEXT_PROJECTILE_FIELD_MODES,
  // fire: action-point / direction editor is the shared stage picker (data-mode="action")
  fire: []
};

export function schemaForActionType(type) {
  return OBJECT_ACTION_FIELD_SCHEMAS[type] || [];
}

export default OBJECT_ACTION_FIELD_SCHEMAS;
