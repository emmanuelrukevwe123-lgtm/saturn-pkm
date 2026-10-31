import { useEffect, useRef } from "react";
import { sameId } from "../lib/domain.js";
import { findByTitle, linksIn } from "../lib/notes.js";
import { useApp } from "../AppContext.jsx";

/* Hand-rolled canvas simulation: notes repel each other, [[links]] pull their
   two notes together, and everything drifts toward the center. */

function buildGraph(notes) {
  const jitter = () => (Math.random() - 0.5) * 30;
  const nodes = notes.map((note, index) => {
    const angle = (index / Math.max(notes.length, 1)) * Math.PI * 2;
    return {
      id: note.id, title: note.title, vx: 0, vy: 0, deg: 0, r: 6,
      x: Math.cos(angle) * 140 + jitter(), y: Math.sin(angle) * 140 + jitter(),
    };
  });
  const indexOf = new Map(nodes.map((node, index) => [String(node.id), index]));
  const seen = new Set();
  const edges = [];
  for (const note of notes) {
    for (const title of linksIn(note.body)) {
      const target = findByTitle(notes, title);
      if (!target || sameId(target.id, note.id)) continue;
      const key = [String(note.id), String(target.id)].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      const a = indexOf.get(String(note.id));
      const b = indexOf.get(String(target.id));
      edges.push([a, b]);
      nodes[a].deg += 1;
      nodes[b].deg += 1;
    }
  }
  for (const node of nodes) node.r = 6 + Math.min(node.deg, 6) * 1.6;
  return { nodes, edges };
}

function step({ nodes, edges }, dragged) {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let distance2 = dx * dx + dy * dy;
      if (distance2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; distance2 = 1; }
      const force = 5200 / distance2;
      const distance = Math.sqrt(distance2);
      a.vx += (dx / distance) * force; a.vy += (dy / distance) * force;
      b.vx -= (dx / distance) * force; b.vy -= (dy / distance) * force;
    }
  }
  for (const [i, j] of edges) {
    const a = nodes[i];
    const b = nodes[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = (distance - 120) * 0.02;
    a.vx += (dx / distance) * force; a.vy += (dy / distance) * force;
    b.vx -= (dx / distance) * force; b.vy -= (dy / distance) * force;
  }
  for (const node of nodes) {
    if (node === dragged) { node.vx = 0; node.vy = 0; continue; }
    node.vx -= node.x * 0.015; node.vy -= node.y * 0.015;
    node.vx *= 0.85; node.vy *= 0.85;
    node.x += node.vx; node.y += node.vy;
  }
}

function draw(canvas, { nodes, edges }, hot) {
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
    canvas.width = width * ratio;
    canvas.height = height * ratio;
  }
  const styles = getComputedStyle(document.body);
  const color = (name) => styles.getPropertyValue(name).trim();
  const [ink, muted, line, surface] = ["--ink", "--muted", "--line", "--surface"].map(color);
  context.setTransform(ratio, 0, 0, ratio, (ratio * width) / 2, (ratio * height) / 2);
  context.clearRect(-width / 2, -height / 2, width, height);
  context.lineWidth = 1.2;
  for (const [i, j] of edges) {
    const a = nodes[i];
    const b = nodes[j];
    context.strokeStyle = hot && (a === hot || b === hot) ? ink : line;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }
  const showLabels = nodes.length <= 60;
  for (const node of nodes) {
    context.beginPath();
    context.arc(node.x, node.y, node.r, 0, Math.PI * 2);
    context.fillStyle = ink;
    context.fill();
    if (node === hot) {
      context.strokeStyle = ink;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(node.x, node.y, node.r + 4, 0, Math.PI * 2);
      context.stroke();
      context.lineWidth = 1.2;
    }
    if (showLabels || node === hot) {
      const label = node.title.length > 20 ? `${node.title.slice(0, 19)}…` : node.title;
      context.font = "600 11px Quicksand, sans-serif";
      context.textAlign = "center";
      context.strokeStyle = surface; // a halo keeps labels readable over edges
      context.lineWidth = 3;
      context.strokeText(label, node.x, node.y + node.r + 14);
      context.lineWidth = 1.2;
      context.fillStyle = node === hot ? ink : muted;
      context.fillText(label, node.x, node.y + node.r + 14);
    }
  }
}

export function GraphScreen() {
  const { state, openNote } = useApp();
  const { notes } = state;
  const canvasRef = useRef(null);
  const openRef = useRef(openNote);
  openRef.current = openNote;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const graph = buildGraph(notes);
    let heat = 300;
    let hot = null;
    let dragged = null;
    let frame = requestAnimationFrame(function loop() {
      if (heat > 0) { step(graph, dragged); heat -= 1; }
      draw(canvas, graph, hot);
      frame = requestAnimationFrame(loop);
    });

    const point = (event) => {
      const box = canvas.getBoundingClientRect();
      return { x: event.clientX - box.left - box.width / 2, y: event.clientY - box.top - box.height / 2 };
    };
    const nodeAt = (position) => {
      let best = null;
      let bestDistance = Infinity;
      for (const node of graph.nodes) {
        const distance = Math.hypot(node.x - position.x, node.y - position.y);
        if (distance < Math.max(node.r + 8, 16) && distance < bestDistance) { best = node; bestDistance = distance; }
      }
      return best;
    };
    const onDown = (event) => {
      dragged = nodeAt(point(event));
      if (!dragged) return;
      dragged.moved = false;
      canvas.setPointerCapture(event.pointerId);
    };
    const onMove = (event) => {
      const position = point(event);
      if (dragged) {
        dragged.x = position.x;
        dragged.y = position.y;
        dragged.moved = true;
        heat = Math.max(heat, 60); // lets neighbours settle around the new spot
        return;
      }
      hot = nodeAt(position);
      canvas.style.cursor = hot ? "pointer" : "default";
    };
    const onUp = (event) => {
      if (!dragged) return;
      const node = dragged;
      dragged = null;
      canvas.releasePointerCapture(event.pointerId);
      if (!node.moved) openRef.current(node.id);
    };
    const onLeave = () => { hot = null; };
    const onResize = () => { heat = Math.max(heat, 30); };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", onResize);
    };
  }, [notes]);

  return (
    <section id="screen-graph">
      <div className="eyebrow">Your web</div>
      <h1 className="page-title tight">Graph</h1>
      <p className="page-sub">Every note is a star and every [[link]] is a thread between them. Drag the stars around, or tap one to open that note.</p>
      {notes.length > 0 && <div className="graph-card"><canvas id="graph-canvas" ref={canvasRef} aria-hidden="true" /></div>}
      <div className="graph-alternative" aria-label="Textual note connections">
        <div className="list-heading">Connections</div>
        <ul id="graph-text">
          {notes.map((note) => {
            const targets = linksIn(note.body).filter((title) => findByTitle(notes, title));
            return <li key={note.id}>{targets.length ? `${note.title} links to ${targets.join(", ")}` : `${note.title} has no outgoing links`}</li>;
          })}
        </ul>
      </div>
      {notes.length === 0 && <div className="empty" id="graph-empty">Nothing to map yet — connect two notes with [[double brackets]].</div>}
    </section>
  );
}
