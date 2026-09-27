/** Preserve road references and numbers; only translate name expressions. */
export function englishNames(value: unknown): unknown {
  if (
    value === '{name}' ||
    (Array.isArray(value) && value.length === 2 && value[0] === 'get' && value[1] === 'name')
  )
    return [
      'case',
      ['all', ['has', 'name_en'], ['!=', ['get', 'name_en'], '']],
      ['get', 'name_en'],
      ['get', 'name'],
    ];
  return Array.isArray(value) ? value.map(englishNames) : value;
}
