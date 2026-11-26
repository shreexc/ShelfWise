import express from "express";
import {
  authenticationToken,
  authorizeRoles,
} from "../middleware/authMiddleware.js";
import { searchStudentsByRoll } from "../controllers/studentController.js";

const studentRouter = express.Router();

studentRouter.get(
  "/search-by-roll",
  authenticationToken,
  authorizeRoles("admin"),
  searchStudentsByRoll,
);

export default studentRouter;
