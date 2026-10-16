'use strict';
/* أيقونات SVG واضحة وسميكة بدل الرموز (زي كروم) */
const ICON_PATHS = {
  back: 'M5 12h14M13 6l6 6-6 6',
  forward: 'M19 12H5M11 6l-6 6 6 6',
  reload: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.5H15',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  home: 'M4 10.5L12 4l8 6.5V20h-5.2v-5.5H9.2V20H4z',
  star: 'M12 3.8l2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.6-5 2.6 1-5.6-4.1-4 5.6-.8z',
  video: 'M3.5 6.5h11v11h-11zM14.5 10.5l6-3.2v9.4l-6-3.2',
  translate: 'M4 5.5h9M8.5 3.5v2M6 5.5c.6 3.4 2.8 6 6 7.3M11 5.5c-.8 3.6-3 6.6-6.5 8.3M13 20.5l3.8-9 3.8 9M14.3 17.5h5',
  puzzle: 'M9 4.5a2 2 0 0 1 4 0V7h4v4h-1.5a2 2 0 0 0 0 4H17v4H7v-4h1.5a2 2 0 0 0 0-4H7V7h2z',
  shield: 'M12 3.5l7.5 2.8v5.4c0 4.6-3.2 7.6-7.5 8.8-4.3-1.2-7.5-4.2-7.5-8.8V6.3z',
  incognito: 'M3 11h18M6.5 11L8 5.5c.2-.7 1-1 1.6-.7L12 6l2.4-1.2c.6-.3 1.4 0 1.6.7L17.5 11M4.9 16a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M13.9 16a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M10.1 16h3.8',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
  dots: 'M12 5.5h.01M12 12h.01M12 18.5h.01',
  list: 'M4.5 7h15M4.5 12h15M4.5 17h15',
  plus: 'M12 5.5v13M5.5 12h13',
  lock: 'M6.5 11h11v8.5h-11zM9 11V8.3a3 3 0 0 1 6 0V11',
  search: 'M10.5 4.5a6 6 0 1 0 0 12a6 6 0 1 0 0-12M15 15l4.5 4.5',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17M12 11v5M12 8h.01',
  reader: 'M5 4h14v16H5zM8.5 8h7M8.5 12h7M8.5 16h4',
  pip: 'M3.5 5.5h17v13h-17zM12 12h6.5v4.5H12z',
  camera: 'M4 8h3.2l1.8-2.5h6l1.8 2.5H20v11H4zM12 10.2a3.3 3.3 0 1 0 0 6.6a3.3 3.3 0 1 0 0-6.6',
  chat: 'M4.5 5h15v11H10l-5.5 4z',
  volume: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.5 7.5 0 0 1 0 10.4',
  muted: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4zM16 9.5l5 5M21 9.5l-5 5',
  key: 'M8 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7M11.5 12h9M17.5 12v3M20.5 12v2.5',
  gauge: 'M4 16.5a8 8 0 1 1 16 0M12 16.5l4-5',
  palette: 'M12 3.5a8.5 8.5 0 1 0 0 17c1 0 1.5-.7 1.5-1.4 0-1.1-1-1.3-1-2.3 0-.9.8-1.5 1.7-1.5H17a3.7 3.7 0 0 0 3.5-3.8c0-4.4-3.8-8-8.5-8M7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01',
  window: 'M3.5 5h17v14h-17zM3.5 9h17',
  power: 'M12 3.5v8M7.2 6.3a7.5 7.5 0 1 0 9.6 0',
  person: 'M12 4a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2M5 9l7 1.5L19 9M12 10.5V14l-3 6M12 14l3 6',
  wrench: 'M14.5 4.5a4.5 4.5 0 0 0 5 5.5l-8.8 8.8a2.3 2.3 0 0 1-3.3-3.3L16.2 6.7a4.5 4.5 0 0 1-1.7-2.2z',
  reset: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5V9H9',
  sidebar: 'M3.5 5h17v14h-17zM9 5v14',
  external: 'M14 4.5h5.5V10M19.5 4.5L11 13M17 14v5.5H4.5V7H10',
  bookmark: 'M7 4h10v16l-5-3.5L7 20z',
  history: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5V9H9M12 8v4.5l3 2'
};
const FILLED = new Set(['dots']);
function icon(name, cls = '') {
  const d = ICON_PATHS[name] || '';
  const fill = name === 'star-on' ? ICON_PATHS.star : null;
  if (fill) return `<svg class="ic ${cls}" viewBox="0 0 24 24"><path d="${fill}" fill="currentColor"/></svg>`;
  if (FILLED.has(name)) return `<svg class="ic ${cls}" viewBox="0 0 24 24"><path d="${d}" stroke-width="3.6"/></svg>`;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24"><path d="${d}"/></svg>`;
}
// كل زرار عليه data-icon بياخد الأيقونة بتاعته
function applyIcons(root = document) {
  for (const b of root.querySelectorAll('[data-icon]')) b.innerHTML = icon(b.dataset.icon);
}
applyIcons();
