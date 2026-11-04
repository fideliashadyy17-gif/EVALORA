"use client";

import { emptyDoc, renderLatex, validateLatex, type RichDoc } from "@/lib/content";
import { Extension } from "@tiptap/core";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { BubbleMenu, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useMemo, useRef, useState } from "react";
import { MathField, type MathFieldHandle } from "./MathField";
import { MATH_CATEGORIES, stripPlaceholders, templateToPlaceholderLatex, type MathKey } from "./mathKeyboard";
import { MathBlock, MathInline } from "./mathNodes";

type Mode = "text" | "math" | "latex";

/** Font-size mark support (TextStyle attribute). */
const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.fontSize || null,
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs.fontSize ? { style: `font-size: ${String(attrs.fontSize)}` } : {},
          },
        },
      },
    ];
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addCommands(): any {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setFontSize: (fontSize: string) => ({ chain }: any) => chain().setMark("textStyle", { fontSize }).run(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unsetFontSize: () => ({ chain }: any) =>
        chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

const RichImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: 80,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute("data-width") ?? 80),
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-width": attrs.width ?? 80,
          style: `max-width:${Number(attrs.width ?? 80)}%`,
        }),
      },
    };
  },
});

const btn =
  "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-evergreen-900/15 bg-white px-1.5 text-[13px] font-medium text-evergreen-950 hover:bg-evergreen-50 disabled:opacity-40";
const btnActive = "bg-evergreen-700 text-white hover:bg-evergreen-700 border-evergreen-700";

export interface UploadResult {
  url?: string;
  error?: string;
}

