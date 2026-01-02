import http from "node:http";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import type { ClientMsg, ServerMsg, UserState } from "./protocol.js";

const PORT = Number(process.env.PORT ?? 9091);

// Simple in-memory state
type Conn = { ws: WebSocket; id: string };
const conns = new Map<string, Conn>();
const users = new Map<string, UserState>();

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

function send(ws: WebSocket, msg: ServerMsg) {
  ws.send(JSON.stringify(msg));
}

function broadcast(msg: ServerMsg, exceptId?: string) {
  const raw = JSON.stringify(msg);
  for (const [id, c] of conns) {
    if (exceptId && id === exceptId) continue;
    c.ws.send(raw);
  }
}


// Basic tile map bounds
const MAP_W = 12;
const MAP_H = 12;

// --- Game State ---
type Item = { id: string; typeId: string; name: string };
type RoomObject = { instanceId: string; typeId: string; x: number; y: number };
type CatalogItem = { id: string; name: string; cost: number; color: number };

const catalog: CatalogItem[] = [
  { id: "chair_red", name: "Red Chair", cost: 5, color: 0xff4444 },
  { id: "chair_blue", name: "Blue Chair", cost: 5, color: 0x4444ff },
  { id: "table_wood", name: "Wooden Table", cost: 15, color: 0xaa8866 },
  { id: "plant_green", name: "Small Plant", cost: 10, color: 0x44aa44 },
];

const userCredits = new Map<string, number>();
const userInventories = new Map<string, Item[]>();
const roomObjects: RoomObject[] = [];

function clampGrid(x: number, y: number) {
  const cx = Math.max(0, Math.min(MAP_W - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(MAP_H - 1, Math.round(y)));
  return { x: cx, y: cy };
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  const id = uid();
  conns.set(id, { ws, id });

  // Initialize player
  const user: UserState = { id, name: "Guest", color: 0xFFFFFF, x: 5, y: 5 };
  users.set(id, user);
  userCredits.set(id, 100); // Starter credits
  userInventories.set(id, []);

  // Welcome contains current users AND game state
  send(ws, {
    type: "welcome",
    id,
    users: Object.fromEntries([...users].map(([k, v]) => [k, v])),
    credits: userCredits.get(id) ?? 0,
    inventory: userInventories.get(id) ?? [],
    roomObjects
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(String(data)) as ClientMsg;
      if (!msg || typeof msg.type !== "string") return;

      const me = users.get(id);
      if (!me) return;

      if (msg.type === "join") {
        me.name = msg.name.trim().slice(0, 24) || "Guest";
        me.color = msg.color || 0xFFFFFF;
        broadcast({ type: "user_joined", id, user: me }, id);
        return;
      }

      if (msg.type === "move") {
        const { x, y } = clampGrid(msg.x, msg.y);
        me.x = x; me.y = y;
        broadcast({ type: "user_moved", id, x, y });
        return;
      }

      if (msg.type === "chat") {
        const text = msg.text.trim().slice(0, 200);
        if (!text) return;
        broadcast({ type: "chat", id, name: me.name, text, ts: Date.now() });
        return;
      }

      // --- Shop & Furni ---
      if (msg.type === "buy_item") {
        const itemDef = catalog.find(c => c.id === msg.catalogId);
        const credits = userCredits.get(id) ?? 0;
        if (itemDef && credits >= itemDef.cost) {
          userCredits.set(id, credits - itemDef.cost);
          const newItem: Item = { id: uid(), typeId: itemDef.id, name: itemDef.name };
          const inv = userInventories.get(id) || [];
          inv.push(newItem);
          userInventories.set(id, inv);

          send(ws, { type: "update_credits", credits: userCredits.get(id)! });
          send(ws, { type: "sync_inventory", items: inv });
        }
        return;
      }

      if (msg.type === "place_item") {
        const inv = userInventories.get(id) || [];
        const idx = inv.findIndex(i => i.id === msg.itemId);
        if (idx !== -1) {
          const item = inv[idx];
          inv.splice(idx, 1);
          const { x, y } = clampGrid(msg.x, msg.y);
          const obj: RoomObject = { instanceId: item.id, typeId: item.typeId, x, y };
          roomObjects.push(obj);

          send(ws, { type: "sync_inventory", items: inv });
          broadcast({ type: "furni_placed", object: obj });
        }
        return;
      }

      if (msg.type === "move_furni") {
        const obj = roomObjects.find(o => o.instanceId === msg.instanceId);
        if (obj) {
          const { x, y } = clampGrid(msg.x, msg.y);
          obj.x = x; obj.y = y;
          broadcast({ type: "furni_moved", instanceId: obj.instanceId, x, y });
        }
        return;
      }

      if (msg.type === "pickup_furni") {
        const idx = roomObjects.findIndex(o => o.instanceId === msg.instanceId);
        if (idx !== -1) {
          const obj = roomObjects[idx];
          roomObjects.splice(idx, 1);

          const inv = userInventories.get(id) || [];
          const itemDef = catalog.find(c => c.id === obj.typeId);
          inv.push({ id: obj.instanceId, typeId: obj.typeId, name: itemDef?.name || "Item" });

          send(ws, { type: "sync_inventory", items: inv });
          broadcast({ type: "furni_picked_up", instanceId: obj.instanceId });
        }
        return;
      }

    } catch (e) {
      console.error("error parsing message", e);
    }
  });

  ws.on("close", () => {
    conns.delete(id);
    users.delete(id);
    broadcast({ type: "user_left", id });
  });
});

server.listen(PORT, () => {
  console.log(`VibeHotel server listening on http://localhost:${PORT} (ws)`);
});
