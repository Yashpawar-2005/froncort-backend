import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;



export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined");

    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: "Not authenticated" });

    const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
    req.userId = decoded.id;

    next();
  } catch (error: any) {
    console.error("Authentication Error:", error);
    res.status(401).json({ message: error.message || "Unauthorized" });
  }
};
