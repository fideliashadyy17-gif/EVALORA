/**
 * IB MYP assessment reference library — ALL eight subject groups.
 *
 * Provenance rules (the brief's hard requirement):
 *  • Criterion layer (A–D codes, titles, descriptions): taken from the
 *    publicly published IB MYP subject briefs — the same wording already
 *    shipped in MYP_CRITERION_PRESETS (src/lib/myp.ts) with per-group source
 *    lines. `provenance: "official-subject-brief"`.
 *  • Strand layer (A(i)… D(iii)): the strand CODES and short titles follow
 *    the structure of the IB MYP subject guides; the one-line descriptions
 *    are CONCISE SUMMARIES written for browsing — they are explicitly
 *    NOT presented as verbatim official descriptors. The full official
 *    strand wording lives in the copyrighted IB Store subject guides, which
 *    are not publicly accessible; that gap is recorded in
 *    MYP_REFERENCE_GAPS instead of being fabricated.
 *  • Achievement levels (0–8) and assessment rules: per-subject configured
 *    data (myp_criteria.max_level, myp_level_boundaries) — never hardcoded
 *    here as if universal.
 *
 * Nothing in this file is an official IB endorsement. See curriculum.ts.
 */

import { MYP_CRITERION_PRESETS } from "./myp.ts";

export type MypProvenance = "official-subject-brief" | "structure-summary";

export interface MypStrand {
  code: string; // e.g. "A(i)"
  title: string;
  description: string;
  provenance: MypProvenance;
}

export interface MypReferenceCriterion {
  code: "A" | "B" | "C" | "D";
  title: string;
  description: string;
  strands: MypStrand[];
  provenance: MypProvenance;
}

export interface MypSubjectGroupReference {
  key: string;
  group: string;
  source: string;
  sourceUrl: string;
  criteria: MypReferenceCriterion[];
}

const SUMMARY: MypProvenance = "structure-summary";
const OFFICIAL: MypProvenance = "official-subject-brief";

function s(code: string, title: string, description: string): MypStrand {
  return { code, title, description, provenance: SUMMARY };
}

const PRESET_SOURCE_URL: Record<string, string> = {
  mathematics: "https://www.ibo.org/globalassets/new-structure/brochures-and-infographics/pdfs/myp-brief-mathematics-en.pdf",
  sciences: "https://www.ibo.org/globalassets/new-structure/brochures-and-infographics/pdfs/myp-brief-sciences-en.pdf",
  language_literature: "https://www.ibo.org/globalassets/new-structure/brochures-and-infographics/pdfs/myp-brief-languageandliterature-en.pdf",
  language_acquisition: "https://www.ibo.org/globalassets/new-structure/brochures-and-infographics/pdfs/myp-brief-languageacquisition-en.pdf",
  individuals_societies: "https://www.ibo.org/globalassets/new-structure/brochures-and-infographics/pdfs/myp-brief-individualsandsocieties-en.pdf",
  arts: "https://www.ibo.org/globalassets/new-structure/brochures-and-infographics/pdfs/myp-brief-arts-en.pdf",
  physical_health: "https://www.ibo.org/globalassets/new-structure/brochures-and-infographics/pdfs/myp-brief-physicalandhealtheducation-en.pdf",
  design: "https://www.ibo.org/globalassets/new-structure/brochures-and-infographics/pdfs/myp-brief-design-en.pdf",
};

