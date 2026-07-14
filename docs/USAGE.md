# Using Saturn 🪐

Saturn is a linked-notes app: you write short notes, connect them with
`[[wiki links]]`, and watch your knowledge web grow. This guide covers every
feature, screen by screen.

---

## The sidebar

| Item | What it does |
|---|---|
| **Notes** | The home screen — your note list, search, and tag filters |
| **Tags** | Notes grouped by tag, each group with its own "how linked" ring |
| **Graph** | Your knowledge web as a map — notes are stars, links are threads |
| **Progress** | Stats: % linked, total links, orphans, per-tag breakdown |
| **Planner** | Kanban project boards — plan work in To do / In progress / Done columns |
| **Bin** | Deleted notes, shown as dead stars you can restore or remove forever |
| **＋ New note** | Opens the "Add a note" form |
| **Sign in with Google** | Optional Google login, if Firebase has been configured |
| **Light/Dark mode** | Toggles the theme (bottom of the sidebar; remembered between visits) |

---

## Creating a note

1. Click **＋ New note** in the sidebar.
2. Give it a title (required), optional comma-separated tags, and optional first lines.
3. Click **Add to Saturn**. The note opens in View mode.

You can also create notes *from links*: if a note contains `[[Some idea]]` and
no note with that title exists, the link renders dashed — clicking it offers to
create that note on the spot.

## Reading & editing a note

Open any note by clicking its row on the Notes screen. At the top you'll find:

- **The title** — click it and type to rename.
- **Formatting buttons** — Bold, Italic, Heading, • List, and [[ link ]] sit above the
  note body. Select text (or just place the cursor) and tap a button.
- **Tags field** — comma-separated, e.g. `physics, ideas`.
- **Save changes** — commits title, tags, and body changes.
- **Delete** — moves the note to the Dead Stars bin.

Changes are kept as a draft until you click **Save changes**. If you leave a
note with unsaved edits, Saturn asks whether to discard them.

## Deleting a note

You can delete notes in two places:

- On the Notes screen, click the **Delete** button at the end of a note row.
- On a note's detail screen, click **Delete** in the toolbar.

Saturn asks for confirmation before moving a note to the **Dead Stars** bin.
Deleting a note does not rewrite links in other notes; any `[[links]]` pointing
to it become dashed missing-note links.

## Restoring deleted notes

Open **Bin** in the sidebar. Deleted notes appear as dead-star rows.

- **Restore** brings a note back into your active notebook.
- **Delete forever** permanently removes it from the bin after confirmation.

## Writing & formatting

Notes are always shown styled — what you type is what you see. Use the
buttons above the note body to format:

| Button | Does |
|---|---|
| **B** | Bold the selected text |
| *I* | Italicize the selected text |
| H | Turn the current line into a heading (tap again to undo) |
| • List | Turn the current line(s) into a bulleted list |
| [[ link ]] | Turn the selected text into a link to another note (or ask for a title) |
| 🖼 Image | Add a picture to the note (you can also paste or drop one straight in) |

(Under the hood notes are still saved in a portable plain-text format, so
older notes and anything you paste keep working.)

### Images

Pictures are compressed automatically and stored **on the device you added
them from** — they don't count against your note storage, but they also
don't travel: opening the same note in another browser shows an "image not
on this device" placeholder instead (your text is never affected). Deleting
a note (and emptying it from the bin) cleans its images up automatically.

**Resizing:** tap an image in the editor and either pick a preset size
(25%, 50%, 75%, Full) or **drag the round handles on its right edge** to
any size you like — a badge shows the width while you drag. The choice is
saved with the note.

## Linking notes — the heart of Saturn

Write `[[Note title]]` anywhere in a note's body:

- **Solid underlined link** → that note exists; click to jump to it.
- **Dashed gray link** → no note has that title yet ("ghost link"); click to create it.
- Titles match **case-insensitively** — `[[my idea]]` links to "My Idea".

