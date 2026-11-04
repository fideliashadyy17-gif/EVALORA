import { avatarDefinition, normalizeAvatarKey, type AvatarKey } from "@/lib/avatars";
import { cn } from "@/lib/utils";

/**
 * The same original illustrated avatar is used by the participant,
 * organizer monitor, public leaderboard and podium. The artwork is a
 * small inline SVG system: crisp at projection size, no external image
 * requests, and no proprietary character assets.
 */
export function ParticipantAvatar({
  avatarKey,
  name,
  size = 48,
  className,
}: {
  avatarKey?: string | null;
  name?: string;
  size?: number;
  className?: string;
}) {
  const key = normalizeAvatarKey(avatarKey);
  const definition = avatarDefinition(key);
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-white/80", className)}
      style={{ width: size, height: size, background: definition.background }}
      role="img"
      aria-label={name ? `${name}'s ${definition.name} avatar` : definition.name}
      title={definition.name}
    >
      <svg viewBox="0 0 96 96" width={size} height={size} aria-hidden="true" focusable="false">
        <AvatarArt avatarKey={key} />
      </svg>
    </span>
  );
}

function Eyes({ x1 = 36, x2 = 60, y = 46, r = 4, color = "#17211C" }: { x1?: number; x2?: number; y?: number; r?: number; color?: string }) {
  return (
    <>
      <circle cx={x1} cy={y} r={r} fill={color} />
      <circle cx={x2} cy={y} r={r} fill={color} />
      <circle cx={x1 + r * 0.35} cy={y - r * 0.35} r={Math.max(1, r * 0.28)} fill="#fff" />
      <circle cx={x2 + r * 0.35} cy={y - r * 0.35} r={Math.max(1, r * 0.28)} fill="#fff" />
    </>
  );
}

function Smile({ y = 60, color = "#17211C" }: { y?: number; color?: string }) {
  return <path d={`M38 ${y} Q48 ${y + 8} 58 ${y}`} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" />;
}