export function RichContentEditor({
  value,
  onChange,
  compact = false,
  uploadImage,
  ariaLabel,
}: {
  value: RichDoc | null;
  onChange: (doc: RichDoc) => void;
  compact?: boolean;
  uploadImage?: (file: File) => Promise<UploadResult>;
  ariaLabel?: string;
}) {
  const [mode, setMode] = useState<Mode>("text");
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [kbCategory, setKbCategory] = useState(MATH_CATEGORIES[1].id);
  const [mathDraft, setMathDraft] = useState("");
  const [latexDraft, setLatexDraft] = useState("");
  const [editingPos, setEditingPos] = useState<number | null>(null);
  const [editingDisplay, setEditingDisplay] = useState(false);
  const [switchMsg, setSwitchMsg] = useState<string | null>(null);
  const [showLinkRow, setShowLinkRow] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [showImageUrlRow, setShowImageUrlRow] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const mfRef = useRef<MathFieldHandle | null>(null);
  const latexRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const initialDoc = useMemo(() => value ?? emptyDoc(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const openMathEditor = (pos: number, latex: string, display: boolean, toMode: Mode = "math") => {
    setEditingPos(pos);
    setEditingDisplay(display);
    setMathDraft(latex);
    setLatexDraft(latex);
    setMode(toMode);
    setShowKeyboard(true);
    setSwitchMsg(null);
    mfRef.current?.setValue(latex);
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      FontSize,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, autolink: true }),
      RichImage.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      MathInline,
      MathBlock,
    ],
    content: initialDoc as never,
    editorProps: { attributes: { "aria-label": ariaLabel ?? "Content editor" } },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as RichDoc),
    onCreate: ({ editor }) => {
      const storage = editor.storage as unknown as Record<string, { onEditRequest?: unknown }>;
      if (storage.mathInline) storage.mathInline.onEditRequest = openMathEditor;
      if (storage.mathBlock) storage.mathBlock.onEditRequest = openMathEditor;
    },
  });

  if (!editor) {
    return <div className="rce-shell p-4 text-sm text-ink-soft">Loading editor…</div>;
  }
  const ed = editor; // narrowed, non-null alias for use inside closures

  const latexError = latexDraft.trim() ? validateLatex(latexDraft) : null;
  const isMathSelected = editor.isActive("mathInline") || editor.isActive("mathBlock");
  const isImageSelected = editor.isActive("image");
  const inTable = editor.isActive("table");

  function insertMathNode(latex: string, display: boolean) {
    ed.chain().focus().insertContent({ type: display ? "mathBlock" : "mathInline", attrs: { latex } }).run();
    setEditingPos(null);
  }

  function applyMathNode(latex: string): boolean {
    if (editingPos == null) return false;
    const node = ed.state.doc.nodeAt(editingPos);
    if (!node || (node.type.name !== "mathInline" && node.type.name !== "mathBlock")) return false;
    ed.chain().setNodeSelection(editingPos).updateAttributes(node.type.name, { latex }).focus().run();
    setEditingPos(null);
    setMathDraft("");
    mfRef.current?.setValue("", false);
    return true;
  }

  function commitMath(latex: string, display: boolean) {
    // Remaining MathLive placeholders are editing slots, not final content.
    // Remove only empty placeholders so the stored LaTeX remains valid for
    // KaTeX and all participant-facing renderers.
    const clean = latex.trim().replace(/\\placeholder\{\}/g, "");
    if (!clean) return;
    if (!applyMathNode(clean)) insertMathNode(clean, display);
  }

  function switchMode(next: Mode) {
    setSwitchMsg(null);
    if (next === "latex") {
      const fromField = mfRef.current?.getValue();
      setLatexDraft(editingPos != null ? (fromField ?? mathDraft) : (fromField || mathDraft));
      setMode("latex");
      setShowKeyboard(true);
      return;
    }
    if (next === "math") {
      if (mode === "latex" && latexDraft.trim()) {
        const err = validateLatex(latexDraft);
        if (err) {
          setSwitchMsg("Fix the LaTeX error before switching to visual mode — your source is preserved exactly as written.");
          return;
        }
        setMathDraft(latexDraft);
        mfRef.current?.setValue(latexDraft);
      }
      setMode("math");
      setShowKeyboard(true);
      // If a math node is selected in the document, load it.
      const sel = ed.state.selection;
      const node = ed.state.doc.nodeAt(sel.from);
      if (node && (node.type.name === "mathInline" || node.type.name === "mathBlock")) {
        openMathEditor(sel.from, String(node.attrs.latex ?? ""), node.type.name === "mathBlock");
      }
      return;
    }
    setMode("text");
  }

  function onKeyboardKey(key: MathKey) {
    if (mode === "math" && mfRef.current) {
      mfRef.current.insert(key.i);
      return;
    }
    if (mode === "latex" && latexRef.current) {
      const ta = latexRef.current;
      const insert = stripPlaceholders(key.i);
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const next = ta.value.slice(0, start) + insert + ta.value.slice(end);
      setLatexDraft(next);
      requestAnimationFrame(() => {
        ta.focus();
        const emptyGroup = insert.indexOf("{}");
        const caret = emptyGroup >= 0 ? start + emptyGroup + 1 : start + insert.length;
        ta.setSelectionRange(caret, caret);
      });
      return;
    }
    // Text mode: insert valid fallback LaTeX at the document cursor, then
    // open the same structure with real MathLive placeholders for editing.
    const latex = stripPlaceholders(key.i);
    const before = ed.state.selection.from;
    insertMathNode(latex, false);
    const pos = Math.max(0, Math.min(before, ed.state.doc.content.size - 1));
    openMathEditor(pos, templateToPlaceholderLatex(key.i), false);
  }

  async function onFileChosen(file: File | null) {
    if (!file || !uploadImage) return;
    setUploadBusy(true);
    setUploadError(null);
    const res = await uploadImage(file);
    setUploadBusy(false);
    if (res.error || !res.url) {
      setUploadError(res.error ?? "Upload failed.");
      return;
    }
    ed.chain().focus().setImage({ src: res.url, alt: "" }).updateAttributes("image", { width: 70 }).run();
  }

  function currentMathNode(): { pos: number; latex: string; display: boolean } | null {
    const sel = ed.state.selection;
    const node = ed.state.doc.nodeAt(sel.from);
    if (node && (node.type.name === "mathInline" || node.type.name === "mathBlock")) {
      return { pos: sel.from, latex: String(node.attrs.latex ?? ""), display: node.type.name === "mathBlock" };
    }
    return null;
  }

  function toggleMathDisplay() {
    const cur = currentMathNode();
    if (!cur) return;
    ed.chain().focus().deleteSelection().insertContent({
      type: cur.display ? "mathInline" : "mathBlock",
      attrs: { latex: cur.latex },
    }).run();
  }

  const cat = MATH_CATEGORIES.find((c) => c.id === kbCategory) ?? MATH_CATEGORIES[0];

  return (
    <div className={`rce-shell ${compact ? "rce-compact" : ""}`}>
      {/* Mode selector */}
      <div className="flex flex-wrap items-center gap-2 border-b border-evergreen-900/10 bg-cream/60 px-3 py-2">
        <div className="inline-flex rounded-lg border border-evergreen-900/20 bg-white p-0.5" role="tablist" aria-label="Editing mode">
          {(
            [
              ["text", "Text / Word"],
              ["math", "Math √(x)"],
              ["latex", "LaTeX \\frac{}"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-semibold ${mode === m ? "bg-evergreen-700 text-white" : "text-evergreen-900 hover:bg-evergreen-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`${btn} ${showKeyboard ? btnActive : ""}`}
          onClick={() => setShowKeyboard((s) => !s)}
          aria-pressed={showKeyboard}
          title="Toggle the permanent mathematical keyboard"
        >
          ∑ Math keyboard
        </button>
        {editingPos != null && (
          <span className="rounded-full bg-gold-100 px-2.5 py-1 text-xs font-medium text-gold-900">
            Editing equation — Apply writes it back into the document
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => {
                setEditingPos(null);
                setMathDraft("");
                mfRef.current?.setValue("", false);
              }}
            >
              cancel
            </button>
          </span>
        )}
      </div>

      {switchMsg && <p className="border-b border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{switchMsg}</p>}

      {/* TEXT MODE toolbar */}
      {mode === "text" && (
        <div className="flex flex-wrap items-center gap-1 border-b border-evergreen-900/10 px-2 py-1.5" aria-label="Formatting tools">
          <button type="button" className={btn} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} title="Undo (Ctrl+Z)">↩</button>
          <button type="button" className={btn} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} title="Redo (Ctrl+Y)">↪</button>
          <span className="mx-1 h-5 w-px bg-evergreen-900/15" />
          <button type="button" className={`${btn} ${editor.isActive("bold") ? btnActive : ""} font-bold`} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">B</button>
          <button type="button" className={`${btn} ${editor.isActive("italic") ? btnActive : ""} italic`} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">I</button>
          <button type="button" className={`${btn} ${editor.isActive("underline") ? btnActive : ""} underline`} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">U</button>
          <button type="button" className={`${btn} ${editor.isActive("strike") ? btnActive : ""} line-through`} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">S</button>
          {!compact && (
            <>
              <span className="mx-1 h-5 w-px bg-evergreen-900/15" />
              <select
                className="h-8 rounded-md border border-evergreen-900/15 bg-white px-1 text-[13px]"
                aria-label="Font family"
                defaultValue=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) editor.chain().focus().setFontFamily(v).run();
                  else editor.chain().focus().unsetFontFamily().run();
                }}
              >
                <option value="">Font</option>
                <option value="'Public Sans', sans-serif">Sans</option>
                <option value="Georgia, serif">Serif</option>
                <option value="'Courier New', monospace">Mono</option>
              </select>
              <select
                className="h-8 rounded-md border border-evergreen-900/15 bg-white px-1 text-[13px]"
                aria-label="Font size"
                defaultValue=""
                onChange={(e) => {
                  const v = e.target.value;
                  const cmds = editor.commands as unknown as { setFontSize: (s: string) => void; unsetFontSize: () => void };
                  editor.chain().focus().run();
                  if (v) cmds.setFontSize(v);
                  else cmds.unsetFontSize();
                }}
              >
                <option value="">Size</option>
                <option value="0.85rem">Small</option>
                <option value="1rem">Normal</option>
                <option value="1.15rem">Large</option>
                <option value="1.35rem">XL</option>
              </select>
              <label className="inline-flex items-center gap-1 text-xs text-ink-soft" title="Text color">
                A<input type="color" className="h-8 w-8 cursor-pointer rounded border border-evergreen-900/15" onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} />
              </label>
              <label className="inline-flex items-center gap-1 text-xs text-ink-soft" title="Highlight color">
                ▤<input type="color" defaultValue="#fef08a" className="h-8 w-8 cursor-pointer rounded border border-evergreen-900/15" onChange={(e) => editor.chain().focus().setHighlight({ color: e.target.value }).run()} />
              </label>
              <button type="button" className={btn} onClick={() => editor.chain().focus().unsetColor().unsetHighlight().run()} title="Clear colors">A✕</button>
              <span className="mx-1 h-5 w-px bg-evergreen-900/15" />
              <button type="button" className={`${btn} ${editor.isActive("heading", { level: 2 }) ? btnActive : ""}`} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading">H2</button>
              <button type="button" className={`${btn} ${editor.isActive("heading", { level: 3 }) ? btnActive : ""}`} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Sub-heading">H3</button>
              <button type="button" className={`${btn} ${editor.isActive("bulletList") ? btnActive : ""}`} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bulleted list">•≡</button>
              <button type="button" className={`${btn} ${editor.isActive("orderedList") ? btnActive : ""}`} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">1≡</button>
              <button type="button" className={btn} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Align left">⇤</button>
              <button type="button" className={btn} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Align center">↔</button>
              <button type="button" className={btn} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Align right">⇥</button>
              <span className="mx-1 h-5 w-px bg-evergreen-900/15" />
              <button
                type="button"
                className={btn}
                onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                title="Insert table"
              >
                ▦ Table
              </button>
            </>
          )}
          <span className="mx-1 h-5 w-px bg-evergreen-900/15" />
          <button type="button" className={btn} onClick={() => { setShowLinkRow((s) => !s); setLinkUrl(String(editor.getAttributes("link").href ?? "")); }} title="Insert/edit link">🔗</button>
          {uploadImage && (
            <>
              <button type="button" className={btn} disabled={uploadBusy} onClick={() => fileRef.current?.click()} title="Upload an image or diagram">
                {uploadBusy ? "Uploading…" : "🖼 Image"}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { void onFileChosen(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            </>
          )}
          <button type="button" className={btn} onClick={() => setShowImageUrlRow((s) => !s)} title="Insert image from URL">🌐</button>
          <span className="mx-1 h-5 w-px bg-evergreen-900/15" />
          <button type="button" className={`${btn} font-semibold`} onClick={() => switchMode("math")} title="Insert a mathematical equation at the cursor">
            √ Insert equation
          </button>
          <button type="button" className={btn} onClick={() => switchMode("latex")} title="Write LaTeX source">
            {"\\frac{}"} LaTeX
          </button>
          <button type="button" className={btn} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Clear formatting of selection">⌫ fmt</button>
        </div>
      )}

      {showLinkRow && mode === "text" && (
        <div className="flex items-center gap-2 border-b border-evergreen-900/10 px-3 py-2">
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" className="h-8 flex-1 rounded-md border border-evergreen-900/20 px-2 text-sm" aria-label="Link URL" />
          <button type="button" className={btn} onClick={() => { if (linkUrl.trim()) editor.chain().focus().setLink({ href: linkUrl.trim() }).run(); setShowLinkRow(false); }}>Apply link</button>
          <button type="button" className={btn} onClick={() => { editor.chain().focus().unsetLink().run(); setShowLinkRow(false); }}>Remove</button>
        </div>
      )}
      {showImageUrlRow && mode === "text" && (
        <div className="flex items-center gap-2 border-b border-evergreen-900/10 px-3 py-2">
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/diagram.png" className="h-8 flex-1 rounded-md border border-evergreen-900/20 px-2 text-sm" aria-label="Image URL" />
          <button type="button" className={btn} onClick={() => { if (imageUrl.trim()) editor.chain().focus().setImage({ src: imageUrl.trim() }).updateAttributes("image", { width: 70 }).run(); setImageUrl(""); setShowImageUrlRow(false); }}>Insert image</button>
        </div>
      )}
      {uploadError && <p className="border-b border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{uploadError}</p>}

      {/* MATH MODE panel (visual mathematical editing) */}
      {mode === "math" && (
        <div className="border-b border-evergreen-900/10 bg-evergreen-50/50 px-3 py-3">
          <MathField
            initialValue={mathDraft}
            onInput={setMathDraft}
            onReady={(h) => {
              mfRef.current = h;
              if (mathDraft && h.getValue() !== mathDraft) h.setValue(mathDraft, false);
              if (mathDraft.includes("\\placeholder{}")) h.selectFirstPlaceholder();
            }}
            ariaLabel="Visual mathematics editor"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {editingPos != null ? (
              <button type="button" className={`${btn} bg-evergreen-700 font-semibold text-white hover:bg-evergreen-800`} onClick={() => commitMath(mfRef.current?.getValue() ?? mathDraft, editingDisplay)}>
                ✓ Apply to equation
              </button>
            ) : (
              <>
                <button type="button" className={`${btn} bg-evergreen-700 font-semibold text-white hover:bg-evergreen-800`} onClick={() => commitMath(mfRef.current?.getValue() ?? mathDraft, false)}>
                  Insert inline √x
                </button>
                <button type="button" className={btn} onClick={() => commitMath(mfRef.current?.getValue() ?? mathDraft, true)}>
                  Insert display equation
                </button>
              </>
            )}
            <button type="button" className={btn} onClick={() => { setMathDraft(""); mfRef.current?.setValue(""); }}>
              Clear
            </button>
            <button type="button" className={btn} onClick={() => mfRef.current?.toggleKeyboard()} title="MathLive on-screen keyboard">
              ⌨ Symbols keyboard
            </button>
            <button type="button" className={btn} onClick={() => switchMode("latex")}>
              {"</>"} Edit as LaTeX
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            Type naturally: <kbd>/</kbd> makes a fraction, <kbd>^</kbd> a power, <kbd>_</kbd> a subscript, “sqrt” becomes √.
            Click any part of an expression to edit inside it — arrow keys move between slots. Or tap a symbol below.
          </p>
        </div>
      )}

      {/* LaTeX MODE panel */}
      {mode === "latex" && (
        <div className="border-b border-evergreen-900/10 bg-evergreen-50/50 px-3 py-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-evergreen-800" htmlFor="rce-latex-src">
            LaTeX source
          </label>
          <textarea
            id="rce-latex-src"
            ref={latexRef}
            value={latexDraft}
            onChange={(e) => setLatexDraft(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder="\frac{x^2+1}{\sqrt{x+3}}"
            className="mt-1 w-full rounded-lg border border-evergreen-900/25 bg-white px-3 py-2 font-mono text-sm text-evergreen-950 focus:border-evergreen-600 focus:outline-none"
          />
          {latexError ? (
            <p className="mt-1 text-[13px] font-medium text-red-700">⚠ {latexError} — your source is kept unchanged.</p>
          ) : latexDraft.trim() ? (
            <p className="mt-1 text-[13px] text-evergreen-700">✓ Valid LaTeX</p>
          ) : null}
          <div className="mt-2 rounded-lg border border-evergreen-900/10 bg-white px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Rendered preview</p>
            <div
              className="rich-math-block text-evergreen-950"
              dangerouslySetInnerHTML={{ __html: latexDraft.trim() ? renderLatex(latexDraft, true) : "<span class='text-sm text-ink-soft'>Your rendered mathematics appears here…</span>" }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {editingPos != null ? (
              <button type="button" disabled={Boolean(latexError) || !latexDraft.trim()} className={`${btn} bg-evergreen-700 font-semibold text-white hover:bg-evergreen-800`} onClick={() => commitMath(latexDraft, editingDisplay)}>
                ✓ Apply to equation
              </button>
            ) : (
              <>
                <button type="button" disabled={Boolean(latexError) || !latexDraft.trim()} className={`${btn} bg-evergreen-700 font-semibold text-white hover:bg-evergreen-800`} onClick={() => commitMath(latexDraft, false)}>
                  Insert inline
                </button>
                <button type="button" disabled={Boolean(latexError) || !latexDraft.trim()} className={btn} onClick={() => commitMath(latexDraft, true)}>
                  Insert display equation
                </button>
              </>
            )}
            <button type="button" className={btn} onClick={() => switchMode("math")}>
              √ Edit visually
            </button>
          </div>
        </div>
      )}

      {/* The mixed-content document — always visible and editable */}
      <div className="rce-editor">
        <EditorContent editor={editor} />
      </div>

      {/*
        Permanent mathematical keyboard.
        Keep this panel mounted and toggle it with `hidden`: Tiptap's
        BubbleMenu/Tippy moves its DOM node to <body>, so conditionally
        inserting a previous sibling makes React try to insert before a node
        that is no longer a child of this shell (NotFoundError).
      */}
      <div className="border-t border-evergreen-900/10 bg-cream/70 px-3 py-2" hidden={!showKeyboard}>
          <div className="scroll-slim flex gap-1 overflow-x-auto pb-2" role="tablist" aria-label="Symbol categories">
            {MATH_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={kbCategory === c.id}
                onClick={() => setKbCategory(c.id)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${kbCategory === c.id ? "bg-evergreen-700 text-white" : "bg-white text-evergreen-900 border border-evergreen-900/15 hover:bg-evergreen-50"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label={`${cat.label} symbols`}>
            {cat.keys.map((key) => (
              <button
                key={`${cat.id}-${key.t}-${key.i}`}
                type="button"
                className="rce-kbd-btn"
                title={`${key.t} — inserts at the cursor`}
                aria-label={key.t}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onKeyboardKey(key)}
                dangerouslySetInnerHTML={{ __html: renderLatex(key.d, false) }}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">
            {mode === "math"
              ? "Symbols insert into the mathematics field above, at the cursor — structured symbols open editable slots."
              : mode === "latex"
                ? "Symbols insert LaTeX at the text cursor; the caret lands inside the first empty group."
                : "Symbols insert a real equation at the document cursor and open it in Math mode so you can fill every slot."}
          </p>
      </div>

      {/*
        Stable host-node anchor before the BubbleMenus. Tippy detaches/moves
        BubbleMenu roots, so they must never be React's insertion anchor for
        preceding conditional siblings.
      */}
      <div aria-hidden="true" data-rce-bubble-menu-anchor="" />

      {/* Bubble menus */}
      <BubbleMenu
        editor={editor}
        shouldShow={() => isMathSelected}
        tippyOptions={{ duration: 120 }}
        className="flex items-center gap-1 rounded-lg border border-evergreen-900/20 bg-white p-1 shadow-lg"
      >
        <button type="button" className={btn} onClick={() => { const c = currentMathNode(); if (c) openMathEditor(c.pos, c.latex, c.display, "math"); }}>√ Edit</button>
        <button type="button" className={btn} onClick={() => { const c = currentMathNode(); if (c) openMathEditor(c.pos, c.latex, c.display, "latex"); }}>{"</>"} LaTeX</button>
        <button type="button" className={btn} onClick={toggleMathDisplay}>Inline/display</button>
        <button type="button" className={`${btn} text-red-700`} onClick={() => editor.chain().focus().deleteSelection().run()}>Delete</button>
      </BubbleMenu>

      <BubbleMenu
        editor={editor}
        shouldShow={() => isImageSelected}
        tippyOptions={{ duration: 120 }}
        className="flex max-w-[92vw] flex-wrap items-center gap-1 rounded-lg border border-evergreen-900/20 bg-white p-1.5 shadow-lg"
      >
        {[30, 50, 70, 100].map((w) => (
          <button key={w} type="button" className={btn} onClick={() => editor.chain().focus().updateAttributes("image", { width: w }).run()}>{w}%</button>
        ))}
        <input
          key={`alt-${editor.state.selection.from}`}
          defaultValue={String(editor.getAttributes("image").alt ?? "")}
          placeholder="Alt text (accessibility)"
          className="h-8 w-40 rounded-md border border-evergreen-900/20 px-2 text-xs"
          onBlur={(e) => editor.chain().updateAttributes("image", { alt: e.target.value }).run()}
        />
        <input
          key={`cap-${editor.state.selection.from}`}
          defaultValue={String(editor.getAttributes("image").title ?? "")}
          placeholder="Caption"
          className="h-8 w-32 rounded-md border border-evergreen-900/20 px-2 text-xs"
          onBlur={(e) => editor.chain().updateAttributes("image", { title: e.target.value }).run()}
        />
        <button type="button" className={`${btn} text-red-700`} onClick={() => editor.chain().focus().deleteSelection().run()}>Delete</button>
      </BubbleMenu>

      <BubbleMenu
        editor={editor}
        shouldShow={() => inTable}
        tippyOptions={{ duration: 120 }}
        className="flex max-w-[92vw] flex-wrap items-center gap-1 rounded-lg border border-evergreen-900/20 bg-white p-1 shadow-lg"
      >
        <button type="button" className={btn} onClick={() => editor.chain().focus().addRowAfter().run()}>Row +</button>
        <button type="button" className={btn} onClick={() => editor.chain().focus().addColumnAfter().run()}>Col +</button>
        <button type="button" className={btn} onClick={() => editor.chain().focus().deleteRow().run()}>Row −</button>
        <button type="button" className={btn} onClick={() => editor.chain().focus().deleteColumn().run()}>Col −</button>
        <button type="button" className={btn} onClick={() => editor.chain().focus().toggleHeaderRow().run()}>Header row</button>
        <button type="button" className={`${btn} text-red-700`} onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</button>
      </BubbleMenu>
    </div>
  );
}
