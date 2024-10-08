// Shortcuts aliases for existing Math functions
export const abs = Math.abs;
export const min = Math.min;
export const max = Math.max;
export const ceil = Math.ceil;
export const floor = Math.floor;

/** Normal rounding which rounds *up* on 0.5.  */
export const round = Math.round;

/** Game Freaks version of rounding which rounds *down* on 0.5. */
export const roundDown = (n: number) => (n % 1 > 0.5 ? ceil(n) : floor(n));

/** Returns `n` as an integer greater than `a` and less than `b`. */
export const clamp = (a: number, n: number, b: number) => min(max(floor(n), a), b);

/**
 * Truncate a number `n` into an unsigned 32-bit integer (or, optionally, `bits`), for
 * compatibility with the cartridge games' math systems. This is the function responsible
 * for recreating the 16 and 32 overflow quirks.
 */
export const trunc = (n: number, bits = 0) => (bits ? (n >>> 0) % 2 ** bits : n >>> 0);

/** Shift a number `n` bits to the left (+) or right (-) */
export const shift = (n: number, bits: number = 0) => (bits > 0 ? n << bits : n >> (bits * -1));

/** Chain the original mod `m` to the next mod `n` per the cartridge mechanics. */
export const chainMod = (m: number, n: number) => round(m * n + 0x800) >> 12;

/** Chain the original mod `m` to the next mod `n` if `n` is not undefined. */
export const chain = (m: number, n?: number) => (n !== undefined ? chainMod(m, n) : m);

/** Apply the mod `m` to the number `n` per the cartridge mechanics. */
export const applyMod = (n: number, m: number) => roundDown(trunc(n * m) / 0x1000);

/** Apply the mod `m` to the number `n` if `m` is not undefined. */
export const apply = (n: number, m?: number) => (m !== undefined ? applyMod(n, m) : n);

/** Returns a random integer between [1,max] */
export const random = (max: number) => Math.ceil(Math.random() * max);
