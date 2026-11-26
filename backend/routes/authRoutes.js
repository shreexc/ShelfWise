import express from "express";
import {
  completeProfile,
  getProfile,
  getUsers,
  loginUser,
  registerAdmin,
  registerUser,
  updateProfile,
  verifyOTP,
} from "../controllers/authController.js";
import {
  authenticationToken,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const authRouter = express.Router();

// user

authRouter.post("/register", registerUser);
authRouter.post("/verify-otp", verifyOTP);
authRouter.post("/complete-profile", authenticationToken, completeProfile);
authRouter.post("/login", loginUser);

// admin
authRouter.post("/register-admin", registerAdmin);

authRouter.put("/update-profile", authenticationToken, updateProfile);
authRouter.get("/me", authenticationToken, getProfile);
authRouter.get(
  "/users",
  authenticationToken,
  authorizeRoles("admin"),
  getUsers,
);

export default authRouter;
