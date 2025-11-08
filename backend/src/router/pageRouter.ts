import { Router } from "express";
import { authenticate } from "../middlewares/authMiddleware";
import { createPage, getPageById, updatePage, createAutoPageVersion, getPageVersionById, comparePageVersions, notifyMention } from "../controllers/pageController";

const pageRouter = Router();

pageRouter.post("/:projectId/create", authenticate, createPage);
pageRouter.get("/:pageId", authenticate, getPageById);
pageRouter.get("/version/:versionId", authenticate, getPageVersionById);
pageRouter.post("/compare-versions", authenticate, comparePageVersions);
pageRouter.post("/:projectId/:pageId/auto-version", authenticate, createAutoPageVersion);
pageRouter.post("/:pageId/mention", authenticate, notifyMention);
pageRouter.patch("/:pageId", authenticate, updatePage);

export default pageRouter;