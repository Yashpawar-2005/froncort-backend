import { Router } from "express";
import { authenticate } from "../middlewares/authMiddleware";
import { create_kanban, getKanbanWithCards, getKanbanByProjectId, createCard, getUserPermissions, getProjectMembers, updateCardColumn, updateCard, getProjectPages } from "../controllers/kanbanController";

const kanbanRouter = Router();

kanbanRouter.get("/:kanbanId", authenticate, getKanbanWithCards);
kanbanRouter.get("/:kanbanId/permissions", authenticate, getUserPermissions);
kanbanRouter.get("/:kanbanId/members", authenticate, getProjectMembers);
kanbanRouter.get("/:kanbanId/pages", authenticate, getProjectPages);
kanbanRouter.get("/project/:projectId", authenticate, getKanbanByProjectId);
kanbanRouter.post("/create", authenticate, create_kanban);
kanbanRouter.post("/:kanbanId/cards", authenticate, createCard);
kanbanRouter.patch("/cards/:cardId/column", authenticate, updateCardColumn);
kanbanRouter.patch("/cards/:cardId", authenticate, updateCard);

export default kanbanRouter;