function AvatarArt({ avatarKey }: { avatarKey: AvatarKey }) {
  switch (avatarKey) {
    case "fox":
      return (
        <>
          <path d="M22 22 L40 34 L29 50 Z" fill="#B94018" />
          <path d="M74 22 L56 34 L67 50 Z" fill="#B94018" />
          <path d="M24 28 C28 17 40 14 48 22 C56 14 68 17 72 28 C76 45 67 67 48 78 C29 67 20 45 24 28Z" fill="#F97316" />
          <path d="M30 54 C36 50 42 55 48 66 C54 55 60 50 66 54 C62 66 56 72 48 77 C40 72 34 66 30 54Z" fill="#FFF7ED" />
          <Eyes x1={37} x2={59} y={43} r={3.6} />
          <path d="M43 57 Q48 53 53 57 Q50 64 48 64 Q46 64 43 57Z" fill="#17211C" />
          <path d="M48 64 Q48 70 42 70 M48 64 Q48 70 54 70" fill="none" stroke="#17211C" strokeWidth="2.6" strokeLinecap="round" />
        </>
      );
    case "panda":
      return (
        <>
          <circle cx="25" cy="27" r="14" fill="#26324B" />
          <circle cx="71" cy="27" r="14" fill="#26324B" />
          <ellipse cx="48" cy="52" rx="31" ry="29" fill="#FFFFFF" />
          <ellipse cx="35" cy="46" rx="8" ry="11" fill="#26324B" transform="rotate(-18 35 46)" />
          <ellipse cx="61" cy="46" rx="8" ry="11" fill="#26324B" transform="rotate(18 61 46)" />
          <circle cx="36" cy="45" r="2.8" fill="#fff" />
          <circle cx="60" cy="45" r="2.8" fill="#fff" />
          <ellipse cx="48" cy="58" rx="6" ry="4" fill="#26324B" />
          <Smile y={65} color="#26324B" />
        </>
      );
    case "lion":
      return (
        <>
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <circle key={i} cx={48 + Math.cos(a) * 29} cy={48 + Math.sin(a) * 29} r="12" fill="#D97706" />;
          })}
          <circle cx="48" cy="48" r="29" fill="#F59E0B" />
          <ellipse cx="48" cy="53" rx="24" ry="21" fill="#FDE68A" />
          <Eyes y={44} />
          <path d="M43 54 Q48 50 53 54 Q50 60 48 60 Q46 60 43 54Z" fill="#92400E" />
          <path d="M48 60 Q46 67 40 65 M48 60 Q50 67 56 65" fill="none" stroke="#92400E" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="31" cy="56" r="4" fill="#FDBA74" opacity=".75" />
          <circle cx="65" cy="56" r="4" fill="#FDBA74" opacity=".75" />
        </>
      );
    case "frog":
      return (
        <>
          <circle cx="31" cy="29" r="13" fill="#4ADE80" />
          <circle cx="65" cy="29" r="13" fill="#4ADE80" />
          <circle cx="31" cy="29" r="8" fill="#fff" />
          <circle cx="65" cy="29" r="8" fill="#fff" />
          <Eyes x1={31} x2={65} y={30} r={3.7} />
          <ellipse cx="48" cy="56" rx="32" ry="27" fill="#22C55E" />
          <ellipse cx="48" cy="66" rx="20" ry="13" fill="#DCFCE7" />
          <path d="M32 56 Q48 69 64 56" fill="none" stroke="#14532D" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="29" cy="59" r="5" fill="#86EFAC" />
          <circle cx="67" cy="59" r="5" fill="#86EFAC" />
        </>
      );
    case "cat":
      return (
        <>
          <path d="M25 35 L29 15 L45 27 Z" fill="#7C3AED" />
          <path d="M71 35 L67 15 L51 27 Z" fill="#7C3AED" />
          <path d="M29 31 L32 20 L40 27 Z" fill="#F9A8D4" />
          <path d="M67 31 L64 20 L56 27 Z" fill="#F9A8D4" />
          <ellipse cx="48" cy="53" rx="30" ry="27" fill="#8B5CF6" />
          <path d="M48 25 L51 33 L59 33 L53 38 L55 46 L48 41 L41 46 L43 38 L37 33 L45 33Z" fill="#FDE68A" />
          <Eyes y={52} color="#fff" r={3.5} />
          <path d="M45 61 Q48 58 51 61 Q49 65 48 65 Q47 65 45 61Z" fill="#F9A8D4" />
          <path d="M18 59 L31 61 M19 68 L31 65 M78 59 L65 61 M77 68 L65 65" stroke="#EDE9FE" strokeWidth="2.3" strokeLinecap="round" />
        </>
      );
    case "penguin":
      return (
        <>
          <ellipse cx="48" cy="52" rx="30" ry="34" fill="#1E3A5F" />
          <ellipse cx="48" cy="60" rx="20" ry="24" fill="#fff" />
          <circle cx="48" cy="25" r="6" fill="#FBBF24" />
          <Eyes y={39} r={3.7} />
          <path d="M41 47 Q48 43 55 47 Q51 55 48 55 Q45 55 41 47Z" fill="#F59E0B" />
          <path d="M21 52 Q8 62 18 74 Q26 65 25 55Z" fill="#1E3A5F" />
          <path d="M75 52 Q88 62 78 74 Q70 65 71 55Z" fill="#1E3A5F" />
          <path d="M35 84 Q42 79 47 84 Q41 88 35 84ZM61 84 Q54 79 49 84 Q55 88 61 84Z" fill="#F59E0B" />
        </>
      );
    case "koala":
      return (
        <>
          <circle cx="24" cy="35" r="16" fill="#94A3B8" />
          <circle cx="72" cy="35" r="16" fill="#94A3B8" />
          <circle cx="24" cy="35" r="9" fill="#E2E8F0" />
          <circle cx="72" cy="35" r="9" fill="#E2E8F0" />
          <ellipse cx="48" cy="54" rx="29" ry="28" fill="#CBD5E1" />
          <ellipse cx="48" cy="55" rx="8" ry="12" fill="#475569" />
          <Eyes x1={32} x2={64} y={45} r={3.3} />
          <path d="M41 70 Q48 75 55 70" fill="none" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case "robot":
      return (
        <>
          <path d="M48 18 V9" stroke="#2563EB" strokeWidth="5" strokeLinecap="round" />
          <circle cx="48" cy="8" r="6" fill="#F59E0B" />
          <rect x="20" y="24" width="56" height="48" rx="15" fill="#60A5FA" />
          <rect x="27" y="32" width="42" height="28" rx="10" fill="#DBEAFE" />
          <circle cx="38" cy="45" r="5" fill="#1D4ED8" />
          <circle cx="58" cy="45" r="5" fill="#1D4ED8" />
          <path d="M40 64 H56" stroke="#1D4ED8" strokeWidth="4" strokeLinecap="round" />
          <rect x="12" y="40" width="8" height="18" rx="4" fill="#2563EB" />
          <rect x="76" y="40" width="8" height="18" rx="4" fill="#2563EB" />
          <rect x="36" y="74" width="24" height="8" rx="4" fill="#93C5FD" />
        </>
      );
    case "rocket":
      return (
        <>
          <path d="M48 7 C62 22 66 40 62 59 L34 59 C30 40 34 22 48 7Z" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" />
          <path d="M48 7 C55 15 59 24 61 34 L35 34 C37 24 41 15 48 7Z" fill="#E11D48" />
          <circle cx="48" cy="43" r="10" fill="#7DD3FC" stroke="#0284C7" strokeWidth="4" />
          <circle cx="45" cy="40" r="3" fill="#E0F2FE" />
          <path d="M34 50 Q20 58 19 72 L35 63Z" fill="#E11D48" />
          <path d="M62 50 Q76 58 77 72 L61 63Z" fill="#E11D48" />
          <path d="M40 62 Q48 84 56 62 Q52 72 48 72 Q44 72 40 62Z" fill="#F59E0B" />
          <path d="M44 64 Q48 76 52 64" fill="#FDE68A" />
          <circle cx="22" cy="24" r="2.5" fill="#F59E0B" />
          <circle cx="75" cy="20" r="2.5" fill="#0284C7" />
        </>
      );
    case "whale":
      return (
        <>
          <path d="M48 18 C43 10 36 10 34 15 C41 15 43 19 44 23 M48 18 C53 10 60 10 62 15 C55 15 53 19 52 23 M48 18 V26" fill="none" stroke="#0284C7" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M14 56 C18 37 34 27 52 28 C68 29 78 40 82 31 C87 43 83 52 77 56 C79 69 64 80 45 79 C27 78 11 70 14 56Z" fill="#38BDF8" />
          <path d="M22 64 C34 72 58 73 70 63 C65 74 54 79 44 78 C33 77 25 71 22 64Z" fill="#E0F2FE" />
          <Eyes x1={34} x2={48} y={50} r={3.4} />
          <path d="M31 61 Q40 66 49 61" fill="none" stroke="#075985" strokeWidth="3" strokeLinecap="round" />
          <path d="M57 58 Q66 62 63 70 Q55 67 57 58Z" fill="#0284C7" />
        </>
      );
    case "bee":
      return (
        <>
          <ellipse cx="29" cy="28" rx="15" ry="9" fill="#BAE6FD" opacity=".9" transform="rotate(-28 29 28)" />
          <ellipse cx="67" cy="28" rx="15" ry="9" fill="#BAE6FD" opacity=".9" transform="rotate(28 67 28)" />
          <path d="M39 22 Q34 11 27 11 M57 22 Q62 11 69 11" fill="none" stroke="#92400E" strokeWidth="3" strokeLinecap="round" />
          <circle cx="27" cy="11" r="4" fill="#92400E" />
          <circle cx="69" cy="11" r="4" fill="#92400E" />
          <ellipse cx="48" cy="55" rx="27" ry="30" fill="#FACC15" />
          <path d="M25 48 Q48 58 71 48 L72 59 Q48 69 24 59Z" fill="#451A03" />
          <path d="M29 69 Q48 77 67 69 Q63 79 48 83 Q33 79 29 69Z" fill="#451A03" />
          <Eyes y={39} r={3.5} />
          <Smile y={47} />
          <circle cx="31" cy="46" r="4" fill="#FDBA74" />
          <circle cx="65" cy="46" r="4" fill="#FDBA74" />
        </>
      );
    case "owl":
    default:
      return (
        <>
          <path d="M27 28 L35 13 L45 24 M69 28 L61 13 L51 24" fill="#087F6B" />
          <ellipse cx="48" cy="54" rx="30" ry="32" fill="#14B8A6" />
          <ellipse cx="48" cy="65" rx="18" ry="16" fill="#CCFBF1" />
          <circle cx="35" cy="43" r="12" fill="#fff" />
          <circle cx="61" cy="43" r="12" fill="#fff" />
          <Eyes x1={35} x2={61} y={44} r={5} />
          <path d="M43 54 Q48 50 53 54 Q50 61 48 61 Q46 61 43 54Z" fill="#F59E0B" />
          <path d="M21 49 Q10 58 18 70 Q27 62 27 51Z" fill="#0F766E" />
          <path d="M75 49 Q86 58 78 70 Q69 62 69 51Z" fill="#0F766E" />
          <path d="M39 66 Q43 70 47 66 M49 66 Q53 70 57 66 M44 73 Q48 77 52 73" fill="none" stroke="#0F766E" strokeWidth="2.4" strokeLinecap="round" />
        </>
      );
  }
}
