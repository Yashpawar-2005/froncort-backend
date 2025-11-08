import { Router } from "express"
import { login, signup } from "../controllers/authController";


const authrouter=Router();

authrouter.post("/login",login)
authrouter.post("/signup",signup)

export default authrouter