**Backlinks** appear automatically: at the bottom of every note, "Linked from"
lists all notes whose bodies link *to* it. You never maintain these by hand.

A note with no links in *and* no links out is an **orphan**. The rings
throughout the app show what fraction of your notes are connected — the goal
of a Zettelkasten is to keep orphans near zero.

## Graph screen

The **Graph** screen draws your whole knowledge web: every note is a star,
every `[[link]]` a thread between two stars. Bigger stars have more
connections; unconnected notes drift alone. Drag stars to rearrange the
map, and tap any star to open that note.

## Planner — kanban boards

The **Planner** screen holds your projects. Name a project and press
**Create** to open its board: three columns — **To do**, **In progress**,
**Done**.

- **＋ Add task** at the bottom of a column: type a title, press Enter
  (Esc cancels).
- **Move a task**: drag its ⠿ grip between or within columns — works with
  mouse and touch. On a phone, the board swipes one column at a time.
- **Open a task**: tap anywhere else on the card. The task panel lets you
  set status, a due date (overdue dates highlight on the card), priority
  (low / medium / high), tags, and notes. Task notes support
  `[[wiki links]]` — the preview links jump straight to your Saturn notes.
  Changes apply when you press **Save task**.
- **Rename a project** by editing the board title; **Delete project**
  removes it and its tasks (with a confirmation).

Planner data lives in the same place as your notes (this browser,
per-account when signed in).

## Finding notes

- **Search** (Notes screen) — live-filters by title *and* body text.
- **Tag pills** (Notes screen) — click a tag to filter; click again to clear.
- **Tags screen** — expand a tag group to see everything filed under it.
- **Recently edited** (Progress screen) — your last five touched notes.

## AI: Summarize & Ask Saturn

Both features need Google sign-in (and the server AI setup in `AI.md`):

- **✦ Summarize** — on the note toolbar. Streams an AI summary into a panel
  below the note; **Insert into note** appends it as an `## AI summary`
  section (click **Save changes** to keep it).
- **Ask Saturn** — the floating ✦ button (bottom-right). Type a question and
  press **Ask**; the answer is drawn only from your notes and references
  `[[Note titles]]` it used. To keep answers fast, Saturn sends the 12 notes
  most relevant to your question (matched by title, tags, and text) rather
  than your whole knowledge base. Signed-out visitors see the buttons disabled.

## Progress screen

- **Big ring** — percentage of notes that are linked into the web.
- **Links between notes** — total `[[link]]` count across all bodies.
- **Orphan notes** — how many notes are still unconnected.
- **By tag** — a bar per tag showing how linked that tag's notes are.

## Your data

- Notes are stored in your browser's **localStorage** under `saturn-pkm-notes`
  (theme choice under `saturn-pkm-theme`); signing in with Google switches to a
  per-account key on the same device. Notes do **not** sync between devices
  (cloud sync is planned but currently disabled).
- Using an AI feature sends the relevant notes to the Gemini API for that
  one request (see `AI.md`).
- Deleted notes are stored separately under `saturn-pkm-deleted-notes`.
- If Google sign-in is configured and you sign in, Saturn stores notes in a
  Google-user-specific localStorage key. This separates local notebooks by
  account, but it does not sync notes between devices.
- That means: no cloud sync — a different browser or device starts fresh, and
  clearing site data deletes your notes.
- **Backup tip:** open the browser devtools console and run
  `copy(localStorage.getItem('saturn-pkm-notes'))` to copy all notes as JSON.
  To restore: `localStorage.setItem('saturn-pkm-notes', '<paste>')` and reload.
  If you are signed in, use the localStorage key that starts with
  `saturn-pkm-notes:` instead.

## First run

On a fresh browser, Saturn seeds two small linked notes ("Welcome to Saturn"
and "How linking works") that demonstrate linking. Feel free to delete them.
