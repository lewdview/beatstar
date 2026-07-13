import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gamesenseRouter from "./gamesense";
import fs from "fs";
import path from "path";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/gamesense", gamesenseRouter);

// Dynamically resolves the correct beatstar-vault public/data/slideshow directory path
function getSlideshowDirPath(): string {
  const possiblePaths = [
    // 1. Production bundle relative path from artifacts/api-server/dist/index.mjs
    path.resolve(import.meta.dirname || __dirname, "../../beatstar-vault/public/data/slideshow"),
    // 2. Development source relative path from artifacts/api-server/src/routes/index.ts
    path.resolve(import.meta.dirname || __dirname, "../../../beatstar-vault/public/data/slideshow"),
    // 3. Absolute path fallback on user's system
    "/Users/studio/BEATSTAR.th3scr1b3.art/beatstar/artifacts/beatstar-vault/public/data/slideshow"
  ];

  for (const p of possiblePaths) {
    const parentDir = path.dirname(p);
    if (fs.existsSync(parentDir) && fs.statSync(parentDir).isDirectory()) {
      return p;
    }
  }

  return possiblePaths[0];
}

function getFilesRecursively(dir: string, baseDir: string = dir): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(filePath, baseDir));
    } else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(file)) {
      const relative = path.relative(baseDir, filePath);
      results.push(`/data/slideshow/${relative.replace(/\\/g, '/')}`);
    }
  }
  return results;
}

router.get("/slideshow-images", (_req, res): void => {
  try {
    const dirPath = getSlideshowDirPath();
    if (!fs.existsSync(dirPath)) {
      res.json([]);
      return;
    }
    const files = getFilesRecursively(dirPath);
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

    const dirPath = getSlideshowDirPath();
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