const STRAND_TABLES: Record<string, Record<string, MypStrand[]>> = {
  mathematics: {
    A: [
      s("A(i)", "Knowing facts and procedures", "Recall and use mathematical facts, terminology and routine procedures accurately."),
      s("A(ii)", "Selecting strategies", "Choose an appropriate method or strategy for the problem at hand."),
      s("A(iii)", "Applying understanding", "Use selected mathematics successfully in the given context."),
    ],
    B: [
      s("B(i)", "Pattern recognition", "Identify patterns and relationships in a sequence or situation."),
      s("B(ii)", "Generalisation", "Describe the pattern with a rule or general statement."),
      s("B(iii)", "Verification", "Test and justify whether the generalisation holds."),
    ],
    C: [
      s("C(i)", "Organising information", "Structure working and representations coherently."),
      s("C(ii)", "Interpreting results", "Read, interpret and draw conclusions from results."),
      s("C(iii)", "Communicating results", "Use mathematical language and forms of representation clearly."),
    ],
    D: [
      s("D(i)", "Analysing the context", "Identify relevant elements of the authentic real-life situation."),
      s("D(ii)", "Selecting strategies", "Choose mathematical strategies suited to the context and justify assumptions."),
      s("D(iii)", "Evaluating the solution", "Interpret the result, consider accuracy and reflect on the solution."),
    ],
  },
  sciences: {
    A: [
      s("A(i)", "Demonstrating knowledge", "Describe scientific ideas, facts, terminology and concepts."),
      s("A(ii)", "Applying knowledge", "Use scientific knowledge to solve problems in familiar and unfamiliar situations."),
    ],
    B: [
      s("B(i)", "Formulating questions", "Identify a problem, formulate a testable question or hypothesis."),
      s("B(ii)", "Designing investigations", "Describe a method, identify variables and design a scientific investigation."),
    ],
    C: [
      s("C(i)", "Recording observations", "Record observations and data accurately and systematically."),
      s("C(ii)", "Processing data", "Present, analyse and interpret data in appropriate representations."),
      s("C(iii)", "Evaluating methods", "Evaluate the validity, reliability and limitations of results and methods."),
    ],
    D: [
      s("D(i)", "Discussing impacts", "Describe applications of science and their implications for society."),
      s("D(ii)", "Evaluating impacts", "Evaluate the local and global implications of scientific applications."),
    ],
  },
  language_literature: {
    A: [
      s("A(i)", "Analysing content and context", "Analyse content, context, purpose and audience of texts."),
      s("A(ii)", "Analysing language, structure and technique", "Analyse how language, structure, technique and style shape meaning."),
    ],
    B: [
      s("B(i)", "Organising opinions and ideas", "Sequence and structure opinions and ideas coherently for the task."),
      s("B(ii)", "Organising facts and ideas", "Select and order factual and conceptual material logically."),
    ],
    C: [
      s("C(i)", "Producing text", "Create clear, well-structured texts appropriate to audience and purpose."),
      s("C(ii)", "Integrating forms", "Integrate modes, media and sources where the task requires them."),
    ],
    D: [
      s("D(i)", "Using vocabulary", "Use varied and precise vocabulary appropriate to context."),
      s("D(ii)", "Using sentence structures", "Use a range of sentence structures and punctuation accurately."),
      s("D(iii)", "Using register and style", "Select register, tone and style to suit purpose and audience."),
    ],
  },
  language_acquisition: {
    A: [
      s("A(i)", "Comprehending spoken and visual text", "Identify the main idea, message and supporting detail in spoken and visual texts."),
      s("A(ii)", "Interpreting meaning", "Infer meaning, intent and perspective from spoken and visual texts."),
    ],
    B: [
      s("B(i)", "Comprehending written and visual text", "Identify main idea, message and supporting detail in written and visual texts."),
      s("B(ii)", "Interpreting meaning", "Infer meaning, intent and perspective from written and visual texts."),
    ],
    C: [
      s("C(i)", "Responding appropriately", "Respond appropriately to the task, audience and purpose."),
      s("C(ii)", "Using format and convention", "Use the formats, conventions and registers expected of the task."),
      s("C(iii)", "Using interaction skills", "Use interaction skills in spoken communication where applicable."),
    ],
    D: [
      s("D(i)", "Using vocabulary", "Use topic and high-frequency vocabulary accurately."),
      s("D(ii)", "Using grammar and syntax", "Apply grammar and sentence structures of the target language."),
      s("D(iii)", "Using register", "Select an appropriate register for the situation."),
    ],
  },
  individuals_societies: {
    A: [
      s("A(i)", "Knowing concepts and theories", "Use subject-specific terminology, concepts and theories in context."),
      s("A(ii)", "Applying methods and knowledge", "Apply knowledge, methods and tools of the discipline to unfamiliar situations."),
    ],
    B: [
      s("B(i)", "Framing the inquiry", "Formulate a focused research question and plan an action to investigate it."),
      s("B(ii)", "Drawing conclusions", "Collect and record evidence and reach supported conclusions."),
    ],
    C: [
      s("C(i)", "Structuring communication", "Organise information and ideas using an appropriate structure."),
      s("C(ii)", "Using forms and conventions", "Use the communication forms and conventions of the discipline."),
    ],
    D: [
      s("D(i)", "Identifying positions and evidence", "Distinguish between fact, opinion and interpretation; identify sources."),
      s("D(ii)", "Considering contexts and perspectives", "Analyse issues from more than one perspective and context."),
      s("D(iii)", "Synthesising and evaluating", "Evaluate evidence and synthesise reasoned judgements."),
    ],
  },
  arts: {
    A: [
      s("A(i)", "Knowing and understanding", "Demonstrate knowledge of the art form's terminology, techniques and context."),
      s("A(ii)", "Applying knowledge", "Apply knowledge and understanding in practical work."),
    ],
    B: [
      s("B(i)", "Acquiring skills", "Demonstrate acquisition of the required skills and techniques."),
      s("B(ii)", "Developing skills", "Develop and refine skills and techniques over time."),
    ],
    C: [
      s("C(i)", "Developing an intention", "Formulate a clear artistic intention and select suitable ideas."),
      s("C(ii)", "Making and refining", "Realise the intention through making, refining and problem-solving."),
    ],
    D: [
      s("D(i)", "Reflecting on own work", "Reflect on the development and effectiveness of own work."),
      s("D(ii)", "Evaluating artwork", "Evaluate artwork using appropriate terminology and criteria."),
    ],
  },
  physical_health: {
    A: [
      s("A(i)", "Knowing terminology", "Describe and explain facts, concepts and terminology of PHE."),
      s("A(ii)", "Applying knowledge", "Apply knowledge and understanding to fitness, health and performance."),
    ],
    B: [
      s("B(i)", "Analysing needs", "Analyse a need for performance, fitness or well-being."),
      s("B(ii)", "Designing a plan", "Design a plan to address the identified need."),
    ],
    C: [
      s("C(i)", "Selecting strategies", "Select strategies and techniques appropriate to the activity."),
      s("C(ii)", "Applying strategies", "Apply strategies, techniques and safety practices during performance."),
    ],
    D: [
      s("D(i)", "Evaluating performance", "Evaluate the effectiveness of the plan and performance."),
      s("D(ii)", "Proposing actions", "Propose realistic actions to improve future performance and well-being."),
    ],
  },
  design: {
    A: [
      s("A(i)", "Identifying the need", "Identify and explain the need or opportunity for a solution."),
      s("A(ii)", "Researching", "Research existing products, users and contexts to inform the solution."),
    ],
    B: [
      s("B(i)", "Creating specifications", "Develop clear, justified design specifications."),
      s("B(ii)", "Developing ideas", "Generate, evaluate and refine feasible design ideas."),
    ],
    C: [
      s("C(i)", "Planning the solution", "Create a logical plan, select tools and manage the creation process."),
      s("C(ii)", "Creating the solution", "Construct and test the solution against the specifications."),
    ],
    D: [
      s("D(i)", "Evaluating the solution", "Evaluate the solution against the specifications and its impact."),
      s("D(ii)", "Proposing improvements", "Justify proposals for improvement of the solution."),
    ],
  },
};

