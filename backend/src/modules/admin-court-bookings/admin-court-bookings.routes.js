const router = require("express").Router();
const auth = require("../../middlewares/auth.middleware");
const authorize = require("../../middlewares/authorize.middleware");
const {
  validateSingleBooking,
} = require("../../middlewares/validate.middleware");
const c = require("./admin-court-bookings.controller");
router.use("/admin/court-bookings", auth, authorize("ADMIN", "FIELD_STAFF"));
router.get("/admin/court-bookings", c.list);
router.get("/admin/court-bookings/schedule", c.schedule);
router.post("/admin/court-bookings", validateSingleBooking, c.create);
router.patch("/admin/court-bookings/:id/confirm", c.confirm);
router.patch("/admin/court-bookings/:id/complete", c.complete);
module.exports = router;
