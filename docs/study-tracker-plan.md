# Study Tracker — Build Plan

A personal app to plan, organize, and analyze everything you need to study: school work, software to learn, tech certifications, and creative/content work.

Built with **HTML, CSS, and JavaScript only**. Designed for a beginner — each phase teaches exactly what the next one needs.

---

## Core Idea (read this first)

Strip away the fancy stuff and the whole app is one thing:

> A list of study items — each with a **category**, a **priority**, and a **deadline** — plus a way to see what to focus on **right now**.

Everything else (school, certs, creative work) is just a *category* of the same item. Build the core once, and the rest is variation.

**Golden rule:** Don't build the whole vision at once. Finish Phase 1–3 first — that alone is a usable app. Then expand.

---

## The Data Model

Every study item is just a JavaScript object:

```javascript
{
  id: 1,
  title: "Finish React course",
  category: "software",     // school | software | certification | creative
  priority: "high",         // high | medium | low
  dueDate: "2026-07-15",
  done: false
}
```

Your entire app is:
1. An **array** of these objects
2. **Saved** to localStorage
3. **Displayed** on screen
4. **Sorted / filtered** on demand

That's it. Hold this picture in your head the whole way through.

---

## Phase 1 — Static Structure (HTML + CSS only)

**Goal:** Build the page with zero interactivity. Get comfortable with layout first.

- [ ] Create `index.html`, `style.css`, `script.js`
- [ ] Add a header/title
- [ ] Add an input area: a text box for the title, a dropdown for category, a dropdown for priority, a date input, and an "Add" button
- [ ] Add an empty list area below where items will appear
- [ ] Style it with CSS so it looks clean (use **flexbox** for layout)

**You'll learn:** HTML elements, forms, inputs, basic CSS, flexbox.

---

## Phase 2 — Add Items with JavaScript

**Goal:** Make the "Add" button actually create an item on the page.

- [ ] Read the values from the inputs when "Add" is clicked
- [ ] Create an item object (see data model above)
- [ ] Push it into an array
- [ ] Display it in the list area on screen
- [ ] Clear the inputs after adding

**You'll learn:** variables, functions, arrays, objects, `querySelector`, `addEventListener`, creating and appending DOM elements. **This is the heart of JavaScript.**

---

## Phase 3 — Make It Persist

**Goal:** Stop losing everything on refresh. This is what turns a toy into a real tool.

- [ ] Save the array to `localStorage` every time it changes (`JSON.stringify`)
- [ ] Load the array from `localStorage` when the page opens (`JSON.parse`)
- [ ] Re-display all saved items on load

**You'll learn:** `localStorage`, JSON, saving/loading data.

> ✅ **Stop here and celebrate.** Phases 1–3 give you a working study tracker you'll actually use. Everything below is enhancement.

---

## Phase 4 — "What Should I Study Now?" Logic

**Goal:** This is your app's real value — telling you what to focus on.

- [ ] Add a "done" checkbox to each item
- [ ] Add a delete button to each item
- [ ] Sort items so the most urgent float to the top (soonest deadline + highest priority)
- [ ] Add filter buttons to view one category at a time (school / software / certification / creative)
- [ ] Add an "all" filter to see everything

**You'll learn:** array methods — `filter`, `sort`, `map`. These power every organizing and analyzing feature.

**Sorting hint:** convert priority to a number (high=3, medium=2, low=1), then sort by date first, priority second.

---

## Phase 5 — Polish & Analyze

**Goal:** Make it feel finished. Only after the core is rock solid.

- [ ] Progress counter ("3 of 8 done this week")
- [ ] Color-code items by category
- [ ] A simple weekly view (items due in the next 7 days)
- [ ] Highlight overdue items in red
- [ ] Optional: a streak counter for daily consistency

**You'll learn:** working with dates, conditional styling, deriving stats from your array.

---

## What to Learn, In Order

Follow this sequence — each builds on the last:

1. **HTML** — elements, forms, inputs
2. **CSS** — flexbox, basic styling
3. **JS basics** — variables, functions, arrays, objects
4. **DOM manipulation** — `querySelector`, `addEventListener`, creating elements
5. **localStorage** — saving/loading JSON
6. **Array methods** — `filter`, `sort`, `map`

---

## Progress Tracker

| Phase | What it does | Status |
|-------|--------------|--------|
| 1 | Static page layout | ⬜ Not started |
| 2 | Add items with JS | ⬜ Not started |
| 3 | Save to localStorage | ⬜ Not started |
| 4 | Sort, filter, "study now" | ⬜ Not started |
| 5 | Polish & analytics | ⬜ Not started |

Update the status as you go: ⬜ Not started → 🟡 In progress → ✅ Done

---

## Tips for Staying Unstuck

- **Build one checkbox item at a time.** Don't move to the next until the current one works.
- **Console.log everything.** When something breaks, print your variables to see what's actually happening.
- **Refresh often.** Save your file and reload the browser after every small change.
- **Don't copy-paste blindly.** Type the code yourself — it's slower but you'll actually learn it.
- **It's okay if it's ugly at first.** Working and ugly beats pretty and broken.
