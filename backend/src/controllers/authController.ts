import client from "../helpers/db";
import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// JWT_SECRET is read inside functions to ensure process.env is loaded

export const signup = async (req: Request, res: Response) => {
  try {
    const JWT_SECRET = process.env.JWT_SECRET || "temp";
    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined");
    }

    const { username, email, password } = req.body as { username: string; email: string; password: string };

    const existingUser = await client.user.findFirst({
      where: { OR: [{ email }, { username }] }
    });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await client.user.create({
      data: {
        username,
        email,
        password: hashedPassword
      }
    });

    const token = jwt.sign({ id: newUser.id }, JWT_SECRET, { expiresIn: "1d" });

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: Number(process.env.COOKIE_MAX_AGE) || 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      message: "User created",
      user: { id: newUser.id, username: newUser.username, email: newUser.email }
    });

  } catch (error: any) {
    console.error("Signup Error:", error);
    res.status(500).json({ message: error.message || "Internal Server Error" });
  }
}


export const login = async (req: Request, res: Response) => {
  try {
    const JWT_SECRET = process.env.JWT_SECRET || "temp";
    if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined");

    const { username, password } = req.body as { username: string; password: string };

    const user = await client.user.findUnique({ where: { username } });
    if (!user) return res.status(401).json({ message: "Invalid username or password" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: "Invalid username or password" });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "1d" });

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: Number(process.env.COOKIE_MAX_AGE) || 24 * 60 * 60 * 1000
    });

    res.status(200).json({
      message: "Logged in",
      user: { id: user.id, username: user.username, email: user.email }
    });

  } catch (error: any) {
    console.error("Login Error:", error);
    res.status(500).json({ message: error.message || "Internal Server Error" });
  }
}
