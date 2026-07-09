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

export default router;
