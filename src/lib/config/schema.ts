/**
 * EVALORA centralized configuration — the schema registry.
 *
 * This file IS the configuration schema. It is code, not data, on purpose:
 *
 *   • The dashboard can only ever write a value for a key declared here, of
 *     the declared kind, passing the declared validation. There is no path
 *     from a browser form to an arbitrary key, an arbitrary type, or
 *     executable content (see §17 of the Platform Control Center directive).
 *   • Every key declares `consumedBy` — the concrete application surfaces
 *     that read it. A setting is therefore never advertised as operational
 *     when nothing consumes it; the audit that produced this registry found
 *     two such dead settings (platform_settings.exam_pass_threshold and
 *     platform_settings.support_email) and both are repaired here.
 *   • `writableScopes` encodes the inheritance model: global default →
 *     organization override. A key that lists only "global" cannot be
 *     overridden by an organization, so an organization can never change
 *     platform-wide configuration.
 *
 * Pure module: no Next.js, no database, no React. Compiled standalone by
 * scripts/test-platform-config-architecture.mjs.
 */
import type { ConfigKeyDef, ConfigNamespace } from "./types";

/** Namespace metadata — the sections of the Platform Control Center. */
export const CONFIG_NAMESPACES: readonly {
  key: ConfigNamespace;
  label: string;
  description: string;
  /** Who may open this section. */
  audience: "super_admin" | "organization" | "both";
  order: number;
}[] = [
  {
    key: "branding",
    label: "Platform branding & theme",
    description:
      "Platform name, description, logos, favicon, brand colours and typography. Saved values are applied to the live interface through the design-token layer, not stored inertly.",
    audience: "super_admin",
    order: 10,
  },
  {
    key: "localization",
    label: "Language & region",
    description:
      "Which interface languages are offered, the platform default language and the default timezone. Interface language never alters examination content, which keeps its authored language.",
    audience: "super_admin",
    order: 20,
  },
  {
    key: "formatting",
    label: "Date, time & number formats",
    description:
      "How dates, times and numbers are presented across dashboards and reports.",
    audience: "both",
    order: 30,
  },
  {
    key: "platform_behavior",
    label: "Platform behaviour",
    description:
      "Maintenance mode, global announcements, the default landing page and open registration. These change what every visitor sees, so each requires confirmation before saving.",
    audience: "super_admin",
    order: 40,
  },
  {
    key: "assessment",
    label: "Assessment & marking defaults",
    description:
      "Platform-wide defaults for pass thresholds, negative marking, numerical tolerance and rounding. Organizations may override them where the key allows it.",
    audience: "both",
    order: 50,
  },
  {
    key: "examination",
    label: "Examination defaults",
    description:
      "Defaults applied when an examination or paper is created: duration, marks display, randomization, navigation and access codes. Existing examinations are never modified by a change here.",
    audience: "both",
    order: 60,
  },
  {
    key: "question_studio",
    label: "Question Studio",
    description:
      "Which question types authors may create, the difficulty vocabulary, numbering style and the default visual design tokens applied to newly designed questions.",
    audience: "both",
    order: 70,
  },
  {
    key: "proctoring",
    label: "Proctoring policy",
    description:
      "Default proctoring requirements and alert thresholds. Each setting states plainly what it does and whether its underlying integration is operational on this deployment.",
    audience: "both",
    order: 80,
  },
  {
    key: "notifications",
    label: "Notifications",
    description:
      "Delivery defaults for in-app notifications and the sender identity. Email delivery status is reported honestly for this deployment.",
    audience: "both",
    order: 90,
  },
  {
    key: "org_identity",
    label: "Organization identity",
    description:
      "This organization's own presentation: display name, contact address, accent colour and examination paper identity. Organization scope only — it can never change platform configuration.",
    audience: "organization",
    order: 100,
  },
];

/**
 * Interface languages the translation runtime actually ships a dictionary for
 * (src/lib/i18n/dictionaries). Offering a language with no dictionary would be
 * advertising a capability that does not exist, so the list is derived from
 * the dictionaries that are present.
 */
export const SUPPORTED_LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
] as const;

/**
 * Question types whose renderers are operational in this build. Mirrors
 * QUESTION_TYPES in src/lib/brand.ts — the registry test asserts the two
 * lists stay identical so the Control Center can never offer a type that the
 * examination renderer cannot draw.
 */
export const QUESTION_TYPE_OPTIONS = [
  { value: "single_choice", label: "Multiple choice (single answer)" },
  { value: "multiple_select", label: "Multiple select" },
  { value: "true_false", label: "True / False" },
  { value: "short_answer", label: "Short answer" },
  { value: "numeric", label: "Numerical answer" },
  { value: "ordering", label: "Ordering" },
  { value: "matching", label: "Matching" },
  { value: "poll", label: "Poll (no correct answer)" },
  { value: "open_ended", label: "Constructed response (manually marked)" },
  { value: "assess_parts", label: "Multi-part (typed answers)" },
  { value: "slide", label: "Presentation slide" },
] as const;

/** Fonts bundled with the application (@fontsource-variable). */
export const FONT_OPTIONS = [
  { value: "fraunces", label: "Fraunces (serif display) — bundled" },
  { value: "public_sans", label: "Public Sans (sans) — bundled" },
  { value: "georgia", label: "Georgia (system serif)" },
  { value: "system_sans", label: "System sans-serif" },
] as const;

export const THEME_OPTIONS = [
  { value: "light", label: "Light (cream paper)", hint: "The current EVALORA default." },
  { value: "contrast", label: "High contrast", hint: "Stronger borders and text weight for bright rooms and projectors." },
] as const;

export const DATE_FORMAT_OPTIONS = [
  { value: "dmy_short", label: "26 Nov 2026" },
  { value: "dmy_numeric", label: "26/11/2026" },
  { value: "mdy_numeric", label: "11/26/2026" },
  { value: "iso", label: "2026-11-26" },
  { value: "long", label: "Thursday, 26 November 2026" },
] as const;

export const TIME_FORMAT_OPTIONS = [
  { value: "24h", label: "14:30 (24-hour)" },
  { value: "12h", label: "2:30 pm (12-hour)" },
] as const;

export const NUMBER_FORMAT_OPTIONS = [
  { value: "en_gb", label: "1,234.56" },
  { value: "fr_fr", label: "1 234,56" },
  { value: "en_us", label: "1,234.56 (US)" },
] as const;

export const ROUNDING_OPTIONS = [
  { value: "none", label: "No rounding — keep exact values" },
  { value: "half_up_1", label: "Round half up to 1 decimal" },
  { value: "half_up_0", label: "Round half up to whole numbers" },
  { value: "bankers_1", label: "Banker's rounding to 1 decimal" },
] as const;

