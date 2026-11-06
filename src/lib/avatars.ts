export const AVATAR_KEYS = [
  "owl",
  "fox",
  "panda",
  "lion",
  "frog",
  "cat",
  "penguin",
  "koala",
  "robot",
  "rocket",
  "whale",
  "bee",
] as const;

export type AvatarKey = (typeof AVATAR_KEYS)[number];

export interface AvatarDefinition {
  key: AvatarKey;
  name: string;
  description: string;
  background: string;
  accent: string;
}

/**
 * Original EVALORA avatar gallery. These are vector illustrations drawn
 * for EVALORA — no third-party character artwork is used.
 */
export const AVATARS: AvatarDefinition[] = [
  { key: "owl", name: "Professor Owl", description: "Curious and wise", background: "#D9F3EC", accent: "#087F6B" },
  { key: "fox", name: "Swift Fox", description: "Quick and clever", background: "#FFE7D6", accent: "#E85D26" },
  { key: "panda", name: "Calm Panda", description: "Focused and friendly", background: "#E8EEF7", accent: "#26324B" },
  { key: "lion", name: "Brave Lion", description: "Bold and confident", background: "#FFF0C2", accent: "#D97706" },
  { key: "frog", name: "Leap Frog", description: "Ready to jump in", background: "#DCF7D6", accent: "#2F9E44" },
  { key: "cat", name: "Star Cat", description: "Bright and playful", background: "#F1E4FF", accent: "#7C3AED" },
  { key: "penguin", name: "Polar Penguin", description: "Cool under pressure", background: "#DFF4FF", accent: "#2563A8" },
  { key: "koala", name: "Kind Koala", description: "Gentle and thoughtful", background: "#E7ECEF", accent: "#61707D" },
  { key: "robot", name: "Pixel Robot", description: "Logical and inventive", background: "#DDEBFF", accent: "#2563EB" },
  { key: "rocket", name: "Rocket Explorer", description: "Aiming for the stars", background: "#FFE4E6", accent: "#E11D48" },
  { key: "whale", name: "Wonder Whale", description: "Deep thinker", background: "#D9F1FF", accent: "#0284C7" },
  { key: "bee", name: "Busy Bee", description: "Hard-working team player", background: "#FFF3B0", accent: "#B45309" },
];

export function isAvatarKey(value: unknown): value is AvatarKey {
  return typeof value === "string" && (AVATAR_KEYS as readonly string[]).includes(value);
}

export function avatarDefinition(value: string | null | undefined): AvatarDefinition {
  return AVATARS.find((a) => a.key === value) ?? AVATARS[0];
}

export function normalizeAvatarKey(value: unknown): AvatarKey {
  return isAvatarKey(value) ? value : "owl";
}
