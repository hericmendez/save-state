"use client";

/**
 * Review Editor — Tiptap surface (Phase 2).
 *
 * Loaded lazily (`next/dynamic`, `ssr: false`) so common pages never pay
 * for the editing bundle. Three modes over a single Markdown source of
 * truth owned by the parent screen:
 *
 * - visual: WYSIWYG (`@tiptap/react` + `editor.getMarkdown()` per change)
 * - markdown: raw textarea (direct syntax editing)
 * - preview: read-only Tiptap rendering (never modifies the document)
 *
 * Mode switches are lossless for supported constructs. When the raw
 * Markdown contains constructs the visual schema cannot represent
 * (tables, task lists, footnotes, raw HTML), a warning is shown BEFORE
 * parsing and the original text is preserved until the user edits visually.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  createReviewEditorExtensions,
  stripUnsafePreviewImages,
  type ReviewToolbarAction,
} from "./editor-extensions";
import {
  detectUnsupportedMarkdown,
  isSafeEmbedUrl,
  type UnsupportedMarkdownKind,
} from "./editor-markdown";
import type { ReviewEditorMode } from "./editor-types";

interface TiptapReviewEditorProps {
  markdown: string;
  onMarkdownChange: (markdown: string) => void;
  mode: ReviewEditorMode;
  onModeChange: (mode: ReviewEditorMode) => void;
  disabled?: boolean;
}

const TOOLBAR_LABELS: Record<ReviewToolbarAction, string> = {
  h1: "Título 1",
  h2: "Título 2",
  h3: "Título 3",
  bold: "Negrito (Ctrl+B)",
  italic: "Itálico (Ctrl+I)",
  strike: "Tachado",
  code: "Código inline",
  bulletList: "Lista com marcadores",
  orderedList: "Lista numerada",
  blockquote: "Citação",
  codeBlock: "Bloco de código",
  horizontalRule: "Separador horizontal",
  link: "Inserir link",
  image: "Inserir imagem por URL",
  undo: "Desfazer (Ctrl+Z)",
  redo: "Refazer (Ctrl+Y)",
};

const TOOLBAR_GLYPHS: Record<ReviewToolbarAction, string> = {
  h1: "H1",
  h2: "H2",
  h3: "H3",
  bold: "B",
  italic: "I",
  strike: "S",
  code: "<>",
  bulletList: "•≡",
  orderedList: "1≡",
  blockquote: "❝",
  codeBlock: "{ }",
  horizontalRule: "―",
  link: "🔗",
  image: "🖼",
  undo: "↩",
  redo: "↪",
};

const UNSUPPORTED_LABELS: Record<UnsupportedMarkdownKind, string> = {
  table: "tabelas",
  "task-list": "listas de tarefas",
  footnote: "notas de rodapé",
  html: "HTML embutido",
};

/**
 * Word-like groups: styles, formatting, structure, insertion, editing.
 * Visual order only — the canonical action set is unchanged.
 */
const TOOLBAR_GROUPS: { label: string; actions: ReviewToolbarAction[] }[] = [
  { label: "Estilos", actions: ["h1", "h2", "h3"] },
  { label: "Formatação", actions: ["bold", "italic", "strike", "code"] },
  {
    label: "Estrutura",
    actions: ["bulletList", "orderedList", "blockquote", "codeBlock"],
  },
  { label: "Inserção", actions: ["link", "image", "horizontalRule"] },
  { label: "Edição", actions: ["undo", "redo"] },
];

