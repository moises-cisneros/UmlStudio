const raw = import.meta.env.VITE_MAX_VERSIONS_PER_DIAGRAM;
const parsed = raw ? Number(raw) : NaN;
export const MAX_VERSIONS_PER_DIAGRAM =
  Number.isFinite(parsed) && parsed > 0 ? parsed : 50;

const rawLocal = import.meta.env.VITE_MAX_LOCAL_VERSIONS_PER_DIAGRAM;
const parsedLocal = rawLocal ? Number(rawLocal) : NaN;
export const MAX_LOCAL_VERSIONS_PER_DIAGRAM =
  Number.isFinite(parsedLocal) && parsedLocal > 0 ? parsedLocal : 30;
