import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// JWT_SECRET is read inside function to ensure process.env is loaded



export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  console.log("--- Auth Debug Start ---");
  console.log(`Method: ${req.method} | Path: ${req.path}`);
  console.log("All Cookies:", req.cookies);

  try {
    const JWT_SECRET = process.env.JWT_SECRET || "temp";
    console.log(`Using JWT_SECRET: ${JWT_SECRET === "temp" ? "DEFAULT(temp)" : "FROM_ENV"}`);

    const token = req.cookies.token;

    if (!token) {
      console.log("❌ Authentication Failed: No token found in cookies.");
      console.log("--- Auth Debug End ---");
      return res.status(401).json({ message: "Not authenticated" });
    }

    console.log("🔍 Token found, verifying...");
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
    console.log("✅ Token verified for User ID:", decoded.id);

    req.userId = decoded.id;
    console.log("--- Auth Debug End ---");
    next();
  } catch (error: any) {
    console.error("❌ Authentication Error:", error.message);
    console.log("--- Auth Debug End ---");
    res.status(401).json({ message: error.message || "Unauthorized" });
  }
};