/**
 * Difficulty labels the question store can actually hold.
 *
 * `public.questions.difficulty` carries a CHECK constraint
 * (`questions_difficulty_check`, migration 0011) limiting values to these four,
 * and both save actions validate against the same list. An organization may
 * therefore choose WHICH of them its authors see — it may not invent a new label
 * from the dashboard, because the database would reject it. Widening the
 * vocabulary is a schema change and is recorded as such in the audit.
 */
export const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
  { value: "competition", label: "Competition" },
] as const;

export const NUMBERING_STYLE_OPTIONS = [
  { value: "arabic", label: "1, 2, 3" },
  { value: "arabic_bracket", label: "1), 2), 3)" },
  { value: "arabic_dot_paren", label: "1., 2., 3." },
  { value: "alpha_lower", label: "a, b, c" },
  { value: "roman_lower", label: "i, ii, iii" },
] as const;

export const CARD_LAYOUT_OPTIONS = [
  { value: "standard", label: "Standard card — bordered, padded" },
  { value: "plain", label: "Plain — no border or background" },
  { value: "panel", label: "Panel — tinted background, rounded" },
  { value: "outline_bold", label: "Bold outline — heavy border, high contrast" },
] as const;

export const OPTION_LAYOUT_OPTIONS = [
  { value: "vertical", label: "Vertical stack (one option per line)" },
  { value: "two_column", label: "Two columns on wide screens" },
  { value: "inline", label: "Inline flow (short options)" },
] as const;

export const IMAGE_POSITION_OPTIONS = [
  { value: "above", label: "Above the question text" },
  { value: "below", label: "Below the question text" },
  { value: "right", label: "Beside the text (wide screens)" },
] as const;

export const ANNOUNCEMENT_TONE_OPTIONS = [
  { value: "info", label: "Informational" },
  { value: "success", label: "Positive" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
] as const;

export const LANDING_PAGE_OPTIONS = [
  { value: "/dashboard", label: "Organization dashboard (default after sign-in)" },
  { value: "/admin", label: "Super Admin global dashboard" },
  { value: "/dashboard/exams", label: "Examinations" },
  { value: "/dashboard/questions", label: "Question Bank" },
  { value: "/dashboard/results", label: "Results Management & Candidate Links" },
  { value: "/student/results", label: "Student results" },
] as const;

export const REGISTRATION_MODE_OPTIONS = [
  { value: "open", label: "Open — anyone may register an organization", hint: "Current behaviour." },
  { value: "approval", label: "Registration requires Super Admin approval" },
  { value: "invite", label: "Invite only — public registration closed" },
] as const;

/** A time zone name the browser/Node Intl runtime can actually resolve. */
const COMMON_TIMEZONES = [
  "UTC",
  "Africa/Porto-Novo",
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Abidjan",
  "Africa/Dakar",
  "Africa/Douala",
  "Africa/Kinshasa",
  "Africa/Brazzaville",
  "Africa/Lome",
  "Africa/Ouagadougou",
  "Africa/Bamako",
  "Africa/Niamey",
  "Africa/Conakry",
  "Africa/Freetown",
  "Africa/Monrovia",
  "Africa/Casablanca",
  "Africa/Algiers",
  "Africa/Tunis",
  "Africa/Tripoli",
  "Africa/Cairo",
  "Africa/Nairobi",
  "Africa/Addis_Ababa",
  "Africa/Dar_es_Salaam",
  "Africa/Kampala",
  "Africa/Kigali",
  "Africa/Bujumbura",
  "Africa/Lusaka",
  "Africa/Harare",
  "Africa/Johannesburg",
  "Africa/Windhoek",
  "Africa/Maputo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Brussels",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Berlin",
  "Europe/Zurich",
  "Europe/Amsterdam",
  "Europe/Rome",
  "Europe/Istanbul",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Doha",
  "Asia/Kuwait",
  "Asia/Bahrain",
  "Asia/Muscat",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Colombo",
  "Asia/Kathmandu",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Jakarta",
  "Asia/Manila",
  "Asia/Ho_Chi_Minh",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Pacific/Auckland",
] as const;

export const TIMEZONE_OPTIONS = COMMON_TIMEZONES.map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }));

// ─────────────────────────────── the registry ──────────────────────────────

