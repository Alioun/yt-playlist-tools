// THROWAWAY PROTOTYPE (ticket 15). The prototype's URL parameters (scenario, theme, variant, open part, os, browser).
const params = new URLSearchParams(location.search);
export const param = (k: string) => params.get(k);
