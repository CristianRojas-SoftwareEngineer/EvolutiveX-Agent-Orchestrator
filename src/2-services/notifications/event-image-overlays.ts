// SVG de overlays por tipo de evento (compositor sharp, 128×128).

export type EventImageOverlayId =
  | 'speech-lines'
  | 'speech-question'
  | 'dual-robot'
  | 'badge-check'
  | 'badge-warning'
  | 'badge-play'
  | 'badge-power'
  | 'badge-shield'
  | 'badge-plus'
  | 'badge-plus-orange'
  | 'badge-task-done';

const CYAN = '#00C8F0';
const WHITE = '#FFFFFF';
const NAVY = '#001038';
const WARNING = '#F5C518';
const ORANGE = '#FF8C00';

/** SVG overlay alineado al canvas 128×128 (badges abajo-derecha salvo burbujas). */
export function buildEventOverlaySvg(overlayId: EventImageOverlayId): string {
  switch (overlayId) {
    case 'speech-lines':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <path fill="${CYAN}" d="M88 18h22a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H96l-8 10v-10H88a8 8 0 0 1-8-8V26a8 8 0 0 1 8-8z"/>
  <rect x="92" y="30" width="14" height="3" rx="1.5" fill="${NAVY}"/>
  <rect x="92" y="36" width="10" height="3" rx="1.5" fill="${NAVY}"/>
  <rect x="92" y="42" width="12" height="3" rx="1.5" fill="${NAVY}"/>
</svg>`;
    case 'speech-question':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <path fill="${CYAN}" d="M86 16h24a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8h-8l-8 10v-10h-8a8 8 0 0 1-8-8V24a8 8 0 0 1 8-8z"/>
  <text x="99" y="40" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="22" font-weight="700" fill="${WHITE}">?</text>
</svg>`;
    case 'badge-check':
      return badgeCircle(
        `<polyline points="98,108 104,114 116,100" fill="none" stroke="${WHITE}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    case 'badge-play':
      return badgeCircle(`<polygon points="100,100 100,116 116,108" fill="${WHITE}"/>`);
    case 'badge-power':
      return badgeCircle(
        `<circle cx="108" cy="104" r="5" fill="none" stroke="${WHITE}" stroke-width="2.5"/>
         <line x1="108" y1="99" x2="108" y2="114" stroke="${WHITE}" stroke-width="2.5" stroke-linecap="round"/>`,
      );
    case 'badge-shield':
      return badgeCircle(
        `<path d="M108 96c6 2 10 6 10 10v6c-6 4-10 6-10 6s-4-2-10-6v-6c0-4 4-8 10-10z" fill="none" stroke="${WHITE}" stroke-width="2.2"/>
         <rect x="104" y="104" width="8" height="7" rx="1.5" fill="${WHITE}"/>
         <path d="M106 104v-2a2 2 0 0 1 4 0v2" fill="none" stroke="${WHITE}" stroke-width="1.8"/>`,
      );
    case 'badge-plus':
      return badgeCircle(
        `<rect x="100" y="102" width="16" height="16" rx="3" fill="none" stroke="${WHITE}" stroke-width="2.2"/>
         <line x1="108" y1="106" x2="108" y2="114" stroke="${WHITE}" stroke-width="2.5" stroke-linecap="round"/>
         <line x1="104" y1="110" x2="112" y2="110" stroke="${WHITE}" stroke-width="2.5" stroke-linecap="round"/>`,
      );
    case 'badge-plus-orange':
      return badgeCircle(
        `<rect x="100" y="102" width="16" height="16" rx="3" fill="none" stroke="${ORANGE}" stroke-width="2.2"/>
         <line x1="108" y1="106" x2="108" y2="114" stroke="${ORANGE}" stroke-width="2.5" stroke-linecap="round"/>
         <line x1="104" y1="110" x2="112" y2="110" stroke="${ORANGE}" stroke-width="2.5" stroke-linecap="round"/>`,
      );
    case 'badge-task-done':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect x="92" y="92" width="28" height="28" rx="6" fill="none" stroke="${CYAN}" stroke-width="3"/>
  <polyline points="98,108 104,114 112,102" fill="none" stroke="${CYAN}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
    case 'badge-warning':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <polygon points="108,88 124,118 92,118" fill="${WARNING}" stroke="${WHITE}" stroke-width="2"/>
  <line x1="108" y1="96" x2="108" y2="108" stroke="${NAVY}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="108" cy="113" r="2" fill="${NAVY}"/>
</svg>`;
    case 'dual-robot':
      return '';
    default:
      return '';
  }
}

function badgeCircle(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <circle cx="108" cy="108" r="18" fill="${CYAN}" stroke="${WHITE}" stroke-width="2.5"/>
  ${inner}
</svg>`;
}
