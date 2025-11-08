import { Router } from "express";
import { authenticate } from "../middlewares/authMiddleware";
import { createProject, getAllProjects, getProjectById, addUserToProject, removeUserFromProject, searchUsers, getProjectLogs, getOwnedProjectsForCreation } from "../controllers/projectController";

const projectRouter=Router();

projectRouter.get("/",authenticate,getAllProjects)
projectRouter.get("/owned-for-creation",authenticate,getOwnedProjectsForCreation)
projectRouter.get("/specific/:projectId",authenticate,getProjectById)
projectRouter.post("/create",authenticate,createProject)
projectRouter.post("/:projectId/members",authenticate,addUserToProject)
projectRouter.delete("/:projectId/members/:memberId",authenticate,removeUserFromProject)
projectRouter.get("/users/search",authenticate,searchUsers)
projectRouter.get("/:projectId/logs",authenticate,getProjectLogs)
export default projectRouter