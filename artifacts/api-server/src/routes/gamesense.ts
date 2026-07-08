import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import os from "os";

const router = Router();

// Cache discovered address to avoid checking disk on every single hit/miss event (which can be very frequent)
let cachedAddress: string | null = null;
let lastCheckTime = 0;
const CACHE_TTL = 30000; // 30 seconds

function discoverGameSenseEndpoint(): string | null {
  const now = Date.now();
  if (cachedAddress && now - lastCheckTime < CACHE_TTL) {
    return cachedAddress;
  }

  const isWin = os.platform() === "win32";
  const paths: string[] = [];

  if (isWin) {
    const programData = process.env.PROGRAMDATA || "C:\\ProgramData";
    paths.push(
      path.join(programData, "SteelSeries/SteelSeries Engine 3/coreProps.json"),
      path.join(programData, "SteelSeries/SteelSeries Engine/coreProps.json"),
      path.join(programData, "SteelSeries/GG/coreProps.json")
    );
  } else {
    // macOS
    paths.push(
      "/Library/Application Support/SteelSeries Engine 3/coreProps.json",
      "/Library/Application Support/SteelSeries/SteelSeries Engine 3/coreProps.json",
      "/Library/Application Support/SteelSeries/GG/coreProps.json",
      path.join(os.homedir(), "Library/Application Support/SteelSeries Engine 3/coreProps.json"),
      path.join(os.homedir(), "Library/Application Support/SteelSeries/SteelSeries Engine 3/coreProps.json")
    );
  }

  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf8");
        const data = JSON.parse(content);
        if (data && data.address) {
          cachedAddress = data.address;
          lastCheckTime = now;
          return data.address;
        }
      }
    } catch (e) {
      // Try next path
    }
  }

  return null;
}

// GET /api/gamesense/status
router.get("/status", async (req: Request, res: Response) => {
  const address = discoverGameSenseEndpoint();
  if (!address) {
    res.json({ status: "disconnected", error: "SteelSeries GG coreProps.json not found" });
    return;
  }

  try {
    // Simple fetch check to ensure the GameSense server is actually online
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    
    const checkRes = await fetch(`http://${address}/`, { 
      method: "GET",
      signal: controller.signal 
    }).catch(() => null);
    
    clearTimeout(timeoutId);

    res.json({
      status: "connected",
      address,
      engineOnline: checkRes !== null,
    });
  } catch (error: any) {
    res.json({
      status: "error",
      address,
      error: error.message || "Failed to contact GameSense engine",
    });
  }
});

