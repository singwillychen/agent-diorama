// Named anchors for the xianxia peak. theme.json zones point at these
// (`zone:main_hall` …). Moving a building = editing one entry here; a GLB
// scene later exposes the same names as empty nodes (docs/07 §5).

export type Vec3 = [number, number, number];

export interface Anchor {
  pos: Vec3;
  /** Seat offsets (x, z) relative to pos; overflow seats are generated in rings. */
  seats: [number, number][];
  /** Direction characters face when seated (radians, 0 = +z toward camera). */
  facing?: number | "center";
}

const ring = (n: number, r: number, start = 0): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
  });

const arc = (n: number, r: number, from: number, to: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = from + ((to - from) * (i + 0.5)) / n;
    return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
  });

export const ANCHORS: Record<string, Anchor> = {
  // Front terrace of the main hall — sect master in the middle, elders flanking.
  "zone:main_hall": { pos: [0, 0.6, -4.6], seats: [[0, 0], [-1.6, 0.3], [1.6, 0.3], [-3.0, 0.6], [3.0, 0.6], [-4.3, 1.0], [4.3, 1.0]], facing: 0 },
  "zone:scripture_pavilion": { pos: [-21, 0.4, -1.5], seats: arc(6, 2.6, 0.2, Math.PI - 0.2), facing: "center" },
  "zone:alchemy_room": { pos: [21, 0.4, -0.5], seats: ring(6, 2.4, Math.PI / 2 + 0.5), facing: "center" },
  "zone:grand_array": { pos: [7.5, 0, 3], seats: ring(4, 1.9, Math.PI / 4), facing: "center" },
  "zone:mountain_gate": { pos: [0, 0, 10.2], seats: [[-1.4, 0], [1.4, 0], [-2.8, 0.2], [2.8, 0.2]], facing: 0 },
  "zone:teleport_array": { pos: [-0.2, 0.15, 5.4], seats: ring(8, 1.5, 0), facing: "center" },
  "zone:beast_garden": { pos: [-7.5, 0, 4.6], seats: ring(7, 2.6, 0.3), facing: "center" },
  "zone:cave_abode": { pos: [15, 2.2, -17], seats: [[0, 1.6], [-1.6, 1.2], [1.6, 1.2], [-2.6, 0.2], [2.6, 0.2]], facing: 0 },
  // Meeting: an arc on the plaza facing the hall.
  "zone:meeting_plaza": { pos: [0, 0, -1.2], seats: arc(10, 3.2, Math.PI * 1.1, Math.PI * 1.9), facing: "center" },
};

// Theme zone ids used by the meeting state point at the hall; we stage meetings
// on the plaza in front of it so everyone stays visible from above.
export const ZONE_ALIASES: Record<string, string> = {
  "zone:main_hall#meeting": "zone:meeting_plaza",
};

export function seatPosition(anchorName: string, slot: number): { pos: Vec3; facing: number } {
  const a = ANCHORS[anchorName] ?? ANCHORS["zone:main_hall"];
  let off: [number, number];
  if (slot < a.seats.length) off = a.seats[slot];
  else {
    const extra = slot - a.seats.length;
    const r = 3.4 + Math.floor(extra / 8) * 1.2;
    const ang = (extra % 8) * (Math.PI / 4) + 0.2;
    off = [Math.cos(ang) * r, Math.sin(ang) * r];
  }
  const pos: Vec3 = [a.pos[0] + off[0], a.pos[1], a.pos[2] + off[1]];
  let facing: number;
  if (a.facing === "center") facing = Math.atan2(a.pos[0] - pos[0], a.pos[2] - pos[2]);
  else facing = a.facing ?? 0;
  if (off[0] === 0 && off[1] === 0 && a.facing === "center") facing = 0;
  return { pos, facing };
}
