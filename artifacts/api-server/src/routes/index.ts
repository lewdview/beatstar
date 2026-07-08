import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gamesenseRouter from "./gamesense";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/gamesense", gamesenseRouter);

export default router;