export const CONFIG_SCHEMA: readonly ConfigKeyDef[] = [
  // ══ BRANDING ══════════════════════════════════════════════════════════
  {
    namespace: "branding", key: "platform_name", group: "Identity",
    label: "Platform name",
    description: "The product name shown in the header, browser tab, emails and metadata. Changing it renames the platform everywhere the name is rendered.",
    kind: "string", writableScopes: ["global"], default: "EVALORA",
    maxLength: 40, placeholder: "EVALORA",
    consumedBy: ["src/app/layout.tsx (metadata)", "src/lib/brandConfig.ts", "src/components/Logo.tsx", "src/components/site/SiteChrome.tsx", "src/app/admin/AdminShell.tsx"],
    connectedModules: ["platform"], order: 1,
  },
  {
    namespace: "branding", key: "tagline", group: "Identity",
    label: "Tagline",
    description: "Short positioning line used in the browser tab title and on the public site.",
    kind: "string", writableScopes: ["global"],
    default: "Interactive quizzes, examinations & online proctoring",
    maxLength: 140,
    consumedBy: ["src/app/layout.tsx (metadata.title)", "src/lib/brandConfig.ts"],
    connectedModules: ["platform"], order: 2,
  },
  {
    namespace: "branding", key: "description", group: "Identity",
    label: "Platform description",
    description: "The sentence search engines and social previews show. Also used as the page meta description.",
    kind: "text", writableScopes: ["global"],
    default: "EVALORA is the integrated platform for interactive quizzes, academic assessments, examinations and live video proctoring — built for schools, universities, training centers and examination organizations.",
    maxLength: 400,
    consumedBy: ["src/app/layout.tsx (metadata.description, openGraph)", "src/lib/brandConfig.ts"],
    connectedModules: ["platform"], order: 3,
  },
  {
    namespace: "branding", key: "support_email", group: "Identity",
    label: "Public support email",
    description: "Contact address printed on the help, contact, privacy, terms and cookie pages and in the site footer. This replaces the previously hardcoded address and the inert platform_settings.support_email row.",
    kind: "email", writableScopes: ["global"], default: "support@evalora.app",
    maxLength: 160, placeholder: "support@example.org",
    consumedBy: ["src/app/contact/page.tsx", "src/app/privacy/page.tsx", "src/app/terms/page.tsx", "src/app/cookies/page.tsx", "src/components/site/SiteChrome.tsx"],
    connectedModules: ["platform"], order: 4,
  },
  {
    namespace: "branding", key: "logo_icon", group: "Logos",
    label: "Logo — square icon",
    description: "Square mark used in the header, the favicon fallback and PDF papers. Enter a path (/brand/…) or a full https URL.",
    kind: "image", writableScopes: ["global"], default: "/brand/evalora-icon.svg",
    maxLength: 400,
    consumedBy: ["src/components/Logo.tsx", "src/lib/brandConfig.ts"],
    connectedModules: ["platform"], order: 10,
  },
  {
    namespace: "branding", key: "logo_stacked", group: "Logos",
    label: "Logo — stacked",
    description: "Stacked lockup used where a taller mark fits better, such as the examination paper header.",
    kind: "image", writableScopes: ["global"], default: "/brand/evalora-logo.svg",
    maxLength: 400, consumedBy: ["src/lib/brandConfig.ts"], connectedModules: ["platform"], order: 11,
  },
  {
    namespace: "branding", key: "logo_horizontal_light", group: "Logos",
    label: "Logo — horizontal (for light backgrounds)",
    description: "Wide lockup with dark artwork, used on cream and white surfaces.",
    kind: "image", writableScopes: ["global"], default: "/brand/evalora-logo-light.svg",
    maxLength: 400, consumedBy: ["src/lib/brandConfig.ts"], connectedModules: ["platform"], order: 12,
  },
  {
    namespace: "branding", key: "logo_horizontal_dark", group: "Logos",
    label: "Logo — horizontal (for dark backgrounds)",
    description: "Wide lockup with light artwork, used on evergreen bands and the footer.",
    kind: "image", writableScopes: ["global"], default: "/brand/evalora-logo-dark.svg",
    maxLength: 400, consumedBy: ["src/lib/brandConfig.ts"], connectedModules: ["platform"], order: 13,
  },
  {
    namespace: "branding", key: "favicon", group: "Logos",
    label: "Favicon",
    description: "Browser tab icon. Applied through the root layout metadata, so a change is visible on every page after a refresh.",
    kind: "image", writableScopes: ["global"], default: "/brand/favicon.svg",
    maxLength: 400, consumedBy: ["src/app/layout.tsx (metadata.icons)"], connectedModules: ["platform"], order: 14,
  },
  {
    namespace: "branding", key: "color_primary", group: "Brand colours",
    label: "Primary colour",
    description: "The main brand colour. Applied to the evergreen design tokens, so buttons, links, headings and accents across every dashboard change together.",
    kind: "color", writableScopes: ["global"], default: "#0a5c36",
    consumedBy: ["src/app/layout.tsx (design-token CSS variables)", "src/app/globals.css @theme"],
    connectedModules: ["platform"], order: 20,
    help: "Contrast is checked against the cream canvas before saving; a colour that would fail WCAG AA for body text is rejected.",
  },
  {
    namespace: "branding", key: "color_primary_deep", group: "Brand colours",
    label: "Primary deep shade",
    description: "Darker variant of the primary colour used for headings, footers and hover states.",
    kind: "color", writableScopes: ["global"], default: "#06351f",
    consumedBy: ["src/app/layout.tsx (design-token CSS variables)"], connectedModules: ["platform"], order: 21,
  },
  {
    namespace: "branding", key: "color_accent", group: "Brand colours",
    label: "Accent colour",
    description: "The gold accent used for highlights, badges and call-to-action buttons.",
    kind: "color", writableScopes: ["global"], default: "#c9a227",
    consumedBy: ["src/app/layout.tsx (design-token CSS variables)"], connectedModules: ["platform"], order: 22,
  },
  {
    namespace: "branding", key: "color_cream", group: "Brand colours",
    label: "Canvas colour",
    description: "Page background behind cards. Keep it light: body text contrast is measured against it.",
    kind: "color", writableScopes: ["global"], default: "#f5f3ec",
    consumedBy: ["src/app/layout.tsx (design-token CSS variables)"], connectedModules: ["platform"], order: 23,
  },
  {
    namespace: "branding", key: "color_ink", group: "Brand colours",
    label: "Text colour",
    description: "Default body text colour. Must stay dark enough against the canvas colour to pass WCAG AA.",
    kind: "color", writableScopes: ["global"], default: "#16241c",
    consumedBy: ["src/app/layout.tsx (design-token CSS variables)"], connectedModules: ["platform"], order: 24,
  },
  {
    namespace: "branding", key: "font_display", group: "Typography",
    label: "Display font",
    description: "Serif/sans family used for page titles and headings. Only fonts the application actually bundles or the operating system provides can be selected.",
    kind: "enum", options: FONT_OPTIONS, writableScopes: ["global"], default: "fraunces",
    consumedBy: ["src/app/layout.tsx (--font-display CSS variable)"], connectedModules: ["platform"], order: 30,
  },
  {
    namespace: "branding", key: "font_sans", group: "Typography",
    label: "Body font",
    description: "Family used for all body text, tables and forms.",
    kind: "enum", options: FONT_OPTIONS, writableScopes: ["global"], default: "public_sans",
    consumedBy: ["src/app/layout.tsx (--font-sans CSS variable)"], connectedModules: ["platform"], order: 31,
  },
  {
    namespace: "branding", key: "default_theme", group: "Typography",
    label: "Default interface theme",
    description: "Applies a theme attribute to the document root. High contrast strengthens borders and text weight without changing the palette.",
    kind: "enum", options: THEME_OPTIONS, writableScopes: ["global"], default: "light",
    consumedBy: ["src/app/layout.tsx (html data-theme)", "src/app/globals.css [data-theme] rules"],
    connectedModules: ["platform"], order: 32,
  },

  // ══ LOCALIZATION ══════════════════════════════════════════════════════
  {
    namespace: "localization", key: "default_locale", group: "Language",
    label: "Default interface language",
    description: "Language used for a visitor who has not chosen one and for a new account with no stored preference. A user's own saved preference always wins.",
    kind: "enum", options: SUPPORTED_LOCALE_OPTIONS, writableScopes: ["global", "organization"], default: "en",
    consumedBy: ["src/lib/i18n/server.ts getRequestLocale()", "src/app/layout.tsx (html lang)"],
    connectedModules: ["platform", "org_settings"], order: 1,
    help: "Examination content is never translated by this setting — questions keep the language they were authored in.",
  },
  {
    namespace: "localization", key: "supported_locales", group: "Language",
    label: "Supported interface languages",
    description: "Which languages appear in the language switcher. A language with no bundled dictionary cannot be selected.",
    kind: "multi_enum", options: SUPPORTED_LOCALE_OPTIONS, writableScopes: ["global"],
    default: ["en", "fr", "es"],
    consumedBy: ["src/components/i18n/LanguageSwitcher.tsx", "src/lib/i18n/config.ts resolveLocale()"],
    connectedModules: ["platform"], order: 2,
  },
  {
    namespace: "localization", key: "default_timezone", group: "Region",
    label: "Default timezone",
    description: "Timezone used to display examination schedules, deadlines and report dates. Individual users still see their own device time inside a live examination so a candidate is never misled about remaining time.",
    kind: "timezone", options: TIMEZONE_OPTIONS, writableScopes: ["global", "organization"],
    default: "Africa/Porto-Novo",
    consumedBy: ["src/lib/formatting.ts", "src/lib/config/resolve.ts"],
    connectedModules: ["platform", "org_settings", "examinations"], order: 10,
  },

  // ══ FORMATTING ════════════════════════════════════════════════════════
  {
    namespace: "formatting", key: "date_format", group: "Presentation",
    label: "Date format",
    description: "How dates are written across dashboards, reports and exports.",
    kind: "enum", options: DATE_FORMAT_OPTIONS, writableScopes: ["global", "organization"], default: "dmy_short",
    consumedBy: ["src/lib/formatting.ts fmtDate/fmtDateTime"], connectedModules: ["platform", "org_settings"], order: 1,
  },
  {
    namespace: "formatting", key: "time_format", group: "Presentation",
    label: "Time format",
    description: "12-hour or 24-hour clock for schedule and deadline display.",
    kind: "enum", options: TIME_FORMAT_OPTIONS, writableScopes: ["global", "organization"], default: "24h",
    consumedBy: ["src/lib/formatting.ts fmtDateTime/fmtTime"], connectedModules: ["platform", "org_settings"], order: 2,
  },
  {
    namespace: "formatting", key: "number_format", group: "Presentation",
    label: "Number format",
    description: "Thousands and decimal separators used for marks, averages and statistics.",
    kind: "enum", options: NUMBER_FORMAT_OPTIONS, writableScopes: ["global", "organization"], default: "en_gb",
    consumedBy: ["src/lib/formatting.ts fmtNumber/fmtPercent"], connectedModules: ["platform", "org_settings"], order: 3,
  },
  {
    namespace: "formatting", key: "default_academic_year", group: "Academic",
    label: "Default academic year",
    description: "Value offered as the academic year when a new paper, class or report is created and none is specified. Existing records are not changed.",
    kind: "string", writableScopes: ["global", "organization"], default: "2026-2027",
    maxLength: 20, placeholder: "2026-2027",
    consumedBy: ["src/lib/formatting.ts", "src/app/dashboard/paper-builder/new/page.tsx"],
    connectedModules: ["academics", "paper_builder"], order: 10,
  },

  // ══ PLATFORM BEHAVIOUR ════════════════════════════════════════════════
  {
    namespace: "platform_behavior", key: "maintenance_mode", group: "Availability",
    label: "Maintenance mode",
    description: "When on, visitors see a maintenance notice instead of the application. Verified Super Admins are always let through so the platform can never be locked out, and in-flight candidate examination routes stay open so nobody loses an attempt.",
    kind: "boolean", writableScopes: ["global"], default: false,
    sensitivity: "operational",
    consumedBy: ["src/middleware.ts maintenance gate", "src/app/maintenance/page.tsx"],
    connectedModules: ["platform"], order: 1,
    help: "Turning this on is immediate and platform-wide. Confirm before saving.",
  },
  {
    namespace: "platform_behavior", key: "maintenance_message", group: "Availability",
    label: "Maintenance message",
    description: "Text shown on the maintenance notice. Plain text only — markup is escaped.",
    kind: "text", writableScopes: ["global"],
    default: "EVALORA is undergoing scheduled maintenance. Service will resume shortly.",
    maxLength: 600, consumedBy: ["src/app/maintenance/page.tsx"],
    connectedModules: ["platform"], order: 2,
  },
  {
    namespace: "platform_behavior", key: "global_announcements", group: "Announcements",
    label: "Global announcements",
    description: "Banner messages shown at the top of every page. Each entry can be scheduled with a start and end time and switched off without deleting it.",
    kind: "announcement_list", writableScopes: ["global"], default: [],
    sensitivity: "operational",
    consumedBy: ["src/app/layout.tsx AnnouncementBanner", "src/components/platform/AnnouncementBanner.tsx"],
    connectedModules: ["platform"], order: 10,
  },
  {
    namespace: "platform_behavior", key: "default_landing_page", group: "Navigation",
    label: "Default landing page",
    description: "Where a user is taken after sign-in when their role has no more specific destination. Role routing rules still take precedence.",
    kind: "enum", options: LANDING_PAGE_OPTIONS, writableScopes: ["global"], default: "/dashboard",
    consumedBy: ["src/lib/roleRouting.ts", "src/app/auth/resolve"], connectedModules: ["platform"], order: 20,
  },
  {
    namespace: "platform_behavior", key: "registration_mode", group: "Access",
    label: "Public registration",
    description: "Controls whether visitors may create an organization account without an invitation.",
    kind: "enum", options: REGISTRATION_MODE_OPTIONS, writableScopes: ["global"], default: "open",
    sensitivity: "operational",
    consumedBy: ["src/app/register/page.tsx", "src/lib/accountCreationPolicy.ts"],
    connectedModules: ["platform"], order: 30,
  },

  // ══ ASSESSMENT ════════════════════════════════════════════════════════
  {
    namespace: "assessment", key: "default_pass_percent", group: "Marking",
    label: "Default pass threshold (%)",
    description:
      "Percentage of total marks that counts as a pass when an examination does not define its own. Repairs the previously inert platform_settings.exam_pass_threshold: this value is now read by the results summary.",
    kind: "integer", writableScopes: ["global", "organization"], default: 50,
    min: 0, max: 100,
    consumedBy: ["src/lib/examFeedback.ts resultSummary()", "src/lib/assessmentConfig.ts"],
    connectedModules: ["exam_results", "exam_validation"], order: 1,
  },
  {
    namespace: "assessment", key: "negative_marking_enabled", group: "Marking",
    label: "Allow negative marking",
    description: "Whether examination authors may deduct marks for incorrect answers. Turning this off does not change any paper already built.",
    kind: "boolean", writableScopes: ["global", "organization"], default: false,
    consumedBy: ["src/lib/assessmentConfig.ts", "src/app/dashboard/paper-builder"],
    connectedModules: ["paper_builder", "examinations"], order: 2,
  },
  {
    namespace: "assessment", key: "negative_marking_penalty", group: "Marking",
    label: "Default negative marking penalty",
    description: "Fraction of the question's marks deducted for a wrong answer when negative marking is used (0.25 = one quarter).",
    kind: "number", writableScopes: ["global", "organization"], default: 0.25,
    min: 0, max: 1, step: 0.05,
    consumedBy: ["src/lib/assessmentConfig.ts"], connectedModules: ["paper_builder"], order: 3,
  },
  {
    namespace: "assessment", key: "numeric_tolerance_percent", group: "Marking",
    label: "Default numerical tolerance (%)",
    description: "Accepted deviation for numerical answers that do not specify their own tolerance. Zero means an exact match is required.",
    kind: "number", writableScopes: ["global", "organization"], default: 0,
    min: 0, max: 10, step: 0.1,
    consumedBy: ["src/lib/assessmentConfig.ts", "src/lib/scoring.ts"],
    connectedModules: ["exam_results", "question_bank"], order: 10,
  },
  {
    namespace: "assessment", key: "rounding_rule", group: "Marking",
    label: "Rounding rule for computed marks",
    description: "How fractional marks are rounded when a total or an average is computed. Applied at presentation and at grade conversion — never to a stored raw mark.",
    kind: "enum", options: ROUNDING_OPTIONS, writableScopes: ["global", "organization"], default: "half_up_1",
    consumedBy: ["src/lib/assessmentConfig.ts", "src/lib/formatting.ts"],
    connectedModules: ["exam_results", "exam_reports"], order: 11,
  },
  {
    namespace: "assessment", key: "result_link_default_days", group: "Results",
    label: "Candidate result link lifetime (days)",
    description: "Default validity window for an individual candidate result link. Links remain scoped to one candidate and reveal only that candidate's published results.",
    kind: "integer", writableScopes: ["global", "organization"], default: 30,
    min: 1, max: 730,
    consumedBy: ["src/lib/examLink.ts", "src/lib/examLinkServer.ts"],
    connectedModules: ["exam_candidate_links", "exam_results"], order: 20,
  },
  {
    namespace: "assessment", key: "require_validation_before_publication", group: "Results",
    label: "Require explicit validation before publication",
    description:
      "Keeps the mandatory validate → publish workflow. This is locked ON: results are never published automatically because a configuration changed, and no setting in the Control Center can publish a result.",
    kind: "boolean", writableScopes: ["global"], default: true,
    sensitivity: "operational",
    consumedBy: ["src/app/dashboard/exams/actions.ts", "src/lib/resultLifecycle.ts"],
    connectedModules: ["exam_validation", "exam_publication"], order: 30,
    help: "Read-only. Publication always stays an explicit, authorized, audited action.",
  },

  // ══ EXAMINATION ═══════════════════════════════════════════════════════
  {
    namespace: "examination", key: "default_duration_minutes", group: "Paper defaults",
    label: "Default examination duration (minutes)",
    description: "Duration pre-filled when a new examination is created. Existing examinations keep their own duration.",
    kind: "integer", writableScopes: ["global", "organization"], default: 90,
    min: 5, max: 600,
    consumedBy: ["src/lib/assessmentConfig.ts resolveExamDefaults()", "src/app/dashboard/exams"],
    connectedModules: ["examinations", "paper_builder"], order: 1,
  },
  {
    namespace: "examination", key: "default_show_marks", group: "Paper defaults",
    label: "Show marks per question on the paper",
    description: "Whether the marks available are printed beside each question by default.",
    kind: "boolean", writableScopes: ["global", "organization"], default: true,
    consumedBy: ["src/lib/assessmentConfig.ts resolveExamDefaults()", "src/lib/candidatePaper.ts"],
    connectedModules: ["paper_builder", "examinations"], order: 2,
  },
  {
    namespace: "examination", key: "default_randomize_questions", group: "Paper defaults",
    label: "Randomize question order by default",
    description: "Pre-selects question randomization for new papers. Attempts snapshot their own order, so changing this never reorders a paper a candidate has already sat.",
    kind: "boolean", writableScopes: ["global", "organization"], default: false,
    consumedBy: ["src/lib/assessmentConfig.ts resolveExamDefaults()"], connectedModules: ["paper_builder"], order: 3,
  },
  {
    namespace: "examination", key: "default_randomize_options", group: "Paper defaults",
    label: "Randomize answer options by default",
    description: "Pre-selects option randomization for new papers.",
    kind: "boolean", writableScopes: ["global", "organization"], default: false,
    consumedBy: ["src/lib/assessmentConfig.ts resolveExamDefaults()"], connectedModules: ["paper_builder"], order: 4,
  },
  {
    namespace: "examination", key: "default_allow_backward_navigation", group: "Candidate experience",
    label: "Allow candidates to navigate back",
    description: "Whether a candidate may return to a previous question. Existing examinations keep the setting they were created with.",
    kind: "boolean", writableScopes: ["global", "organization"], default: true,
    consumedBy: ["src/lib/assessmentConfig.ts resolveExamDefaults()", "src/app/take-exam"],
    connectedModules: ["examinations"], order: 10,
  },
  {
    namespace: "examination", key: "default_access_code_required", group: "Candidate experience",
    label: "Require an access code by default",
    description: "Pre-selects the access-code requirement for new examinations.",
    kind: "boolean", writableScopes: ["global", "organization"], default: true,
    consumedBy: ["src/lib/assessmentConfig.ts resolveExamDefaults()"], connectedModules: ["examinations", "exam_share_codes"], order: 11,
  },
  {
    namespace: "examination", key: "default_instructions", group: "Paper defaults",
    label: "Default candidate instructions",
    description: "Instruction text pre-filled on a new examination. Authors can edit or clear it per examination; existing examinations are untouched.",
    kind: "text", writableScopes: ["global", "organization"],
    default: "Answer every question. Marks available are shown beside each question. Submit before the time expires.",
    maxLength: 2000,
    consumedBy: ["src/lib/assessmentConfig.ts resolveExamDefaults()"], connectedModules: ["examinations", "paper_builder"], order: 12,
  },

  // ══ QUESTION STUDIO ═══════════════════════════════════════════════════
  {
    namespace: "question_studio", key: "enabled_question_types", group: "Authoring",
    label: "Question types authors may create",
    description:
      "Which question types appear in the Question Studio type picker. Every type listed here has an operational renderer in the examination engine; a type removed from this list stays fully functional in questions already created.",
    kind: "multi_enum", options: QUESTION_TYPE_OPTIONS,
    writableScopes: ["global", "organization"],
    default: QUESTION_TYPE_OPTIONS.map((t) => t.value),
    consumedBy: ["src/components/QuestionForm.tsx", "src/lib/questionStudio.ts"],
    connectedModules: ["question_bank", "paper_builder"], order: 1,
    help: "Types not in this list are hidden from the picker, never from stored content — no existing question can be orphaned by this setting.",
  },
  {
    namespace: "question_studio", key: "difficulty_levels", group: "Authoring",
    label: "Difficulty labels offered to authors",
    description:
      "Which difficulty labels the question editor offers. The question store only accepts Easy, Medium, Hard and Competition (a database constraint), so this setting selects from those four rather than inventing new labels. Existing questions keep whatever label they already carry, and narrowing this list never changes a saved question.",
    kind: "multi_enum", options: DIFFICULTY_OPTIONS,
    writableScopes: ["global", "organization"],
    default: ["easy", "medium", "hard"],
    consumedBy: [
      "src/lib/questionStudio.ts resolveQuestionStudioConfig() → difficultyLevels",
      "src/lib/questionStudioClient.ts normalizeDifficulty()",
      "src/components/QuestionForm.tsx (the difficulty picker)",
      "src/app/admin/questions/types/page.tsx (reports the configured vocabulary)",
    ],
    connectedModules: ["question_bank"], order: 2,
    help: "Adding Competition exposes the label used by competition rounds. Removing a label hides it from new questions only.",
  },
  {
    namespace: "question_studio", key: "numbering_style", group: "Design",
    label: "Question numbering style",
    description: "How questions are numbered on the rendered paper and on the candidate screen.",
    kind: "enum", options: NUMBERING_STYLE_OPTIONS, writableScopes: ["global", "organization"], default: "arabic",
    consumedBy: [
      "src/lib/questionStudio.ts resolveQuestionStudioConfig() → design default for new questions",
      "src/components/QuestionForm.tsx (seeds config.design, saved with the question)",
      "src/components/QuestionDesignPanel.tsx (the author can change it per question)",
      "src/lib/questionTemplates.ts (a template snapshots these tokens into every question started from it)",
      "src/lib/candidatePaper.ts (prints the saved numbering style on the candidate paper)",
      "src/lib/questionDesign.ts formatQuestionNumber()",
    ],
    connectedModules: ["question_bank", "paper_builder", "exam_printable"], order: 10,
  },
  {
    namespace: "question_studio", key: "design_card_layout", group: "Design",
    label: "Question card layout",
    description: "Container treatment applied to newly designed questions: border, background and padding. Already published papers keep the design they were authored with.",
    kind: "enum", options: CARD_LAYOUT_OPTIONS, writableScopes: ["global", "organization"], default: "standard",
    consumedBy: [
      "src/lib/questionStudio.ts designFromConfig() → default design for new questions",
      "src/components/QuestionForm.tsx (seeds config.design, stored with the question)",
      "src/components/QuestionDesignPanel.tsx (per-question designer and live preview)",
      "src/lib/questionTemplates.ts (a template snapshots these tokens into every question started from it)",
      "src/lib/questionDesign.ts normalizeQuestionDesign() / designCssVariables()",
    ], connectedModules: ["question_bank", "paper_builder"], order: 11,
  },
  {
    namespace: "question_studio", key: "design_corner_radius", group: "Design",
    label: "Corner radius (px)",
    description: "Rounding applied to question cards and answer option boxes.",
    kind: "integer", writableScopes: ["global", "organization"], default: 12,
    min: 0, max: 32, consumedBy: [
      "src/lib/questionStudio.ts designFromConfig() → default design for new questions",
      "src/components/QuestionForm.tsx (seeds config.design, stored with the question)",
      "src/components/QuestionDesignPanel.tsx (per-question designer and live preview)",
      "src/lib/questionTemplates.ts (a template snapshots these tokens into every question started from it)",
      "src/lib/questionDesign.ts normalizeQuestionDesign() / designCssVariables()",
    ], connectedModules: ["question_bank"], order: 12,
  },
  {
    namespace: "question_studio", key: "design_spacing", group: "Design",
    label: "Spacing scale (px)",
    description: "Base gap used between the question text, media, answer area and options.",
    kind: "integer", writableScopes: ["global", "organization"], default: 16,
    min: 4, max: 48, consumedBy: [
      "src/lib/questionStudio.ts designFromConfig() → default design for new questions",
      "src/components/QuestionForm.tsx (seeds config.design, stored with the question)",
      "src/components/QuestionDesignPanel.tsx (per-question designer and live preview)",
      "src/lib/questionTemplates.ts (a template snapshots these tokens into every question started from it)",
      "src/lib/questionDesign.ts normalizeQuestionDesign() / designCssVariables()",
    ], connectedModules: ["question_bank"], order: 13,
  },
  {
    namespace: "question_studio", key: "design_padding", group: "Design",
    label: "Card padding (px)",
    description: "Inner padding of the question card.",
    kind: "integer", writableScopes: ["global", "organization"], default: 20,
    min: 0, max: 64, consumedBy: [
      "src/lib/questionStudio.ts designFromConfig() → default design for new questions",
      "src/components/QuestionForm.tsx (seeds config.design, stored with the question)",
      "src/components/QuestionDesignPanel.tsx (per-question designer and live preview)",
      "src/lib/questionTemplates.ts (a template snapshots these tokens into every question started from it)",
      "src/lib/questionDesign.ts normalizeQuestionDesign() / designCssVariables()",
    ], connectedModules: ["question_bank"], order: 14,
  },
  {
    namespace: "question_studio", key: "design_option_layout", group: "Design",
    label: "Answer option layout",
    description: "How answer options are arranged beneath a choice question.",
    kind: "enum", options: OPTION_LAYOUT_OPTIONS, writableScopes: ["global", "organization"], default: "vertical",
    consumedBy: [
      "src/lib/questionStudio.ts designFromConfig() → default design for new questions",
      "src/components/QuestionForm.tsx (seeds config.design, stored with the question)",
      "src/components/QuestionDesignPanel.tsx (per-question designer and live preview)",
      "src/lib/questionTemplates.ts (a template snapshots these tokens into every question started from it)",
      "src/lib/questionDesign.ts normalizeQuestionDesign() / designCssVariables()",
    ], connectedModules: ["question_bank"], order: 15,
  },
  {
    namespace: "question_studio", key: "design_image_position", group: "Design",
    label: "Image position",
    description: "Where an attached image, diagram or figure is placed relative to the question text.",
    kind: "enum", options: IMAGE_POSITION_OPTIONS, writableScopes: ["global", "organization"], default: "above",
    consumedBy: [
      "src/lib/questionStudio.ts designFromConfig() → default design for new questions",
      "src/components/QuestionForm.tsx (seeds config.design, stored with the question)",
      "src/components/QuestionDesignPanel.tsx (per-question designer and live preview)",
      "src/lib/questionTemplates.ts (a template snapshots these tokens into every question started from it)",
      "src/lib/questionDesign.ts normalizeQuestionDesign() / designCssVariables()",
    ], connectedModules: ["question_bank"], order: 16,
  },
  {
    namespace: "question_studio", key: "design_image_max_width_percent", group: "Design",
    label: "Image maximum width (%)",
    description: "Largest width an image may occupy inside the question card, as a percentage of the card.",
    kind: "integer", writableScopes: ["global", "organization"], default: 100,
    min: 20, max: 100, consumedBy: [
      "src/lib/questionStudio.ts designFromConfig() → default design for new questions",
      "src/components/QuestionForm.tsx (seeds config.design, stored with the question)",
      "src/components/QuestionDesignPanel.tsx (per-question designer and live preview)",
      "src/lib/questionTemplates.ts (a template snapshots these tokens into every question started from it)",
      "src/lib/questionDesign.ts normalizeQuestionDesign() / designCssVariables()",
    ], connectedModules: ["question_bank"], order: 17,
  },
  {
    namespace: "question_studio", key: "design_font_size_px", group: "Design",
    label: "Question text size (px)",
    description: "Base font size for question text on the candidate screen. Print/PDF keeps its own typographic scale.",
    kind: "integer", writableScopes: ["global", "organization"], default: 16,
    min: 12, max: 24, consumedBy: [
      "src/lib/questionStudio.ts designFromConfig() → default design for new questions",
      "src/components/QuestionForm.tsx (seeds config.design, stored with the question)",
      "src/components/QuestionDesignPanel.tsx (per-question designer and live preview)",
      "src/lib/questionTemplates.ts (a template snapshots these tokens into every question started from it)",
      "src/lib/questionDesign.ts normalizeQuestionDesign() / designCssVariables()",
    ], connectedModules: ["question_bank"], order: 18,
  },

  // ══ PROCTORING ════════════════════════════════════════════════════════
  {
    namespace: "proctoring", key: "require_camera_check", group: "Device checks",
    label: "Ask candidates for camera permission",
    description: "When on, the admission screen asks the candidate's browser for camera access and reports whether it is available. Nothing is recorded or uploaded: the stream is closed immediately. A check that could not be completed leaves one low-severity incident for review and the candidate must acknowledge it before starting.",
    kind: "boolean", writableScopes: ["global", "organization"], default: true,
    consumedBy: [
      "src/lib/proctoringConfig.ts resolveProctoringConfig()",
      "src/lib/deviceCheck.ts probeMediaDevice('video')",
      "src/components/exam/DeviceCheckPanel.tsx",
      "src/app/exam/join/[token]/page.tsx (pre-admission)",
      "src/app/exam-access/page.tsx (pre-admission when the code is in the URL)",
      "src/app/api/exam/device-check/route.ts (GET requirements, POST outcome)",
    ],
    connectedModules: ["proctoring", "exam_monitoring"], order: 1,
  },
  {
    namespace: "proctoring", key: "require_microphone_check", group: "Device checks",
    label: "Ask candidates for microphone permission",
    description: "When on, the admission screen asks for microphone access to confirm it works, then closes the stream. Audio is never captured. Off by default: only switch it on where an oral component or a live invigilation room genuinely needs it.",
    kind: "boolean", writableScopes: ["global", "organization"], default: false,
    consumedBy: [
      "src/lib/proctoringConfig.ts resolveProctoringConfig()",
      "src/lib/deviceCheck.ts probeMediaDevice('audio')",
      "src/components/exam/DeviceCheckPanel.tsx",
      "src/app/api/exam/device-check/route.ts",
    ],
    connectedModules: ["proctoring"], order: 2,
  },
  {
    namespace: "proctoring", key: "require_browser_check", group: "Device checks",
    label: "Run browser and device checks",
    description: "Checks at admission that the page is served securely, that the device is online and that the screen is large enough to display the paper, and reports the browser family and screen size to the candidate. An unsupported environment raises one low-severity incident; nothing else about the device is stored.",
    kind: "boolean", writableScopes: ["global", "organization"], default: true,
    consumedBy: [
      "src/lib/proctoringConfig.ts resolveProctoringConfig()",
      "src/lib/deviceCheck.ts collectBrowserInfo()",
      "src/components/exam/DeviceCheckPanel.tsx",
      "src/app/api/exam/device-check/route.ts",
    ], connectedModules: ["proctoring"], order: 3,
  },
  {
    namespace: "proctoring", key: "max_tab_switch_warnings", group: "Monitoring",
    label: "Tab-switch warnings before an incident",
    description: "How many times a candidate may leave the examination tab before an incident is raised for review.",
    kind: "integer", writableScopes: ["global", "organization"], default: 3,
    min: 1, max: 20,
    consumedBy: ["src/lib/proctoringConfig.ts", "src/lib/integrityMonitor.ts"],
    connectedModules: ["proctoring", "exam_monitoring"], order: 10,
  },
  {
    namespace: "proctoring", key: "incident_alert_threshold", group: "Monitoring",
    label: "Incident count that alerts a supervisor",
    description: "Number of open incidents on one attempt at which the supervising staff member is notified.",
    kind: "integer", writableScopes: ["global", "organization"], default: 3,
    min: 1, max: 50,
    consumedBy: ["src/lib/proctoringConfig.ts"], connectedModules: ["proctoring"], order: 11,
  },
  {
    namespace: "proctoring", key: "evidence_review_required", group: "Evidence",
    label: "Require a documented review before an incident is closed",
    description: "An incident can only be dismissed after a reviewer records a decision and a reason.",
    kind: "boolean", writableScopes: ["global", "organization"], default: true,
    sensitivity: "operational",
    consumedBy: ["src/lib/proctoringConfig.ts", "src/lib/proctoring.ts"],
    connectedModules: ["proctoring"], order: 20,
  },
  {
    namespace: "proctoring", key: "continuous_recording_enabled", group: "Evidence",
    label: "Continuous audio/video recording",
    description:
      "NOT OPERATIONAL on this deployment as a platform-wide default. Continuous recording requires the LiveKit media pipeline to be provisioned for the organization and explicit candidate consent; until then this setting is reported as unavailable rather than silently ignored. Per-organization live proctoring rooms continue to work where LiveKit credentials are configured.",
    kind: "boolean", writableScopes: ["global"], default: false,
    sensitivity: "operational",
    consumedBy: ["src/lib/proctoringConfig.ts (reported, not enforced)"],
    connectedModules: ["proctoring"], order: 30,
    help: "Left off and clearly marked unavailable. Do not present this as an active control.",
  },

  // ══ NOTIFICATIONS ═════════════════════════════════════════════════════
  {
    namespace: "notifications", key: "in_app_enabled", group: "Delivery",
    label: "In-app notifications",
    description: "Master switch for the notification bell and the notifications page. Operational: notifications are written to the notifications table and delivered through the existing bell.",
    kind: "boolean", writableScopes: ["global", "organization"], default: true,
    consumedBy: ["src/lib/notificationService.ts", "src/components/dashboard/NotificationBell.tsx"],
    connectedModules: ["platform"], order: 1,
  },
  {
    namespace: "notifications", key: "sender_name", group: "Delivery",
    label: "Sender display name",
    description: "Name shown as the sender on generated notifications and, once an email provider is connected, on outgoing mail.",
    kind: "string", writableScopes: ["global", "organization"], default: "EVALORA",
    maxLength: 80, consumedBy: ["src/lib/notificationService.ts"], connectedModules: ["platform"], order: 2,
  },
  {
    namespace: "notifications", key: "email_delivery_available", group: "Delivery",
    label: "Email delivery",
    description:
      "REPORTED STATUS, NOT A SWITCH. This deployment sends mail only through Supabase Auth (account invitations and password resets, configured in Supabase). No general-purpose email provider is connected, so application-composed notification emails cannot be delivered yet. Email templates can be authored and previewed; delivery requires a provider integration, which is code-level work.",
    kind: "boolean", writableScopes: [], default: false,
    consumedBy: ["src/lib/notificationService.ts (capability report only)"],
    connectedModules: ["platform"], order: 10,
    help: "Read-only and honest: nothing in the Control Center can enable email delivery until a provider is integrated.",
  },

  // ══ ORGANIZATION IDENTITY (organization scope only) ═══════════════════
  {
    namespace: "org_identity", key: "display_name", group: "Identity",
    label: "Organization display name",
    description: "Name used on examination papers, certificates, reports and the organization's portal. Falls back to the registered organization name.",
    kind: "string", writableScopes: ["organization"], default: null,
    maxLength: 160,
    consumedBy: ["src/lib/examPaper.ts resolveExamPaperHeader()", "src/lib/orgIdentity.ts"],
    connectedModules: ["org_settings", "exam_printable"], order: 1,
  },
  {
    namespace: "org_identity", key: "contact_email", group: "Identity",
    label: "Organization contact email",
    description: "Address shown to candidates on examination papers and result pages for questions about this organization's assessments.",
    kind: "email", writableScopes: ["organization"], default: null,
    maxLength: 160, consumedBy: ["src/lib/orgIdentity.ts"], connectedModules: ["org_settings"], order: 2,
  },
  {
    namespace: "org_identity", key: "accent_color", group: "Branding",
    label: "Organization accent colour",
    description: "Accent used on this organization's portal and examination paper header. Does not change the platform palette.",
    kind: "color", writableScopes: ["organization"], default: null,
    consumedBy: ["src/lib/orgIdentity.ts", "src/app/portal/[slug]"], connectedModules: ["org_settings"], order: 10,
  },
  {
    namespace: "org_identity", key: "paper_show_logo", group: "Examination paper",
    label: "Show the organization logo on examination papers",
    description: "Default for new paper templates. Existing templates keep their own choice.",
    kind: "boolean", writableScopes: ["organization"], default: true,
    consumedBy: ["src/lib/examPaper.ts", "src/lib/orgIdentity.ts"],
    connectedModules: ["exam_printable", "paper_builder"], order: 20,
  },
  {
    namespace: "org_identity", key: "paper_footer", group: "Examination paper",
    label: "Examination paper footer text",
    description: "Line printed in the footer of this organization's examination papers, for example a confidentiality notice.",
    kind: "text", writableScopes: ["organization"], default: null,
    maxLength: 300, consumedBy: ["src/lib/orgIdentity.ts"], connectedModules: ["exam_printable"], order: 21,
  },
];