export function TiptapReviewEditor({
  markdown,
  onMarkdownChange,
  mode,
  onModeChange,
  disabled = false,
}: TiptapReviewEditorProps) {
  const [, forceToolbarPaint] = useReducer((n: number) => n + 1, 0);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [dialogUrl, setDialogUrl] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const dialogInputRef = useRef<HTMLInputElement>(null);

  const extensions = useMemo(() => createReviewEditorExtensions(), []);
  const previewExtensions = useMemo(() => createReviewEditorExtensions(), []);

  const editor = useEditor(
    {
      extensions,
      content: markdown,
      contentType: "markdown",
      editable: !disabled && mode === "visual",
      immediatelyRender: false,
      onUpdate: ({ editor: current, transaction }) => {
        // Selection/focus/editable transactions (e.g. setEditable on mode
        // switch) must never rewrite the canonical Markdown: the visual
        // document can be stale (raw-textarea edits are merged only when
        // entering visual mode). Propagate real doc changes only.
        if (!transaction.docChanged) return;
        onMarkdownChange(current.getMarkdown());
      },
      onTransaction: () => {
        forceToolbarPaint();
      },
    },
    [extensions],
  );

  const previewEditor = useEditor(
    {
      extensions: previewExtensions,
      content: markdown,
      contentType: "markdown",
      editable: false,
      immediatelyRender: false,
    },
    [previewExtensions],
  );

  // External markdown (mode switch, conflict reload, draft load) replaces
  // the visual document — only on explicit transitions, never per keystroke.
  const lastSyncedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editor || mode !== "visual") return;
    if (lastSyncedRef.current === markdown) return;
    lastSyncedRef.current = markdown;
    editor.commands.setContent(markdown, { contentType: "markdown" });
  }, [editor, markdown, mode]);

  useEffect(() => {
    editor?.setEditable(!disabled && mode === "visual");
  }, [editor, disabled, mode]);

  useEffect(() => {
    if (!previewEditor || mode !== "preview") return;
    previewEditor.commands.setContent(markdown, {
      contentType: "markdown",
    });
    // Defense in depth: the read-only preview never renders non-http(s)
    // images (data:/blob:/relative). Only this throwaway document is
    // filtered — the canonical Markdown in state is untouched.
    const { doc: safeDoc, changed } = stripUnsafePreviewImages(
      previewEditor.getJSON(),
    );
    if (changed) previewEditor.commands.setContent(safeDoc);
  }, [previewEditor, markdown, mode]);

  // Mark the document as synced whenever the change originated here, so
  // the effect above does not echo our own keystrokes back into Tiptap.
  useEffect(() => {
    lastSyncedRef.current = editor?.getMarkdown() ?? null;
  });

  useEffect(() => {
    if ((linkDialogOpen || imageDialogOpen) && dialogInputRef.current) {
      dialogInputRef.current.focus();
    }
  }, [linkDialogOpen, imageDialogOpen]);

  const unsupported = useMemo(
    () => (mode === "markdown" ? detectUnsupportedMarkdown(markdown) : []),
    [markdown, mode],
  );

  if (!editor || !previewEditor) {
    return (
      <div className="rpgui-container framed-grey" role="status">
        <p>Carregando editor…</p>
      </div>
    );
  }

  const requestMode = (next: ReviewEditorMode) => {
    if (next === mode) return;
    if (next === "visual") {
      // Switching TO visual parses raw Markdown. The warning below has
      // already told the user what may be normalized; the raw text stays
      // intact in state until they edit visually.
      lastSyncedRef.current = null;
    }
    setLinkDialogOpen(false);
    setImageDialogOpen(false);
    onModeChange(next);
  };

  const runAction = (action: ReviewToolbarAction) => {
    if (disabled || mode !== "visual") return;
    const chain = editor.chain().focus();
    switch (action) {
      case "h1":
        chain.toggleHeading({ level: 1 }).run();
        break;
      case "h2":
        chain.toggleHeading({ level: 2 }).run();
        break;
      case "h3":
        chain.toggleHeading({ level: 3 }).run();
        break;
      case "bold":
        chain.toggleBold().run();
        break;
      case "italic":
        chain.toggleItalic().run();
        break;
      case "strike":
        chain.toggleStrike().run();
        break;
      case "code":
        chain.toggleCode().run();
        break;
      case "bulletList":
        chain.toggleBulletList().run();
        break;
      case "orderedList":
        chain.toggleOrderedList().run();
        break;
      case "blockquote":
        chain.toggleBlockquote().run();
        break;
      case "codeBlock":
        chain.toggleCodeBlock().run();
        break;
      case "horizontalRule":
        chain.setHorizontalRule().run();
        break;
      case "link":
        setDialogError(null);
        setDialogUrl(editor.getAttributes("link").href ?? "");
        setImageDialogOpen(false);
        setLinkDialogOpen(true);
        break;
      case "image":
        setDialogError(null);
        setDialogUrl("");
        setLinkDialogOpen(false);
        setImageDialogOpen(true);
        break;
      case "undo":
        chain.undo().run();
        break;
      case "redo":
        chain.redo().run();
        break;
    }
  };

  const isActive = (action: ReviewToolbarAction): boolean => {
    try {
      switch (action) {
        case "h1":
          return editor.isActive("heading", { level: 1 });
        case "h2":
          return editor.isActive("heading", { level: 2 });
        case "h3":
          return editor.isActive("heading", { level: 3 });
        case "bold":
          return editor.isActive("bold");
        case "italic":
          return editor.isActive("italic");
        case "strike":
          return editor.isActive("strike");
        case "code":
          return editor.isActive("code");
        case "bulletList":
          return editor.isActive("bulletList");
        case "orderedList":
          return editor.isActive("orderedList");
        case "blockquote":
          return editor.isActive("blockquote");
        case "codeBlock":
          return editor.isActive("codeBlock");
        case "link":
          return editor.isActive("link");
        default:
          return false;
      }
    } catch {
      return false;
    }
  };

  const isActionDisabled = (action: ReviewToolbarAction): boolean => {
    if (disabled || mode !== "visual") return true;
    try {
      if (action === "undo") return !editor.can().undo();
      if (action === "redo") return !editor.can().redo();
    } catch {
      return true;
    }
    return false;
  };

  const confirmLink = () => {
    const url = dialogUrl.trim();
    if (!isSafeEmbedUrl(url)) {
      setDialogError("Use uma URL http(s):// ou mailto: válida.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkDialogOpen(false);
    setDialogUrl("");
  };

  const confirmImage = () => {
    const url = dialogUrl.trim();
    if (!isSafeEmbedUrl(url)) {
      setDialogError("Use uma URL de imagem http(s):// válida.");
      return;
    }
    editor.chain().focus().setImage({ src: url }).run();
    setImageDialogOpen(false);
    setDialogUrl("");
  };

  const closeDialog = () => {
    setLinkDialogOpen(false);
    setImageDialogOpen(false);
    setDialogError(null);
    editor.commands.focus();
  };

  const dialogOpen = linkDialogOpen || imageDialogOpen;

  return (
    <div>
      <div
        className="review-mode-tabs"
        role="tablist"
        aria-label="Modo de edição"
      >
        {(
          [
            { id: "visual", label: "Visual" },
            { id: "markdown", label: "Markdown" },
            { id: "preview", label: "Prévia" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={mode === tab.id}
            className="rpgui-container framed-grey review-btn"
            onClick={() => requestMode(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="review-editor-toolbar"
        role="toolbar"
        aria-label="Formatação"
        style={{ marginTop: "0.5rem" }}
      >
        {TOOLBAR_GROUPS.map((group, groupIndex) => (
          <div key={group.label} style={{ display: "contents" }}>
            {groupIndex > 0 && (
              <span
                role="separator"
                aria-orientation="vertical"
                aria-hidden="true"
                className="review-toolbar-divider"
              />
            )}
            <div
              className="review-toolbar-group"
              role="group"
              aria-label={group.label}
            >
              {group.actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  className="rpgui-container framed-grey review-toolbar-btn"
                  title={TOOLBAR_LABELS[action]}
                  aria-label={TOOLBAR_LABELS[action]}
                  aria-pressed={
                    action === "link" || action === "image" || action === "undo" || action === "redo" || action === "horizontalRule"
                      ? undefined
                      : isActive(action)
                  }
                  disabled={isActionDisabled(action)}
                  onClick={() => runAction(action)}
                >
                  <span aria-hidden="true">{TOOLBAR_GLYPHS[action]}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {dialogOpen && (
        <div
          className="rpgui-container framed review-editor-dialog"
          role="dialog"
          aria-label={linkDialogOpen ? "Inserir link" : "Inserir imagem por URL"}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeDialog();
          }}
        >
          <label htmlFor="review-editor-url-input">
            {linkDialogOpen ? "URL do link" : "URL da imagem"}
          </label>
          <input
            id="review-editor-url-input"
            ref={dialogInputRef}
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={dialogUrl}
            onChange={(event) => setDialogUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (linkDialogOpen) confirmLink();
                else confirmImage();
              }
            }}
          />
          <button
            type="button"
            className="rpgui-container framed-grey review-btn"
            onClick={linkDialogOpen ? confirmLink : confirmImage}
          >
            Aplicar
          </button>
          <button type="button" className="rpgui-container framed-grey review-btn" onClick={closeDialog}>
            Cancelar
          </button>
          {dialogError && (
            <p role="alert" style={{ width: "100%" }}>
              {dialogError}
            </p>
          )}
        </div>
      )}

      {mode === "markdown" && unsupported.length > 0 && (
        <div className="review-banner" role="alert" style={{ marginTop: "0.5rem" }}>
          <p>
            Este rascunho contém{" "}
            {unsupported.map((kind) => UNSUPPORTED_LABELS[kind]).join(", ")}{" "}
            — o modo visual pode normalizar essa formatação. O texto original
            está preservado aqui; troque para Visual somente se aceitar a
            normalização.
          </p>
        </div>
      )}

      <div style={{ marginTop: "0.5rem" }}>
        {mode === "visual" && (
          <div className="review-prose">
            <EditorContent editor={editor} aria-label="Editor visual da review" />
          </div>
        )}
        {mode === "markdown" && (
          <textarea
            className="review-markdown-source"
            aria-label="Markdown bruto da review"
            value={markdown}
            disabled={disabled}
            onChange={(event) => onMarkdownChange(event.target.value)}
            spellCheck
          />
        )}
        {mode === "preview" && (
          <div className="review-prose" aria-label="Prévia da review">
            <EditorContent editor={previewEditor} readOnly />
          </div>
        )}
      </div>
    </div>
  );
}