function build(): MypSubjectGroupReference[] {
  return MYP_CRITERION_PRESETS.map((preset) => {
    const strandsByCode = STRAND_TABLES[preset.key] ?? {};
    return {
      key: preset.key,
      group: preset.label.replace(/ \(standard MYP\)$/, ""),
      source: preset.source,
      sourceUrl: PRESET_SOURCE_URL[preset.key] ?? "https://www.ibo.org/programmes/middle-years-programme/",
      criteria: preset.criteria.map((criterion) => ({
        code: criterion.code as "A" | "B" | "C" | "D",
        title: criterion.title,
        description: criterion.description,
        provenance: OFFICIAL,
        strands: strandsByCode[criterion.code] ?? [],
      })),
    };
  });
}

/** All eight MYP subject groups with criteria and strand structure. */
export const MYP_SUBJECT_GROUP_REFERENCE: MypSubjectGroupReference[] = build();

/**
 * Honest record of what is NOT reproduced here. Surfaced in the settings UI
 * so an unofficial summary can never masquerade as official IB wording.
 */
export const MYP_REFERENCE_GAPS: { scope: string; gap: string; where: string }[] = [
  {
    scope: "Strand descriptors (all groups)",
    gap:
      "Verbatim official strand descriptions are copyrighted IB Store subject-guide material and are not publicly accessible; EVALORA stores concise summaries with the published strand codes/titles only.",
    where: "IB Store — MYP subject guides (subject guide publications)",
  },
  {
    scope: "Achievement-level boundaries (0–8)",
    gap:
      "IB publishes criterion achievement-level descriptors in the subject guides; the percentage→level conversion used at marking time is school-configurable data (myp_level_boundaries) and is labelled as an EVALORA default, not an IB boundary.",
    where: "myp_results/settings (per-subject configuration)",
  },
  {
    scope: "Overall 1–7 grade boundaries",
    gap: "Published IB total boundaries (0–32 → 1–7) are configured as data; any school adjustment is stored with its source line.",
    where: "myp_results/settings (per-subject configuration)",
  },
];

/** Look up the reference for a subject-group key used by the presets. */
export function mypReferenceForPreset(key: string): MypSubjectGroupReference | null {
  return MYP_SUBJECT_GROUP_REFERENCE.find((entry) => entry.key === key) ?? null;
}