// ─────────────────────────────── lookups ───────────────────────────────────

const BY_ID = new Map<string, ConfigKeyDef>(
  CONFIG_SCHEMA.map((def) => [`${def.namespace}.${def.key}`, def]),
);

/** Stable identifier for a setting: "<namespace>.<key>". */
export function configId(namespace: string, key: string): string {
  return `${namespace}.${key}`;
}

/** Look up one declared setting. Returns undefined for anything not declared. */
export function getConfigDef(namespace: string, key: string): ConfigKeyDef | undefined {
  return BY_ID.get(configId(namespace, key));
}

/** True when a namespace/key pair exists in the registry. */
export function isKnownConfig(namespace: string, key: string): boolean {
  return BY_ID.has(configId(namespace, key));
}

/** All settings in one namespace, ordered for display. */
export function configsInNamespace(namespace: ConfigNamespace): ConfigKeyDef[] {
  return CONFIG_SCHEMA.filter((d) => d.namespace === namespace).sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.key.localeCompare(b.key),
  );
}

/** All namespaces that contain at least one setting. */
export function usedNamespaces(): ConfigNamespace[] {
  const seen = new Set<ConfigNamespace>();
  for (const d of CONFIG_SCHEMA) seen.add(d.namespace);
  return CONFIG_NAMESPACES.filter((n) => seen.has(n.key))
    .sort((a, b) => a.order - b.order)
    .map((n) => n.key);
}

