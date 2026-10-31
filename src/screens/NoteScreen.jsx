import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { newId } from "../lib/domain.js";
import { domToMarkdown } from "../lib/editor.js";
import { compressImage, imageUrl, putImages } from "../lib/images.js";
import { renderMarkdown, wikiLinkHTML } from "../lib/markdown.js";
import { backlinksTo, findByTitle, noteForAi, parseTags } from "../lib/notes.js";
import { streamAI } from "../lib/ai.js";
import { NoteRow, Rendered, editedLabel } from "../components/shared.jsx";
import { useApp } from "../AppContext.jsx";
import { useDeleteNote } from "./simple.jsx";

// The editor's DOM belongs to the browser while typing, so React never renders
// into it: content is set here, and read back through domToMarkdown on input.
function useEditorContent(ref, body, deps) {
  useLayoutEffect(() => {
    const editor = ref.current;
    if (editor && document.activeElement !== editor) editor.innerHTML = body.trim() ? deps.render(body) : "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps.noteId, deps.revision, deps.images, deps.titles]);
}

function ImageSizer({ editorRef, onChange }) {
  const [target, setTarget] = useState(null);
  const [width, setWidth] = useState("100");
  const [label, setLabel] = useState(null);
  const pop = useRef(null);
  const right = useRef(null);
  const corner = useRef(null);
  const labelEl = useRef(null);
  const drag = useRef(null);

  const close = () => {
    setTarget((current) => { current?.classList.remove("img-selected"); return null; });
    drag.current = null;
    setLabel(null);
  };

  const position = (image) => {
    const box = image.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) { close(); return; }
    if (pop.current) {
      pop.current.style.left = `${Math.max(10, box.left + 8)}px`;
      pop.current.style.top = `${Math.max(10, box.top - (pop.current.offsetHeight || 40) - 8)}px`;
    }
    const size = right.current?.offsetWidth || 14;
    if (right.current) {
      right.current.style.left = `${box.right - size / 2}px`;
      right.current.style.top = `${box.top + box.height / 2 - size / 2}px`;
    }
    if (corner.current) {
      corner.current.style.left = `${box.right - size / 2}px`;
      corner.current.style.top = `${box.bottom - size / 2}px`;
    }
    if (labelEl.current) {
      labelEl.current.style.left = `${box.right + 10}px`;
      labelEl.current.style.top = `${box.top + box.height / 2 - 12}px`;
    }
  };

  const applyWidth = (image, percent) => {
    if (percent === 100) {
      delete image.dataset.w;
      image.style.width = "";
    } else {
      image.dataset.w = percent;
      image.style.width = `${percent}%`;
    }
    setWidth(String(percent));
  };

  useEffect(() => {
    const editor = editorRef.current;
    const onClick = (event) => {
      const image = event.target.closest("img.note-img");
      if (!image) return;
      setTarget((current) => { current?.classList.remove("img-selected"); return image; });
      image.classList.add("img-selected");
      setWidth(image.dataset.w || "100");
    };
    editor.addEventListener("click", onClick);
    return () => editor.removeEventListener("click", onClick);
  }, [editorRef]);

  useLayoutEffect(() => {
    if (!target) return undefined;
    position(target);
    const follow = () => position(target);
    const main = document.querySelector(".main");
    const outside = (event) => {
      if (!event.target.closest("#img-size-pop, img.note-img, .img-handle")) close();
    };
    const onKey = (event) => {
      if (event.key === "Escape") close();
    };
    main?.addEventListener("scroll", follow);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onKey);
    return () => {
      main?.removeEventListener("scroll", follow);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const contentWidth = () => {
    const styles = getComputedStyle(editorRef.current);
    return editorRef.current.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
  };
  const dragPercent = (event) => {
    const pixels = drag.current.startWidth + (event.clientX - drag.current.startX);
    return Math.min(100, Math.max(10, Math.round((pixels / drag.current.available) * 100)));
  };
  const handleProps = {
    onPointerDown(event) {
      drag.current = { startX: event.clientX, startWidth: target.getBoundingClientRect().width, available: contentWidth() };
      try { event.target.setPointerCapture(event.pointerId); } catch { /* no active pointer */ }
      event.preventDefault();
    },
    onPointerMove(event) {
      if (!drag.current) return;
      const percent = dragPercent(event);
      target.style.width = `${percent}%`;
      setLabel(percent);
      position(target);
    },
    onPointerUp(event) {
      if (!drag.current) return;
      const percent = dragPercent(event);
      drag.current = null;
      applyWidth(target, percent);
      setLabel(null);
      position(target);
      onChange();
    },
  };

  if (!target) return null;
  return (
    <>
      <div id="img-size-pop" className="img-size-pop" ref={pop}>
        {["25", "50", "75", "100"].map((value) => (
          <button key={value} className={`pill${width === value ? " active" : ""}`} type="button"
            onClick={() => { applyWidth(target, Number(value)); close(); onChange(); }}>
            {value === "100" ? "Full" : `${value}%`}
          </button>
        ))}
      </div>
      <button className="img-handle" ref={right} type="button" aria-label="Drag to resize image" {...handleProps} onPointerCancel={handleProps.onPointerUp} />
      <button className="img-handle img-handle-corner" ref={corner} type="button" aria-label="Drag to resize image" {...handleProps} onPointerCancel={handleProps.onPointerUp} />
      {label != null && <span className="img-size-label" ref={labelEl}>{label}%</span>}
    </>
  );
}

function useAiSummary({ draft, onInsert }) {
  const { auth, aiBusy, setAiBusy, followWikiLink } = useApp();
  const [panel, setPanel] = useState(null);
  const ready = !!auth.user;
  const hint = auth.status === "error" ? "Google sign-in isn't available right now — AI needs it." : "Sign in with Google to use AI.";

  const summarize = async () => {
    if (!ready || aiBusy) return;
    setAiBusy(true);
    setPanel({ status: "pending", text: "Thinking…" });
    try {
      const note = noteForAi({ title: draft.title, tags: parseTags(draft.tagsText), body: draft.body });
      const text = await streamAI(auth.user, { mode: "summarize", note }, (partial) => setPanel({ status: "streaming", text: partial }));
      setPanel({ status: "done", text });
    } catch (error) {
      setPanel({ status: "error", text: error.message });
    } finally {
      setAiBusy(false);
    }
  };

  return {
    button: (
      <button id="ai-summarize" className="pill pill-ai" type="button" disabled={!ready || aiBusy}
        title={ready ? "Summarize this note with AI" : hint} onClick={summarize}>✦ Summarize</button>
    ),
    panel: panel && (
      <div id="ai-summary" className="ai-panel">
        <div className="ai-panel-head">
          <span className="eyebrow">AI summary</span>
          <span className="spacer" />
          {panel.status === "done" && panel.text.trim() && (
            <button id="ai-insert" className="pill" type="button" onClick={() => { onInsert(panel.text.trim()); setPanel(null); }}>Insert into note</button>
          )}
          <button id="ai-summary-close" className="pill" type="button" onClick={() => setPanel(null)}>Close</button>
        </div>
        {panel.status === "done"
          ? <Rendered id="ai-summary-body" className="ai-panel-body" text={panel.text} onLink={followWikiLink} />
          : <div id="ai-summary-body" className={`ai-panel-body rendered ${panel.status === "pending" ? "pending" : ""} ${panel.status === "error" ? "error" : ""}`}>{panel.text}</div>}
      </div>
    ),
  };
}

export function NoteScreen() {
  const {
    state, selectedNote: note, draft, dirty, updateDraft, saveDraft, replaceEditorBody, editorRevision, focusEditor,
    navigate, followWikiLink, markdownContext, imagesVersion,
  } = useApp();
  const removeNote = useDeleteNote();
  const editorRef = useRef(null);
  const fileRef = useRef(null);
  const insertRange = useRef(null);
  const titles = state.notes.map((item) => item.title).join("\n");

  useEditorContent(editorRef, draft?.body ?? "", {
    noteId: note?.id, revision: editorRevision, images: imagesVersion, titles,
    render: (body) => renderMarkdown(body, markdownContext),
  });

  useEffect(() => {
    if (focusEditor.current) {
      focusEditor.current = false;
      editorRef.current?.focus();
    }
  }, [focusEditor]);

  // A note deleted from another tab or by sync leaves nothing to show.
  const missing = !note;
  useEffect(() => { if (missing) navigate("home"); }, [missing, navigate]);

  const syncBody = () => updateDraft({ body: domToMarkdown(editorRef.current) });

  const ai = useAiSummary({
    draft: draft || { title: "", tagsText: "", body: "" },
    onInsert: (summary) => replaceEditorBody(`${draft.body.replace(/\s+$/, "")}\n\n## AI summary\n${summary}\n`),
  });

  if (!note) return null;

  const format = (run) => ({
    onMouseDown: (event) => event.preventDefault(), // keeps the text selection
    onClick: () => { editorRef.current.focus(); run(); },
  });

  const blockIsHeading = () => {
    let node = window.getSelection()?.anchorNode;
    while (node && node !== editorRef.current) {
      if (node.nodeType === 1 && /^H[1-3]$/.test(node.tagName)) return true;
      node = node.parentNode;
    }
    return false;
  };

  const addLink = () => {
    const title = window.getSelection()?.toString().trim() || prompt("Link to which note?");
    if (!title) return;
    document.execCommand("insertHTML", false, `${wikiLinkHTML(title, !!findByTitle(state.notes, title))}&nbsp;`);
  };

  const captureRange = () => {
    const selection = window.getSelection();
    insertRange.current = selection?.rangeCount && editorRef.current.contains(selection.anchorNode)
      ? selection.getRangeAt(0).cloneRange() : null;
  };

  const insertImage = async (file) => {
    try {
      const blob = await compressImage(file);
      const id = newId();
      await putImages([{ id, blob, created: new Date().toISOString() }]);
      editorRef.current.focus();
      if (insertRange.current) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(insertRange.current);
        insertRange.current = null;
      }
      // id comes from newId and the URL from createObjectURL, so neither needs escaping.
      document.execCommand("insertHTML", false, `<img class="note-img" alt="" src="${imageUrl(id)}" data-img="${id}">`);
    } catch (error) {
      alert(`Saturn could not add that image: ${error.message}`);
    }
  };

  // Pasted or dropped text comes in as plain text. Foreign HTML never enters
  // the editor, so it can't carry scripts, tracking images or hidden markup.
  const insertForeign = (event, transfer) => {
    const file = [...(transfer?.files || [])].find((item) => item.type.startsWith("image/"));
    event.preventDefault();
    if (file) {
      if (event.type === "paste") captureRange();
      else insertRange.current = null;
      insertImage(file);
    } else {
      const text = transfer?.getData("text/plain");
      if (text) document.execCommand("insertText", false, text);
    }
  };

  const backlinks = backlinksTo(state.notes, note);

  return (
    <section id="screen-note">
      <button className="back-link" id="back-link" type="button" onClick={() => navigate("home")}>← All notes</button>
      <div className="eyebrow" id="note-eyebrow">Note · {editedLabel(note).replace("edited ", "")}</div>
      <input id="note-title" className="title-input" placeholder="Untitled note" aria-label="Note title" autoComplete="off"
        value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} />

      <div className="note-tools">
        <button id="save-note" className="pill pill-save" type="button" disabled={!dirty} onClick={saveDraft}>Save changes</button>
        <span id="save-status" className={`save-status${dirty ? " dirty" : ""}`}>{dirty ? "Unsaved changes" : "Saved"}</span>
        <span className="spacer" />
        {ai.button}
        <button id="delete-btn" className="pill pill-danger" type="button" onClick={() => removeNote(note.id)}>Delete</button>
      </div>

      <label className="form-label" htmlFor="note-tags">Tags</label>
      <input id="note-tags" className="field" placeholder="tags, comma, separated" autoComplete="off"
        value={draft.tagsText} onChange={(event) => updateDraft({ tagsText: event.target.value })} />

      <div className="pills edit-tools">
        <button id="fmt-bold" className="pill fmt" type="button" title="Bold" aria-label="Bold" {...format(() => document.execCommand("bold"))}><strong>B</strong></button>
        <button id="fmt-italic" className="pill fmt" type="button" title="Italic" aria-label="Italic" {...format(() => document.execCommand("italic"))}><em>I</em></button>
        <button id="fmt-heading" className="pill fmt" type="button" title="Heading" aria-label="Heading"
          {...format(() => document.execCommand("formatBlock", false, blockIsHeading() ? "<p>" : "<h2>"))}>H</button>
        <button id="fmt-list" className="pill fmt" type="button" title="Bulleted list" {...format(() => document.execCommand("insertUnorderedList"))}>• List</button>
        <button id="fmt-link" className="pill fmt" type="button" title="Link to another note" {...format(addLink)}>[[ link ]]</button>
        <button id="fmt-img" className="pill fmt" type="button" title="Insert an image" onMouseDown={(event) => event.preventDefault()}
          onClick={() => { captureRange(); fileRef.current.click(); }}>🖼 Image</button>
      </div>
      <input id="img-input" ref={fileRef} type="file" accept="image/*" hidden aria-label="Choose an image"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ""; // the same file can be picked again later
          if (file) insertImage(file);
        }} />

      <div id="rendered-body" ref={editorRef} className="note-card rendered rich-editor" contentEditable suppressContentEditableWarning
        role="textbox" aria-multiline="true" aria-label="Note body"
        data-placeholder="Start writing… use the buttons above to format, and [[ link ]] to connect notes."
        onInput={syncBody}
        onPaste={(event) => insertForeign(event, event.clipboardData)}
        onDrop={(event) => insertForeign(event, event.dataTransfer)}
        onClick={(event) => {
          const link = event.target.closest(".wiki-link");
          if (link) followWikiLink(link.dataset.link);
        }} />
      <ImageSizer editorRef={editorRef} onChange={syncBody} />

      {ai.panel}

      <div className="list-heading">Linked from</div>
      {backlinks.length > 0
        ? <div className="ledger" id="backlinks">{backlinks.map((item, index) => <NoteRow key={item.id} note={item} index={index} />)}</div>
        : <div className="empty small" id="no-backlinks">Nothing links here yet.</div>}
    </section>
  );
}
