const express = require("express");

const authController = require("./auth.controller");
const asyncHandler = require("../../utils/asyncHandler");

const authMiddleware = require("../../middlewares/auth.middleware");
const authorize = require("../../middlewares/authorize.middleware");
const loginRateLimit = require("../../middlewares/loginRateLimit.middleware");
const {
  accountLoginLimit,
} = require("../../middlewares/accountLoginLimit.middleware");

const router = express.Router();

router.post("/auth/register", asyncHandler(authController.register));

router.post(
  "/auth/login",
  loginRateLimit,
  accountLoginLimit,
  asyncHandler(authController.login),
);

router.post("/auth/refresh", asyncHandler(authController.refresh));

router.post("/auth/logout", asyncHandler(authController.logout));

router.patch(
  "/auth/change-password",
  authMiddleware,
  asyncHandler(authController.changePassword),
);

router.get("/auth/me", authMiddleware, authController.getMe);

router.patch(
  "/auth/me",
  authMiddleware,
  asyncHandler(authController.updateProfile),
);

router.patch(
  "/auth/me/delivery-address",
  authMiddleware,
  authorize("CUSTOMER"),
  asyncHandler(authController.updateDeliveryAddress),
);

module.exports = router;
