import * as PIXI from "pixi.js";
import { NetClient, type ServerMsg, type UserState } from "./net";
import { gridToScreen, screenToGrid, TILE_H, TILE_W, type Vec2 } from "./iso";

const MAP_W = 12;
const MAP_H = 12;

function clampGrid(x: number, y: number) {
  const cx = Math.max(0, Math.min(MAP_W - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(MAP_H - 1, Math.round(y)));
  return { x: cx, y: cy };
}

// --- Pixi setup ---
const app = new PIXI.Application();
await app.init({ resizeTo: window, backgroundAlpha: 0 });
document.getElementById("app")!.appendChild(app.canvas);

const world = new PIXI.Container();
app.stage.addChild(world);
const camera = { x: window.innerWidth / 2, y: 140 };
world.position.set(camera.x, camera.y);

const tilesLayer = new PIXI.Container();
const sortLayer = new PIXI.Container();
world.addChild(tilesLayer, sortLayer); // Walls are childAt(0)


const tiles = new PIXI.Graphics();
tilesLayer.addChild(tiles);

// --- Isometric Drawing Helpers ---
function drawIsoRect(g: PIXI.Graphics, x: number, y: number, w: number, h: number, color: number, height: number = 0) {
  // Top Face
  g.beginFill(color);
  g.moveTo(x, y - height);
  g.lineTo(x + w / 2, y + h / 2 - height);
  g.lineTo(x, y + h - height);
  g.lineTo(x - w / 2, y + h / 2 - height);
  g.closePath();
  g.endFill();

  // Right Face
  g.beginFill(params.shadeColor(color, -0.2)); // darker
  g.moveTo(x + w / 2, y + h / 2 - height);
  g.lineTo(x, y + h - height);
  g.lineTo(x, y + h); // bottom point
  g.lineTo(x + w / 2, y + h / 2);
  g.closePath();
  g.endFill();

  // Left Face
  g.beginFill(params.shadeColor(color, -0.4)); // darkest
  g.moveTo(x - w / 2, y + h / 2 - height);
  g.lineTo(x, y + h - height);
  g.lineTo(x, y + h);
  g.lineTo(x - w / 2, y + h / 2);
  g.closePath();
  g.endFill();
}

const params = {
  floorColor: 0x989865,
  wallColor: 0xb5b5b5,
  wallPatternColor: 0x999999,
  shadeColor: (col: number, percent: number) => {
    // simple darken
    const amt = Math.round(255 * percent);
    const R = (col >> 16) + amt;
    const G = (col >> 8 & 0x00FF) + amt;
    const B = (col & 0x0000FF) + amt;
    return (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1) as any as number;
  }
};

const wallLayer = new PIXI.Container();
world.addChildAt(wallLayer, 0); // Behind tiles

function redrawRoom() {
  tiles.clear();
  // Floor
  for (let gy = 0; gy < MAP_H; gy++) {
    for (let gx = 0; gx < MAP_W; gx++) {
      const s = gridToScreen({ x: gx, y: gy });
      // Thickness = 8
      drawIsoRect(tiles, s.x, s.y, TILE_W, TILE_H, params.floorColor, 0);

      // Tile Highlights
      tiles.lineStyle(1, 0x000000, 0.05);
      tiles.moveTo(s.x, s.y); tiles.lineTo(s.x + TILE_W / 2, s.y + TILE_H / 2);
      tiles.moveTo(s.x, s.y); tiles.lineTo(s.x - TILE_W / 2, s.y + TILE_H / 2);
      tiles.lineStyle(0);
    }
  }

  // Walls
  const wallH = 160;
  const wallG = new PIXI.Graphics();
  wallLayer.removeChildren();
  wallLayer.addChild(wallG);

  // Left Wall (along Y axis, at X=0)
  // Drawn from (0,0) to (0, MAP_H) screen coords? 
  // We need to draw segments.

  // Right Wall (along X=0..W, at Y=0)
  for (let i = 0; i < MAP_W; i++) {
    const s = gridToScreen({ x: i, y: 0 });
    // "Wall" is vertical plane.
    // Projecting a vertical rect in iso:
    // Bottom-Left: s.x - TILE_W/2, s.y
    // Bottom-Right: s.x, s.y + TILE_H/2
    // Top-Left: s.x - TILE_W/2, s.y - wallH
    // Top-Right: s.x, s.y + TILE_H/2 - wallH
    // NO, simplified:

    // Wall Segment visual placement is tricky. 
    // Let's just draw generic "faces".

    // Right wall segment (facing Left) at x=i, y=0.
    // Position is slightly offset to be "behind" the tile (0,0)

    // Let's simpler approach: Draw Wall Sprites? No, graphics.

    // Right Wall (Top Right side of room)
    // Start: (0,0) -> End: (MAP_W, 0)
    // Screen: (0,0) -> ...

    // We will draw it tile by tile to match depth if needed, but for back walls we can just draw one big shape?
    // No, easier loop.

    const x = s.x - TILE_W / 4;
    const y = s.y + TILE_H / 4;

    // Face facing South-West
    wallG.beginFill(0xbfbfbf);
    wallG.moveTo(s.x, s.y);
    wallG.lineTo(s.x + TILE_W / 2, s.y + TILE_H / 2); // bottom
    wallG.lineTo(s.x + TILE_W / 2, s.y + TILE_H / 2 - wallH); // right up
    wallG.lineTo(s.x, s.y - wallH); // top-left
    wallG.closePath();
    wallG.endFill();

    // Pattern
    wallG.beginFill(0x999999);
    wallG.drawRect(s.x + TILE_W / 2 - 4, s.y + TILE_H / 2 - wallH, 4, wallH); // strip
    wallG.endFill();
  }

  // Left Wall (Top Left side of room)
  for (let i = 0; i < MAP_H; i++) {
    const s = gridToScreen({ x: 0, y: i });

    // Face facing South-East
    wallG.beginFill(0xb0b0b0);
    wallG.moveTo(s.x, s.y);
    wallG.lineTo(s.x - TILE_W / 2, s.y + TILE_H / 2); // bottom
    wallG.lineTo(s.x - TILE_W / 2, s.y + TILE_H / 2 - wallH); // left up
    wallG.lineTo(s.x, s.y - wallH); // top-right
    wallG.closePath();
    wallG.endFill();
  }
}
redrawRoom();

// --- Furniture Rendering ---
type FurniDef = { id: string, name: string, cost: number, color: number };
const catalog: FurniDef[] = [
  { id: "chair_red", name: "Red Chair", cost: 5, color: 0xff4444 },
  { id: "chair_blue", name: "Blue Chair", cost: 5, color: 0x4444ff },
  { id: "table_wood", name: "Wooden Table", cost: 15, color: 0xaa8866 },
  { id: "plant_green", name: "Small Plant", cost: 10, color: 0x44aa44 },
];

type FurniSprite = { container: PIXI.Container; typeId: string; pos: Vec2 };
const furnis = new Map<string, FurniSprite>();

const furnitureTextures = new Map<string, PIXI.Texture>();

function getFurniTexture(typeId: string, color: number): PIXI.Texture {
  const key = typeId + color;
  if (furnitureTextures.has(key)) return furnitureTextures.get(key)!;

  const g = new PIXI.Graphics();

  // Helper to draw 3D box
  const box = (x: number, y: number, w: number, h: number, z: number, col: number) => {
    // Top
    g.beginFill(col);
    g.moveTo(x, y - z);
    g.lineTo(x + w / 2, y + h / 2 - z);
    g.lineTo(x, y + h - z);
    g.lineTo(x - w / 2, y + h / 2 - z);
    g.endFill();

    // Right
    g.beginFill(params.shadeColor(col, -0.2));
    g.moveTo(x + w / 2, y + h / 2 - z);
    g.lineTo(x, y + h - z);
    g.lineTo(x, y + h);
    g.lineTo(x + w / 2, y + h / 2);
    g.endFill();

    // Left
    g.beginFill(params.shadeColor(col, -0.3));
    g.moveTo(x - w / 2, y + h / 2 - z);
    g.lineTo(x, y + h - z);
    g.lineTo(x, y + h);
    g.lineTo(x - w / 2, y + h / 2);
    g.endFill();
  };

  if (typeId.includes("chair")) {
    // Legs
    const legC = 0x888888;
    // 4 legs
    // Back Left (-8, -8) relative to center?
    // Let's approximate.
    // Base seat height = 15

    // Seat
    box(0, 0, 24, 12, 14, color);
    // Backrest
    box(-2, -6, 4, 12, 34, params.shadeColor(color, 0.1));

  } else if (typeId === "table_wood") {
    // Table top
    box(0, 0, 48, 24, 18, color);
    // Leg
    box(0, 5, 10, 5, 18, 0x553311);
  } else {
    // Plant/Default
    box(0, 0, 16, 8, 8, 0x552200); // pot
    g.beginFill(0x22aa22);
    g.drawCircle(0, -25, 12);
    g.endFill();
  }

  const tex = app.renderer.generateTexture(g);
  furnitureTextures.set(key, tex);
  return tex;
}

// Old makeFurni removed

// --- Avatars ---
type Avatar = {
  container: PIXI.Container;
  body: PIXI.Graphics;
  label: PIXI.Text;
  target: Vec2;
  pos: Vec2;
  color: number;
};
const avatars = new Map<string, Avatar>();

function makeAvatar(u: UserState): Avatar {
  const container = new PIXI.Container();
  const body = new PIXI.Graphics();

  // Shadow
  body.beginFill(0x000000, 0.2);
  body.drawEllipse(0, 0, 14, 8);
  body.endFill();

  // Body
  body.beginFill(u.color ?? 0xffffff);
  body.lineStyle(2, 0x000000, 1);
  body.drawRect(-10, -32, 20, 32);
  body.endFill();

  // Head
  body.beginFill(0xffccaa);
  body.lineStyle(2, 0x000000, 1);
  body.drawRect(-8, -44, 16, 16);
  body.endFill();


  const label = new PIXI.Text({
    text: u.name,
    style: new PIXI.TextStyle({ fontFamily: "VT323", fontSize: 18, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } })
  });
  label.anchor.set(0.5, 1.0);
  label.y = -50;


  container.addChild(body, label);
  sortLayer.addChild(container);


  return { container, body, label, pos: { x: u.x, y: u.y }, target: { x: u.x, y: u.y }, color: u.color };
}

