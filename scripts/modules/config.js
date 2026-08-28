export const VERSION = "1.4.0";
export const SELF = process.env.MAGMA_CONTAINER_NAME || "magma";
export const MAX_N = Math.min(200, Math.max(1, Number(process.env.MAGMA_MAX_N) || 32));
