import { authMiddleware } from "../middleware/auth.js";
import { Router } from "express";
import Auth from "./auth.js";
import User from "./user.js";
import Driver from "./driver.js";
import Ride from "./ride.js";

const router = Router();

// without middleware routes
router.use("/auth", Auth);

// with middleware routes
router.use(authMiddleware);
router.use("/user", User);
router.use("/driver", Driver);
router.use("/ride", Ride);


export default router;
