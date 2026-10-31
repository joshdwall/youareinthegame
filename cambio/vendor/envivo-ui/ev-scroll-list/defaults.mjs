/** Hardcoded defaults for mountEvScrollList — override per page only when required. */
export const SCROLL_LIST_DEFAULTS = {
  minRows: 8,
  maxHeight: 'min(48vh, 18rem)',
  searchPlaceholder: 'Search…',
  metaLabel: '…',
  /** SL-26: cells/headers never wrap. */
  cellWrap: false,
  /** SL-27: measure content, leftover to flex, ellipsis only after shrink. */
  autoFit: true,
  overflowX: 'hidden',
  contentMinRem: 2.4,
  flexMinRem: 5
};

export default SCROLL_LIST_DEFAULTS;