// POST /api/gamesense/register
router.post("/register", async (req: Request, res: Response) => {
  const address = discoverGameSenseEndpoint();
  if (!address) {
    res.status(503).json({ error: "GameSense endpoint not discovered" });
    return;
  }

  try {
    // 1. Register Game Metadata
    const metaResponse = await fetch(`http://${address}/game_metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: "BEATSTAR",
        game_display_name: "BEATSTAR",
        developer: "th3scr1b3",
      }),
    });

    if (!metaResponse.ok) {
      const errText = await metaResponse.text();
      res.status(metaResponse.status).json({ error: `Engine rejected metadata: ${errText}` });
      return;
    }

    // 2. Bind Game Events
    // Event: HIT_EVENT
    await fetch(`http://${address}/bind_game_event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: "BEATSTAR",
        event: "HIT_EVENT",
        min_value: 0,
        max_value: 100,
        icon_id: 15, // Music icon/note
        handlers: [
          {
            "device-type": "keyboard",
            zone: "all",
            mode: "color",
            color: { red: 57, green: 255, blue: 20 }, // neon green flash
            rate: {
              frequency: 12,
              repeat_limit: 1
            }
          },
          {
            "device-type": "mouse",
            zone: "all",
            mode: "color",
            color: { red: 57, green: 255, blue: 20 },
            rate: {
              frequency: 12,
              repeat_limit: 1
            }
          }
        ]
      }),
    });

    // Event: MISS_EVENT
    await fetch(`http://${address}/bind_game_event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: "BEATSTAR",
        event: "MISS_EVENT",
        min_value: 0,
        max_value: 100,
        icon_id: 2, // Skull/Danger icon
        handlers: [
          {
            "device-type": "keyboard",
            zone: "all",
            mode: "color",
            color: { red: 255, green: 20, blue: 20 }, // red flash
            rate: {
              frequency: 12,
              repeat_limit: 1
            }
          },
          {
            "device-type": "mouse",
            zone: "all",
            mode: "color",
            color: { red: 255, green: 20, blue: 20 },
            rate: {
              frequency: 12,
              repeat_limit: 1
            }
          }
        ]
      }),
    });

    // Event: COMBO
    await fetch(`http://${address}/bind_game_event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: "BEATSTAR",
        event: "COMBO",
        min_value: 0,
        max_value: 100,
        icon_id: 1, // Standard status bar
        handlers: [
          {
            "device-type": "keyboard",
            zone: "function-keys",
            mode: "percent",
            color: { red: 0, green: 229, blue: 255 } // Cyan progress bar
          }
        ]
      }),
    });

    // Event: HEALTH
    await fetch(`http://${address}/bind_game_event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: "BEATSTAR",
        event: "HEALTH",
        min_value: 0,
        max_value: 3, // Miss limit is 3
        icon_id: 1,
        handlers: [
          {
            "device-type": "keyboard",
            zone: "number-keys",
            mode: "percent",
            color: {
              gradient: {
                zero: { red: 255, green: 0, blue: 0 },
                one: { red: 255, green: 165, blue: 0 },
                three: { red: 0, green: 255, blue: 0 }
              }
            }
          }
        ]
      }),
    });

    // Event: POWERUP
    await fetch(`http://${address}/bind_game_event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: "BEATSTAR",
        event: "POWERUP",
        min_value: 0,
        max_value: 3, // 0: Ambient, 1: Fever, 2: Surge, 3: Signal Lock
        icon_id: 15,
        handlers: [
          {
            "device-type": "keyboard",
            zone: "all",
            mode: "color",
            color: {
              gradient: {
                zero: { red: 0, green: 229, blue: 255 },       // Classic Ambient Cyan
                one: { red: 229, green: 184, blue: 0 },        // Fever Gold
                two: { red: 255, green: 20, blue: 147 },       // Surge Pink
                three: { red: 57, green: 255, blue: 20 }        // Signal Lock Neon Green
              }
            }
          }
        ]
      }),
    });

    // Event: MODIFIER
    await fetch(`http://${address}/bind_game_event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: "BEATSTAR",
        event: "MODIFIER",
        min_value: 0,
        max_value: 3, // 0: Classic, 1: Vocal Isolation, 2: Bass Realm, 3: Corrupted Signal
        icon_id: 15,
        handlers: [
          {
            "device-type": "keyboard",
            zone: "all",
            mode: "color",
            color: {
              gradient: {
                zero: { red: 0, green: 229, blue: 255 },       // Classic Cyberpunk Cyan/Pink
                one: { red: 255, green: 127, blue: 80 },       // Vocal Isolation Warm Coral
                two: { red: 168, green: 85, blue: 247 },       // Bass Realm Neon Purple
                three: { red: 255, green: 165, blue: 0 }       // Corrupted Signal Glitch Amber
              }
            }
          }
        ]
      }),
    });

    res.json({ status: "success", message: "Game registered and events bound successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to register game metadata/events" });
  }
});

// POST /api/gamesense/event
router.post("/event", async (req: Request, res: Response) => {
  const address = discoverGameSenseEndpoint();
  if (!address) {
    res.status(503).json({ error: "GameSense endpoint not discovered" });
    return;
  }

  const { event, data } = req.body;
  if (!event || !data) {
    res.status(400).json({ error: "Missing event name or data payload" });
    return;
  }

  try {
    const eventResponse = await fetch(`http://${address}/game_event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: "BEATSTAR",
        event,
        data,
      }),
    });

    if (!eventResponse.ok) {
      const errText = await eventResponse.text();
      res.status(eventResponse.status).json({ error: `Engine rejected event: ${errText}` });
      return;
    }

    res.json({ status: "success" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to trigger GameSense event" });
  }
});

// POST /api/gamesense/heartbeat
router.post("/heartbeat", async (req: Request, res: Response) => {
  const address = discoverGameSenseEndpoint();
  if (!address) {
    res.status(503).json({ error: "GameSense endpoint not discovered" });
    return;
  }

  try {
    const hbResponse = await fetch(`http://${address}/game_heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "BEATSTAR" }),
    });

    if (!hbResponse.ok) {
      res.status(hbResponse.status).json({ error: "Engine rejected heartbeat" });
      return;
    }

    res.json({ status: "success" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to send heartbeat" });
  }
});

export default router;
