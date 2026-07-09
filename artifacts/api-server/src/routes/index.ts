import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gamesenseRouter from "./gamesense";
import fs from "fs";
import path from "path";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/gamesense", gamesenseRouter);

router.get("/slideshow-images", (_req, res): void => {
  try {
    const dirPath = path.resolve(import.meta.dirname || __dirname, "../../../beatstar-vault/public/data/slideshow");
    if (!fs.existsSync(dirPath)) {
      res.json([]);
      return;
    }
    const files = fs.readdirSync(dirPath)
      .filter((file) => /\.(png|jpe?g|gif|webp|svg)$/i.test(file))
      .map((file) => `/data/slideshow/${file}`);
    res.json(files);
    return;
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
    return;
  }
});

router.post("/upload-slideshow", (req, res): void => {
  try {
    const { filename, base64Data } = req.body;
    if (!filename || !base64Data) {
      res.status(400).json({ error: "Missing filename or base64Data" });
      return;
    }

    const dirPath = path.resolve(import.meta.dirname || __dirname, "../../../beatstar-vault/public/data/slideshow");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Strip header prefix if present (e.g. data:image/png;base64,)
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    
    // Ensure safe filename
    const safeFilename = filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const filePath = path.join(dirPath, safeFilename);
    
    fs.writeFileSync(filePath, buffer);
    
    res.json({ success: true, url: `/data/slideshow/${safeFilename}` });
    return;
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
    return;
  }
});

export default router;
