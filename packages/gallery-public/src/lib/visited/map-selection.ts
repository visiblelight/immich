export type MapScope = 'region' | 'country' | 'all';
export type ExpandedMapScope = 'country' | 'all' | null;

/** Expanded map views never retain a single country's/province's visit filter. */
export function mapSelection(params: URLSearchParams, ownScope: 'country' | 'region') {
  const value = params.get('scope');
  const expandedScope: ExpandedMapScope = value === 'all' ? 'all'
    : ownScope === 'region' && value === 'country' ? 'country' : null;
  return {
    expandedScope,
    scope: expandedScope ?? ownScope,
    visitId: expandedScope ? null : params.get('visit'),
  };
}
