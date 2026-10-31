/**

 * Recovering Site Kit — DOM class contract (SSOT).

 * Sites import this module; brag re-exports from pf-dom-contract.ts.

 */



/** @type {const} */

export const PF_BTN = 'pf-btn';

export const PF_BTN_PRIMARY = 'pf-btn pf-btn--primary';

export const PF_BTN_SECONDARY = 'pf-btn pf-btn--secondary';

export const PF_BTN_GHOST = 'pf-btn pf-btn--ghost';

/** Desk compact secondary/inline action (Refresh, Add entry, Clear) — .od-body scoped height */
export const PF_BTN_DESK_SM = 'pf-btn pf-btn--secondary pf-btn--desk-sm';

/** Desk compact primary — same height as PF_BTN_DESK_SM (Push / Save) */
export const PF_BTN_DESK_PRIMARY = 'pf-btn pf-btn--primary pf-btn--desk-sm';

/** @deprecated alias — use PF_BTN_DESK_SM */
export const OD_BTN_SM = 'od-btn-sm';

/** Desk text field — height/radius from pf-desk-controls.css on .od-body */
export const PF_INPUT = 'pf-input';

/** Alias for documentation; same class as PF_INPUT */
export const PF_INPUT_DESK = PF_INPUT;

/** Segment / view-toggle control (legacy .view-toggle-btn alias in pf-kit.css) */
export const PF_BTN_SEGMENT = 'pf-btn pf-btn--segment';

export const PF_BTN_SEGMENT_ACTIVE = 'pf-btn--segment-active';

export const PF_VIEW_TOGGLE = 'pf-view-toggle';

export const PF_DESK_PAGE_TOOLBAR = 'pf-desk-page-toolbar';

export const PF_DESK_LIST_TOOLBAR = 'pf-desk-list-toolbar';

/** Bordered unit wrapping list search toolbar + table (one control surface). */
export const PF_DESK_LIST_UNIT = 'pf-desk-list-unit';

export const PF_DESK_LIST_SEARCH = 'pf-input pf-desk-list-search';

export const PF_DESK_SECTION = 'pf-desk-section';

export const PF_DESK_SECTION_HEAD = 'pf-desk-section__head';

export const PF_DESK_SECTION_TITLE = 'pf-desk-section__title';

/** Corner step number in a desk section title (wizard / ordered cards) */
export const PF_DESK_SECTION_STEP = 'pf-desk-section__step';

export const PF_DESK_SECTION_STEP_LABEL = 'pf-desk-section__step-label';

export const PF_DESK_SECTION_META = 'pf-desk-section__meta';

export const PF_DESK_SECTION_TOOLBAR = 'pf-desk-section__toolbar';

export const PF_DESK_SECTION_BODY = 'pf-desk-section__body';

/** Home row: Quick links + At a glance side by side */
export const PF_DESK_HOME_SPLIT = 'pf-desk-home-split';

/** Home section bodies — 2 equal vertical cards per row */
export const PF_DESK_HOME_CARD_GRID = 'pf-desk-home-card-grid';

export const PF_CARD_PROJECT = 'pf-card pf-card--project';

/** Operator desk site launcher — square corners, compact hero */
export const PF_CARD_DESK = 'pf-card pf-card--project pf-card--desk';

/** Unified desk card regions (home section cards + site launchers) */
export const PF_DESK_CARD_MAIN = 'pf-desk-card__main';
export const PF_DESK_CARD_HERO = 'pf-desk-card__hero';
export const PF_DESK_CARD_BODY = 'pf-desk-card__body';
export const PF_DESK_CARD_CONTROLS = 'pf-desk-card__controls';

export const PF_CARD_AUTHORING_HIGHLIGHT = 'pf-card--authoring-highlight';



export const PF_BADGE = 'pf-badge';

export const PF_TAG = 'pf-tag';

export const PF_TAG_CHIP = 'pf-tag pf-tag--chip';



export const PF_CONTROL = 'pf-control';

export const PF_CONTROL_SEGMENT = 'pf-control pf-control--segment';

/** Generic translator-highlight toggle (Recruiter Glasses = one registry id) */

export const PF_CONTROL_TRANSLATOR = 'pf-control pf-control--translator';

/** @deprecated alias — use PF_CONTROL_TRANSLATOR */

export const PF_CONTROL_LENS = PF_CONTROL_TRANSLATOR;

export const PF_TRANSLATOR_BADGE = 'pf-translator-badge';

/** @deprecated alias */

export const PF_LENS_BADGE = PF_TRANSLATOR_BADGE;



export const PF_TRANSLATOR_BANNER = 'pf-translator-banner';

export const PF_CONTACT = 'pf-contact';

export const PF_CONTACT_ROW = 'pf-contact-row';

export const PF_EDITABLE_BLOCK = 'pf-editable-block';

export const PF_LIST_ITEM = 'pf-list__item';



export const PF_DATE = 'pf-date';

export const PF_LIST = 'pf-list';



export const PF_RAIL = 'pf-rail';

export const PF_OUTLINE_RAIL = 'pf-outline-rail';
export const PF_OUTLINE_RAIL_SECTIONED = 'pf-outline-rail pf-outline-rail--sectioned';
export const PF_OUTLINE_RAIL_FLAT = 'pf-outline-rail pf-outline-rail--flat';
export const PF_OUTLINE_RAIL_NO_TYPE_COL = 'pf-outline-rail--no-type-col';
export const PF_FORM_SELECT = 'pf-form__select';
export const PF_FORM_LABEL = 'pf-form__label';

export const PF_ACTION_BAR = 'pf-action-bar';

export const PF_SHEET = 'pf-sheet';

export const PF_SHEET_BACKDROP = 'pf-sheet-backdrop';

export const PF_WORKSPACE_SPLIT = 'pf-workspace-split';

export const PF_DIALOG = 'pf-dialog';

/** Mobile shell — site-kit SSOT for compact / LAN routes */
export const PF_MOBILE_SHELL = 'pf-mobile-shell';
export const PF_MOBILE_BTN = 'pf-mobile-btn';
export const PF_MOBILE_SHEET = 'pf-mobile-sheet';
export const PF_MOBILE_SHEET_BACKDROP = 'pf-mobile-sheet-backdrop';

/** data-pf-* attribute names */

export const PF_ATTR_COMPONENT = 'data-pf-component';

export const PF_ATTR_VARIANT = 'data-pf-variant';

export const PF_ATTR_DATE_FORMAT = 'data-pf-date-format';

export const PF_ATTR_TRANSLATOR = 'data-pf-translator-highlight';

export const PF_ATTR_EDITABLE = 'data-pf-editable';

export const PF_ATTR_CONTENT_PATH = 'data-pf-content-path';

export const PF_ATTR_BLOCK_ID = 'data-pf-block-id';

export const PF_ATTR_ORDER_INDEX = 'data-pf-order-index';

export const PF_ATTR_FIELD = 'data-pf-field';

export const PF_ATTR_BINDING = 'data-pf-binding';

/** Stable debug pick id — unique per rendered instance (e.g. project-card:slug or card:3/5) */
export const PF_ATTR_INSPECT_ID = 'data-pf-inspect-id';

/** Human label for debug pick panel */
export const PF_ATTR_INSPECT_LABEL = 'data-pf-inspect-label';

/** Global privacy hook — type token for anonymize() parity */
export const PF_ATTR_PRIVACY_TYPE = 'data-pf-privacy-type';

export const PF_ATTR_PRIVACY_LABEL = 'data-pf-privacy-label';