function ensureAvatar(u: UserState) {
  if (avatars.has(u.id)) return;
  avatars.set(u.id, makeAvatar(u));
}

function removeAvatar(id: string) {
  const a = avatars.get(id);
  if (!a) return;
  a.container.destroy({ children: true });
  avatars.delete(id);
}

function setTarget(id: string, x: number, y: number) {
  const a = avatars.get(id);
  if (!a) return;
  a.target = { x, y };
}

function updateAvatarVisual(id: string) {
  const a = avatars.get(id);
  if (!a) return;
  if (!a) return;
  const s = gridToScreen(a.pos);
  a.container.position.set(s.x, s.y);
  // Z-sort handled in ticker

}

app.ticker.add((ticker) => {
  const dt = ticker.deltaTime / 60;
  const speed = 4.5;
  for (const [id, a] of avatars) {
    const dx = a.target.x - a.pos.x;
    const dy = a.target.y - a.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.01) {
      const step = Math.min(dist, speed * dt);
      a.pos.x += (dx / dist) * step;
      a.pos.y += (dy / dist) * step;
      updateAvatarVisual(id);
    } else {
      a.pos.x = a.target.x; a.pos.y = a.target.y;
      updateAvatarVisual(id);
    }
  }

  // Global Depth Sort
  sortLayer.children.sort((a, b) => {
    return a.y - b.y;
  });
});