/** Distinct UI groups inside a namespace, in first-appearance order. */
export function groupsInNamespace(namespace: ConfigNamespace): string[] {
  const out: string[] = [];
  for (const d of configsInNamespace(namespace)) {
    if (!out.includes(d.group)) out.push(d.group);
  }
  return out;
}

/**
 * Settings an organization may write. A key that does not list
 * "organization" in writableScopes is structurally out of reach for a tenant:
 * the server action rejects the write before it touches the database.
 */
export function organizationWritableConfigs(): ConfigKeyDef[] {
  return CONFIG_SCHEMA.filter((d) => d.writableScopes.includes("organization"));
}

/** Settings only Super Admin may write. */
export function globalOnlyConfigs(): ConfigKeyDef[] {
  return CONFIG_SCHEMA.filter((d) => d.writableScopes.includes("global"));
}

/** Read-only settings (no writable scope) — reported honestly, never editable. */
export function readOnlyConfigs(): ConfigKeyDef[] {
  return CONFIG_SCHEMA.filter((d) => d.writableScopes.length === 0);
}

/**
 * Every distinct search token for the Control Center's global search:
 * namespace, key, label, description and each connected module.
 */
export function searchIndex(): { id: string; namespace: string; key: string; label: string; haystack: string }[] {
  return CONFIG_SCHEMA.map((d) => ({
    id: configId(d.namespace, d.key),
    namespace: d.namespace,
    key: d.key,
    label: d.label,
    haystack: [d.namespace, d.key, d.label, d.description, d.group, ...(d.connectedModules ?? [])]
      .join(" ")
      .toLowerCase(),
  }));
}
