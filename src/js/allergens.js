const ALLERGEN_RULES = [
  { label: 'Глютен (пшеница)', pattern: /глютен|мука пшенич|пшеничн/i },
  { label: 'Молоко и лактоза', pattern: /молок|лактоз|сыр|сливк|маскарпон|творог|сметан|сгущен/i },
  { label: 'Яйца', pattern: /яйц|яичн|белок/i },
  { label: 'Орехи', pattern: /орех|миндал|фисташ|арахис|лещич/i },
  { label: 'Соя', pattern: /соев/i },
];

/** Определяет возможные аллергены по тексту состава. */
export function detectAllergens(compositionText) {
  const text = String(compositionText || '');
  if (!text.trim()) return [];

  const found = [];
  for (const rule of ALLERGEN_RULES) {
    if (rule.pattern.test(text)) found.push(rule.label);
  }
  return found;
}

export function getProductAllergens(product) {
  const parts = [
    product?.composition,
    product?.fullDescription,
    product?.description,
  ].filter(Boolean);
  return detectAllergens(parts.join(' '));
}
