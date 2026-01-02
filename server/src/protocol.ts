export type ClientMsg =
  | { type: "join"; name: string; color: number }
  | { type: "move"; x: number; y: number }
  | { type: "chat"; text: string }
  | { type: "buy_item"; catalogId: string }
  | { type: "place_item"; itemId: string; x: number; y: number }
  | { type: "move_furni"; instanceId: string; x: number; y: number }
  | { type: "pickup_furni"; instanceId: string };

export type ServerMsg =
  | { type: "welcome"; id: string; users: Record<string, UserState>; credits: number; inventory: Item[]; roomObjects: RoomObject[] }
  | { type: "user_joined"; id: string; user: UserState }
  | { type: "user_left"; id: string }
  | { type: "user_moved"; id: string; x: number; y: number }
  | { type: "chat"; id: string; name: string; text: string; ts: number }
  | { type: "update_credits"; credits: number }
  | { type: "sync_inventory"; items: Item[] }
  | { type: "furni_placed"; object: RoomObject }
  | { type: "furni_moved"; instanceId: string; x: number; y: number }
  | { type: "furni_picked_up"; instanceId: string };

export type UserState = {
  id: string;
  name: string;
  color: number;
  x: number; // grid coords
  y: number; // grid coords
};

export type Item = {
  id: string;
  typeId: string;
  name: string;
};

export type RoomObject = {
  instanceId: string;
  typeId: string;
  x: number;
  y: number;
};

export type CatalogItem = {
  id: string;
  name: string;
  cost: number;
  color: number;
};
