const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
const RefreshToken = require("../models/RefreshToken");
const auth = require("../middleware/auth");
const crypto = require("crypto");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set");
}

// Helper to generate access token
const generateAccessToken = (adminId) => {
  return jwt.sign(
    { user: { id: adminId } },
    JWT_SECRET,
    { expiresIn: "15m" }, // Short-lived Access Token
  );
};

// Helper to generate refresh token
const generateRefreshToken = (adminId) => {
  return jwt.sign(
    { user: { id: adminId } },
    JWT_SECRET,
    { expiresIn: "30d" }, // Long-lived Refresh Token (30 days)
  );
};

// Helper to set cookie options
const getCookieOptions = (maxAge) => {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  };
  if (maxAge !== undefined) {
    options.maxAge = maxAge;
  }
  return options;
};

// @route   POST api/auth/login
// @desc    Authenticate admin & set cookies
// @access  Public
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ msg: "Invalid Credentials" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid Credentials" });
    }

    // Generate tokens
    const accessToken = generateAccessToken(admin._id);
    const refreshToken = generateRefreshToken(admin._id);

    // Group rotated tokens in a single session family using a random UUID
    const familyId = crypto.randomUUID();

    // Save refresh token to DB
    const newRefreshToken = new RefreshToken({
      token: refreshToken,
      adminId: admin._id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      familyId,
    });
    await newRefreshToken.save();

    // Set HTTP-Only cookies
    res.cookie("access_token", accessToken, getCookieOptions(15 * 60 * 1000)); // 15 mins
    res.cookie(
      "refresh_token",
      refreshToken,
      getCookieOptions(30 * 24 * 60 * 60 * 1000),
    ); // 30 days

    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   POST api/auth/refresh
// @desc    Rotate access & refresh tokens
// @access  Public
router.post("/refresh", async (req, res) => {
  const refreshTokenVal = req.cookies.refresh_token;

  if (!refreshTokenVal) {
    return res
      .status(401)
      .json({ msg: "No refresh token, authorization denied" });
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshTokenVal, JWT_SECRET);

    // Find refresh token in DB
    const dbToken = await RefreshToken.findOne({ token: refreshTokenVal });

    // Token Reuse Detection (If token was already used)
    if (!dbToken || dbToken.isUsed) {
      if (dbToken) {
        // Attack detected: clear all tokens in the same family to log out the user entirely
        console.warn(
          `Token reuse detected! Revoking family ${dbToken.familyId}`,
        );
        await RefreshToken.deleteMany({ familyId: dbToken.familyId });
      }
      res.clearCookie("access_token", getCookieOptions());
      res.clearCookie("refresh_token", getCookieOptions());
      return res
        .status(401)
        .json({ msg: "Session invalidated. Please login again." });
    }

    // Token is valid and unused. Rotate it.
    dbToken.isUsed = true;
    await dbToken.save();

    // Generate new pair
    const newAccessToken = generateAccessToken(decoded.user.id);
    const newRefreshTokenVal = generateRefreshToken(decoded.user.id);

    const rotatedToken = new RefreshToken({
      token: newRefreshTokenVal,
      adminId: decoded.user.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      familyId: dbToken.familyId, // Same family
    });
    await rotatedToken.save();

    // Update cookies
    res.cookie(
      "access_token",
      newAccessToken,
      getCookieOptions(15 * 60 * 1000),
    ); // 15 mins
    res.cookie(
      "refresh_token",
      newRefreshTokenVal,
      getCookieOptions(30 * 24 * 60 * 60 * 1000),
    ); // 30 days

    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    res.clearCookie("access_token", getCookieOptions());
    res.clearCookie("refresh_token", getCookieOptions());
    return res.status(401).json({ msg: "Invalid or expired refresh token" });
  }
});

// @route   POST api/auth/logout
// @desc    Logout admin and clear cookies
// @access  Public
router.post("/logout", async (req, res) => {
  const refreshTokenVal = req.cookies.refresh_token;
  console.log("refreshTokenVal", refreshTokenVal);

  try {
    if (refreshTokenVal) {
      const dbToken = await RefreshToken.findOne({ token: refreshTokenVal });
      if (dbToken) {
        // Delete the token family to logout all associated rotated sessions
        await RefreshToken.deleteMany({ familyId: dbToken.familyId });
      }
    }
  } catch (err) {
    console.error("Logout db error:", err.message);
  } finally {
    res.clearCookie("access_token", getCookieOptions());
    res.clearCookie("refresh_token", getCookieOptions());
    res.json({ success: true });
  }
});

// @route   GET api/auth/status
// @desc    Check authentication status
// @access  Private (auth middleware protected)
router.get("/status", auth, (req, res) => {
  res.json({ isAuthenticated: true, user: req.user });
});

module.exports = router;
