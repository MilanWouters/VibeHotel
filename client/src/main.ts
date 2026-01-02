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
const objectLayer = new PIXI.Container();
const avatarLayer = new PIXI.Container();
world.addChild(tilesLayer, objectLayer, avatarLayer);

const tiles = new PIXI.Graphics();
tilesLayer.addChild(tiles);

function drawDiamond(g: PIXI.Graphics, x: number, y: number) {
  g.moveTo(x, y - TILE_H / 2);
  g.lineTo(x + TILE_W / 2, y);
  g.lineTo(x, y + TILE_H / 2);
  g.lineTo(x - TILE_W / 2, y);
  g.closePath();
}

function redrawTiles() {
  tiles.clear();
  const strokeColor = 0x000000;
  const strokeAlpha = 0.12;

  for (let gy = 0; gy < MAP_H; gy++) {
    for (let gx = 0; gx < MAP_W; gx++) {
      const s = gridToScreen({ x: gx, y: gy });
      const fillAlpha = ((gx + gy) % 2 === 0) ? 0.10 : 0.06;
      tiles.beginPath();
      drawDiamond(tiles, s.x, s.y);
      tiles.fill({ color: 0xffffff, alpha: fillAlpha });
      tiles.stroke({ width: 1, color: strokeColor, alpha: strokeAlpha });
    }
  }
}
redrawTiles();

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

function makeFurni(instanceId: string, typeId: string, gx: number, gy: number): FurniSprite {
  const def = catalog.find(c => c.id === typeId) || catalog[0];
  const container = new PIXI.Container();
  const body = new PIXI.Graphics();
  body.beginFill(def.color, 0.9);
  if (typeId.includes("chair")) {
    body.drawRoundedRect(-14, -24, 28, 24, 4);
    body.beginFill(def.color, 0.7);
    body.drawRect(-14, -34, 28, 10);
  } else if (typeId === "table_wood") {
    body.drawRoundedRect(-22, -26, 44, 12, 4);
    body.beginFill(def.color, 0.6);
    body.drawRect(-20, -14, 4, 14);
    body.drawRect(16, -14, 4, 14);
  } else {
    body.drawRoundedRect(-12, -28, 24, 28, 12);
  }
  body.endFill();

  body.eventMode = "static";
  body.cursor = "pointer";
  body.on("pointerdown", (e) => {
    e.stopPropagation();
    if (e.buttons === 2 || e.shiftKey) {
      net.send({ type: "pickup_furni", instanceId });
    }
  });

  container.addChild(body);
  const s = gridToScreen({ x: gx, y: gy });
  container.position.set(s.x, s.y);
  objectLayer.addChild(container);
  return { container, typeId, pos: { x: gx, y: gy } };
}

// --- Avatars ---
type Avatar = {
  container: PIXI.Container;
  body: PIXI.Graphics;
  label: PIXI.Text;
  target: Vec2;
  pos: Vec2;
};
const avatars = new Map<string, Avatar>();

function makeAvatar(u: UserState): Avatar {
  const container = new PIXI.Container();
  const body = new PIXI.Graphics();
  body.beginFill(0x000000, 0.18);
  body.drawCircle(0, 0, 14);
  body.endFill();

  const label = new PIXI.Text({
    text: u.name,
    style: new PIXI.TextStyle({ fontFamily: "Ubuntu", fontSize: 13, fill: 0xffffff, fontWeight: 'bold' })
  });
  label.anchor.set(0.5, 1.4);

  // Name tag background
  const tagBg = new PIXI.Graphics();
  tagBg.beginFill(0x000000, 0.4);
  tagBg.drawRoundedRect(-label.width / 2 - 4, -label.height - 18, label.width + 8, label.height + 4, 4);
  tagBg.endFill();

  container.addChild(tagBg, body, label);
  avatarLayer.addChild(container);

  return { container, body, label, pos: { x: u.x, y: u.y }, target: { x: u.x, y: u.y } };
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
  const s = gridToScreen(a.pos);
  a.container.position.set(s.x, s.y - 10);
  avatarLayer.children.sort((a, b) => a.y - b.y);
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
  bubble.textContent = text;
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
  bubble.style.top = `${s.y - 80}px`;
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
net.connect();

function onServerMsg(msg: ServerMsg) {
  if (msg.type === "welcome") {
    for (const [id] of avatars) removeAvatar(id);
    for (const [id, f] of furnis) { f.container.destroy(); furnis.delete(id); }
    for (const u of Object.values(msg.users)) {
      ensureAvatar(u);
      const a = avatars.get(u.id)!;
      a.pos = { x: u.x, y: u.y }; a.target = { x: u.x, y: u.y };
      a.label.text = u.name;
      updateAvatarVisual(u.id);
    }
    for (const obj of msg.roomObjects) furnis.set(obj.instanceId, makeFurni(obj.instanceId, obj.typeId, obj.x, obj.y));
    updateCredits(msg.credits);
    updateInventoryUI(msg.inventory);
    const myNameEl = document.getElementById("my-name-display")!;
    const me = msg.users[msg.id];
    if (me) myNameEl.textContent = me.name;
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

function updateCredits(val: number) { creditsEl.textContent = `${val} Credits`; }

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
  div.innerHTML = `<div class="item-icon" style="background: #${item.color.toString(16)}"></div><div class="item-name">${item.name}</div><div class="item-cost">${item.cost}C</div>`;
  div.onclick = () => net.send({ type: "buy_item", catalogId: item.id });
  catalogList.appendChild(div);
}

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
    panel.style.left = (e.clientX + offset.x) + "px"; panel.style.top = (e.clientY + offset.y) + "px"; panel.style.transform = "none";
  });
  document.addEventListener("mouseup", () => isDragging = false);
});
