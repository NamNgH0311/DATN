const service = require("./admin-court-bookings.service");
const asyncHandler = require("../../utils/asyncHandler");
module.exports = {
  list: asyncHandler(async (req, res) =>
    res.json({ success: true, ...(await service.list(req.user, req.query)) }),
  ),
  schedule: asyncHandler(async (req, res) =>
    res.json({
      success: true,
      ...(await service.schedule(req.user, req.query)),
    }),
  ),
  create: asyncHandler(async (req, res) =>
    res
      .status(201)
      .json({
        success: true,
        data: await service.createOffline(req.user, req.body),
      }),
  ),
  confirm: asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await service.transition(req.user, req.params.id, "confirm"),
    }),
  ),
  complete: asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await service.transition(req.user, req.params.id, "complete"),
    }),
  ),
};