// Click to move
app.stage.eventMode = "static";
app.stage.hitArea = app.screen;
app.stage.on("pointerdown", (ev) => {
  const local = world.toLocal(ev.global);
  const g = screenToGrid(local);
  const c = clampGrid(g.x, g.y);
  net.send({ type: "move", x: c.x, y: c.y });
});

// --- Chat Bubbles ---
const chatLayer = document.getElementById("chat-layer")!;
function spawnChatBubble(avatarId: string, text: string) {
  const a = avatars.get(avatarId);
  if (!a) return;
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.textContent = `${a.label.text}: ${text}`;
  chatLayer.appendChild(bubble);
  updateBubblePos(a, bubble);
  setTimeout(() => {
    bubble.style.opacity = "0";
    setTimeout(() => bubble.remove(), 200);
  }, 5000);
  (bubble as any).avatarId = avatarId;
}

function updateBubblePos(a: Avatar, bubble: HTMLElement) {
  const s = world.toGlobal(a.container.position);
  bubble.style.left = `${s.x}px`;
  bubble.style.top = `${s.y - 70}px`;
}

app.ticker.add(() => {
  const bubbles = document.querySelectorAll(".chat-bubble");
  bubbles.forEach(b => {
    const a = avatars.get((b as any).avatarId);
    if (a) updateBubblePos(a, b as HTMLElement);
    else b.remove();
  });
});

// --- Networking ---
const wsUrl = `ws://localhost:9091`;
const net = new NetClient(wsUrl, onServerMsg, (s) => {
  const statusEl = document.getElementById("status")!;
  statusEl.textContent = s;
});

