import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in your .env file");
}

if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM) {
  throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM must be set in your .env file");
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

app.use(express.json());

// These arrays/maps are intentionally in memory for this small demo app.
// Use a database or cache such as Redis before deploying this in production.
const users = [];
const pendingOtps = new Map();

function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });
}

function createOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

app.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    if (users.some((user) => user.email === email)) {
      return res.status(409).json({ message: "User already exists" });
    }

    const newUser = {
      id: users.length + 1,
      email,
      password: await bcrypt.hash(password, 10),
    };

    users.push(newUser);
    return res.status(201).json({
      message: "User registered successfully",
      user: { id: newUser.id, email: newUser.email },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

// Step 1: validate the password, create a one-time code, and email it.
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = users.find((existingUser) => existingUser.email === email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const otp = createOtp();
    pendingOtps.set(email, {
      hash: await bcrypt.hash(otp, 10),
      expiresAt: Date.now() + OTP_EXPIRY_MS,
      attempts: 0,
    });

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: email,
        subject: "Your login verification code",
        text: `Your verification code is ${otp}. It expires in 10 minutes.`,
      });
    } catch (emailError) {
      pendingOtps.delete(email);
      console.error("Could not send login OTP:", emailError);
      return res.status(503).json({ message: "Could not send verification email. Please try again." });
    }

    return res.json({
      message: "Verification code sent to your email",
      expiresIn: "10 minutes",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

// Step 2: exchange the emailed OTP for a JWT.
app.post("/verify-login-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const pendingOtp = pendingOtps.get(email);
    if (!pendingOtp || pendingOtp.expiresAt < Date.now()) {
      pendingOtps.delete(email);
      return res.status(401).json({ message: "OTP is invalid or has expired" });
    }

    if (pendingOtp.attempts >= OTP_MAX_ATTEMPTS) {
      pendingOtps.delete(email);
      return res.status(429).json({ message: "Too many invalid OTP attempts. Please log in again." });
    }

    if (!(await bcrypt.compare(String(otp), pendingOtp.hash))) {
      pendingOtp.attempts += 1;
      return res.status(401).json({ message: "OTP is invalid or has expired" });
    }

    const user = users.find((existingUser) => existingUser.email === email);
    pendingOtps.delete(email);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ message: "Login successful", token: createToken(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const [scheme, token] = authHeader?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "A Bearer access token is required" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}

app.get("/profile", authenticateToken, (req, res) => {
  const user = users.find((existingUser) => existingUser.id === req.user.id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.json({
    message: "Protected route accessed successfully",
    user: { id: user.id, email: user.email },
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
