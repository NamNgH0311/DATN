const express = require("express");
const router = express.Router();
const courtBookingsController = require("./court-bookings.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const authorize = require("../../middlewares/authorize.middleware");
const {
  validateSingleBooking,
  validateGroupBooking,
  validateGroupIdParam,
} = require("../../middlewares/validate.middleware");

router.get(
  "/bookings/my",
  authMiddleware,
  authorize("CUSTOMER"),
  courtBookingsController.myBookings,
);
router.get(
  "/bookings/:bookingId",
  authMiddleware,
  authorize("CUSTOMER"),
  courtBookingsController.bookingDetail,
);
router.get("/booking-groups", courtBookingsController.listGroups);
router.get(
  "/booking-groups/:groupId",
  validateGroupIdParam,
  courtBookingsController.groupDetail,
);

router.post(
  "/bookings",
  authMiddleware,
  validateSingleBooking,
  courtBookingsController.createSingleBooking,
);

router.post(
  "/booking-groups",
  authMiddleware,
  authorize("CUSTOMER"),
  validateGroupBooking,
  courtBookingsController.createGroupBooking,
);

router.post(
  "/booking-groups/:groupId/join",
  authMiddleware,
  validateGroupIdParam,
  courtBookingsController.joinGroup,
);

router.post(
  "/booking-groups/:groupId/leave",
  authMiddleware,
  validateGroupIdParam,
  courtBookingsController.leaveGroup,
);

router.post(
  "/booking-groups/:groupId/cancel",
  authMiddleware,
  validateGroupIdParam,
  courtBookingsController.cancelGroup,
);

router.post(
  "/bookings/:bookingId/cancel",
  authMiddleware,
  authorize("CUSTOMER", "ADMIN"),
  courtBookingsController.cancelSingleBooking,
);

module.exports = router;
