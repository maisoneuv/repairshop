const COLOR_MAP = {
  gray:    'bg-gray-100 text-gray-700 border-gray-200',
  sky:     'bg-sky-50 text-sky-700 border-sky-200',
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  purple:  'bg-purple-50 text-purple-700 border-purple-200',
  rose:    'bg-rose-50 text-rose-700 border-rose-200',
  indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  teal:    'bg-teal-50 text-teal-700 border-teal-200',
  orange:  'bg-orange-50 text-orange-700 border-orange-200',
  pink:    'bg-pink-50 text-pink-700 border-pink-200',
};

const DEFAULT_CLASSES = COLOR_MAP.gray;

/**
 * Get Tailwind classes for a color name from the palette.
 */
export function getStatusClasses(colorName) {
  return COLOR_MAP[colorName] || DEFAULT_CLASSES;
}

/**
 * Build a lookup map from picklist API response: { statusValue: tailwindClasses }
 * Input: array of { value, name, color } from /api/core/picklist/<category>/
 */
export function buildStatusColorMap(picklistValues) {
  const map = {};
  if (!picklistValues) return map;
  for (const item of picklistValues) {
    map[item.value] = getStatusClasses(item.color);
  }
  return map;
}

/**
 * Look up Tailwind classes for a status value using a pre-built color map.
 * Falls back to gray if status is not found.
 */
export function getStatusStyle(statusValue, colorMap) {
  if (!statusValue || !colorMap) return DEFAULT_CLASSES;
  return colorMap[statusValue] || DEFAULT_CLASSES;
}
