(function () {
  'use strict';

  // Preview-only paths. A game client must consume authoritative map rules.
  // Collider coordinates are ground footprints relative to an object's foot anchor.
  // Expand by actor radius so the visible body does not clip trunks/walls.
  function groundMask(width, height, objects, colliders, radius = 3) {
    const mask = new Uint8Array(width * height).fill(1);
    for (const o of objects) {
      const c = colliders[o.kind];
      if (!c || o.removed) continue;
      const [left, top, right, bottom] = c;
      for (let y = Math.max(0, o.y + top - radius); y <= Math.min(height-1, o.y + bottom + radius); y++)
        for (let x = Math.max(0, o.x + left - radius); x <= Math.min(width-1, o.x + right + radius); x++) mask[y*width+x]=0;
    }
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x<radius||y<radius||x>=width-radius||y>=height-radius)mask[y*width+x]=0;
    return mask;
  }

  function createGrid(mask, width, height, cell = 4) {
    const cols = Math.ceil(width / cell), rows = Math.ceil(height / cell);
    const pass = new Uint8Array(cols * rows);
    const center = index => ({ x: index % cols * cell + cell / 2, y: Math.floor(index / cols) * cell + cell / 2 });
    for (let i = 0; i < pass.length; i++) {
      const p = center(i);
      pass[i] = p.x < width && p.y < height && mask[p.y * width + p.x] ? 1 : 0;
    }
    return { cols, rows, cell, pass, center };
  }

  function closest(grid, point) {
    let best = -1, distance = Infinity;
    for (let i = 0; i < grid.pass.length; i++) {
      if (!grid.pass[i]) continue;
      const p = grid.center(i), d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
      if (d < distance) { distance = d; best = i; }
    }
    return best;
  }

  function path(grid, from, to) {
    const start = closest(grid, from), goal = closest(grid, to);
    if (start < 0 || goal < 0) return null;
    const parent = new Int32Array(grid.pass.length).fill(-1);
    const queue = new Int32Array(grid.pass.length);
    queue[0] = start; parent[start] = start;
    let head = 0, tail = 1;
    const steps = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    while (head < tail && parent[goal] < 0) {
      const i = queue[head++], x = i % grid.cols, y = Math.floor(i / grid.cols);
      for (const [dx, dy] of steps) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
        const next = ny * grid.cols + nx;
        if (!grid.pass[next] || parent[next] >= 0) continue;
        if (dx && dy && (!grid.pass[y * grid.cols + nx] || !grid.pass[ny * grid.cols + x])) continue;
        parent[next] = i; queue[tail++] = next;
      }
    }
    if (parent[goal] < 0) return null;
    const indexes = [goal];
    while (indexes[indexes.length - 1] !== start) indexes.push(parent[indexes[indexes.length - 1]]);
    indexes.reverse();
    const points = indexes.map(grid.center), simplified = [];
    for (let i = 0; i < points.length; i++) {
      if (i > 0 && i < points.length - 1) {
        const a = points[i - 1], b = points[i], c = points[i + 1];
        if (Math.sign(b.x-a.x) === Math.sign(c.x-b.x) && Math.sign(b.y-a.y) === Math.sign(c.y-b.y)) continue;
      }
      simplified.push(points[i]);
    }
    return { points: simplified, index: 0, x: from.x, y: from.y, distance: 0, expanded: head };
  }

  function step(actor, route, elapsedMs, speed = 65) {
    let budget = Math.max(0, Math.min(80, elapsedMs)) * speed / 1000;
    while (budget > 0 && route.index < route.points.length) {
      const goal = route.points[route.index], dx = goal.x - route.x, dy = goal.y - route.y;
      const distance = Math.hypot(dx, dy);
      if (distance < .001) { route.index++; continue; }
      const moved = Math.min(distance, budget);
      route.x += dx / distance * moved; route.y += dy / distance * moved;
      route.distance += moved; budget -= moved;
      if (Math.abs(dx) > .1) actor.facing = dx < 0 ? 'left' : 'right';
      if (moved === distance) route.index++;
    }
    actor.x = Math.round(route.x); actor.y = Math.round(route.y);
    return route.index < route.points.length;
  }

  window.ArtMotion = { groundMask, createGrid, path, step };
})();