// Login Logic
let myName = "Guest";
let myColor = 0xffffff;

const overlay = document.getElementById("login-overlay")!;
const nameInput = document.getElementById("login-name") as HTMLInputElement;
const loginBtn = document.getElementById("login-btn")!;
const colorOpts = document.querySelectorAll(".color-opt");

colorOpts.forEach((opt: any) => {
  opt.onclick = () => {
    colorOpts.forEach(o => o.classList.remove("selected"));
    opt.classList.add("selected");
    myColor = parseInt(opt.dataset.color);
  };
});

loginBtn.onclick = () => {
  myName = nameInput.value.trim() || "Guest";
  overlay.classList.add("hidden");
  net.connect();
};


function onServerMsg(msg: ServerMsg) {
  if (msg.type === "welcome") {
    // Send join IMMEDIATELY after welcome
    net.send({ type: "join", name: myName, color: myColor });

    for (const [id] of avatars) removeAvatar(id);
    for (const [id, f] of furnis) { f.container.destroy(); furnis.delete(id); }

    // wait for update? actually welcome has users... but they might not be initialized with my latest data yet?
    // actually join triggers broadcast.

    // Render existing
    for (const u of Object.values(msg.users)) {
      if (u.id !== msg.id) ensureAvatar(u); // Don't render self yet, wait for my join ack? No, render all.
      else ensureAvatar({ ...u, name: myName, color: myColor }); // Optimistic?
    }

    // We can just rely on the existing list but we want to make sure we are updated.
    // The server doesn't broadacst 'join' for ME on my connection? 
    // Usually welcome sends the state.
    // Let's just process the welcome state.

    updateCredits(msg.credits);
    updateInventoryUI(msg.inventory);

    const myNameEl = document.getElementById("my-name-display")!;
    myNameEl.textContent = myName;
    return;
  }
  if (msg.type === "user_joined") { ensureAvatar(msg.user); return; }
  if (msg.type === "user_left") { removeAvatar(msg.id); return; }
  if (msg.type === "user_moved") { setTarget(msg.id, msg.x, msg.y); return; }
  if (msg.type === "chat") { spawnChatBubble(msg.id, msg.text); return; }
  if (msg.type === "update_credits") { updateCredits(msg.credits); return; }
  if (msg.type === "sync_inventory") { updateInventoryUI(msg.items); return; }
  if (msg.type === "furni_placed") { furnis.set(msg.object.instanceId, makeFurni(msg.object.instanceId, msg.object.typeId, msg.object.x, msg.object.y)); return; }
  if (msg.type === "furni_picked_up") {
    const f = furnis.get(msg.instanceId);
    if (f) { f.container.destroy(); furnis.delete(msg.instanceId); }
    return;
  }
}

// --- UI Logic ---
const creditsEl = document.getElementById("credits-display")!;
const shopPanel = document.getElementById("shop-panel")!;
const invPanel = document.getElementById("inventory-panel")!;
const catalogList = document.getElementById("catalog-list")!;
const inventoryList = document.getElementById("inventory-list")!;
const chatInput = document.getElementById("chat") as HTMLInputElement;

function updateCredits(val: number) { creditsEl.textContent = `${val} CR`; }

function updateInventoryUI(items: any[]) {
  inventoryList.innerHTML = "";
  for (const item of items) {
    const def = catalog.find(c => c.id === item.typeId)!;
    const div = document.createElement("div");
    div.className = "item-card";
    div.innerHTML = `<div class="item-icon" style="background: #${def.color.toString(16)}"></div><div class="item-name">${item.name}</div>`;
    div.onclick = () => {
      const me = avatars.get(net.myId!)!;
      net.send({ type: "place_item", itemId: item.id, x: Math.round(me.pos.x), y: Math.round(me.pos.y) });
      invPanel.classList.add("hidden");
    };
    inventoryList.appendChild(div);
  }
}

catalogList.innerHTML = "";
for (const item of catalog) {
  const div = document.createElement("div");
  div.className = "item-card";
  div.innerHTML = `<div class="item-icon" style="background: #${item.color.toString(16)}"></div><div class="item-name">${item.name}</div><div class="item-cost">${item.cost}</div>`;
  div.onclick = () => net.send({ type: "buy_item", catalogId: item.id });
  catalogList.appendChild(div);
}

// --- Music ---
import { AudioEngine } from "./audio";
const audio = new AudioEngine();
const musicBtn = document.getElementById("toggle-music")!;
musicBtn.onclick = () => {
  const playing = audio.toggle();
  musicBtn.textContent = playing ? "🎵 ON" : "🎵 OFF";
  musicBtn.style.background = playing ? "#4caf50" : "#ddd";
  musicBtn.style.color = playing ? "#fff" : "#000";
};

// --- Selection State ---
let selectedFurniId: string | null = null;
const selectionHighlight = new PIXI.Graphics();
sortLayer.addChild(selectionHighlight); // Add to sort layer so it z-sorts? No, overlay.
world.addChild(selectionHighlight);


function updateSelectionVisual() {
  selectionHighlight.clear();
  if (!selectedFurniId) return;
  const f = furnis.get(selectedFurniId);
  if (!f) { selectedFurniId = null; return; }

  const s = gridToScreen(f.pos);
  selectionHighlight.lineStyle(2, 0xffff00, 1); // Yellow selection
  // Draw bracket around base
  selectionHighlight.drawRect(s.x - 20, s.y - 10, 40, 20);
  // Animate?
}

app.ticker.add(() => {
  if (selectedFurniId) updateSelectionVisual();
});

// Update makeFurni to handle selection
// Update makeFurni to handle selection
function makeFurni(instanceId: string, typeId: string, gx: number, gy: number): FurniSprite {
  const def = catalog.find(c => c.id === typeId) || catalog[0];
  const container = new PIXI.Container();

  // Use texture for performance + consistent look
  const tex = getFurniTexture(typeId, def.color);
  const sprite = new PIXI.Sprite(tex);
  sprite.anchor.set(0.5, 0.75); // Anchor at bottom-ish center

  sprite.eventMode = "static";
  sprite.cursor = "pointer";

  // Larger Hit Area to ensure easier clicking
  sprite.hitArea = new PIXI.Rectangle(-20, -60, 40, 60);

  sprite.on("pointerdown", (e) => {
    e.stopPropagation(); // Stop stage click
    if (e.buttons === 2 || e.shiftKey) {
      net.send({ type: "pickup_furni", instanceId });
      document.getElementById("status")!.textContent = "Picked up " + def.name;
    } else {
      // Select
      selectedFurniId = instanceId;
      updateSelectionVisual(); // Immediate update
      document.getElementById("status")!.textContent = "Selected: " + def.name + " (Click floor to move)";
      console.log("Selected", instanceId);
    }
  });

  container.addChild(sprite);
  const s = gridToScreen({ x: gx, y: gy });
  container.position.set(s.x, s.y);

  // Tag as sortable
  (container as any).zOrder = s.y;
  sortLayer.addChild(container);

  return { container, typeId, pos: { x: gx, y: gy } };
}

// Click to move (UPDATED)
app.stage.eventMode = "static";
app.stage.hitArea = app.screen;
app.stage.on("pointerdown", (ev) => {
  const local = world.toLocal(ev.global);
  const g = screenToGrid(local);
  const c = clampGrid(g.x, g.y);

  if (selectedFurniId) {
    // Attempt move
    net.send({ type: "move_furni", instanceId: selectedFurniId, x: c.x, y: c.y });
    document.getElementById("status")!.textContent = "Moved furniture";
    selectedFurniId = null;
    selectionHighlight.clear();
  } else {
    net.send({ type: "move", x: c.x, y: c.y });
    document.getElementById("status")!.textContent = "Moving...";
  }
});



document.getElementById("toggle-shop")!.onclick = () => { shopPanel.classList.toggle("hidden"); invPanel.classList.add("hidden"); };
document.getElementById("toggle-inv")!.onclick = () => { invPanel.classList.toggle("hidden"); shopPanel.classList.add("hidden"); };
document.querySelectorAll(".close-btn").forEach(btn => btn.addEventListener("click", () => btn.closest(".panel")?.classList.add("hidden")));

chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { net.send({ type: "chat", text: chatInput.value.trim() }); chatInput.value = ""; } });

document.querySelectorAll(".panel-header").forEach(header => {
  let isDragging = false; let offset = { x: 0, y: 0 };
  const panel = (header as HTMLElement).parentElement as HTMLElement;
  header.addEventListener("mousedown", (e: any) => { isDragging = true; offset = { x: panel.offsetLeft - e.clientX, y: panel.offsetTop - e.clientY }; });
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    panel.style.left = (e.clientX + offset.x) + "px"; panel.style.top = (e.clientY + offset.y) + "px"; panel.style.transform = "translate(0,0)";
  });
  document.addEventListener("mouseup", () => isDragging = false);
});
