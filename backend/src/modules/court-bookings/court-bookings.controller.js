const courtBookingsService = require("./court-bookings.service");
const asyncHandler = require("../../utils/asyncHandler");
const AppError = require("../../utils/AppError");

class CourtBookingsController {
  createSingleBooking = asyncHandler(async (req, res) => {
    const actor = req.user;
    if (!actor || !actor.id) {
      throw new AppError(
        401,
        "Vui lòng đăng nhập để tiếp tục.",
        "UNAUTHORIZED",
      );
    }

    const input = {
      courtId: req.body.courtId,
      bookingDate: req.body.bookingDate,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      customerName: req.body.customerName,
      customerPhone: req.body.customerPhone,
      paymentMethod: req.body.paymentMethod,
      note: req.body.note,
      userId: actor.id,
      createdByUserId: actor.id,
      userRole: actor.role,
      source: actor.role === "FIELD_STAFF" ? "OFFLINE" : "ONLINE",
    };

    const booking = await courtBookingsService.createSingleBooking(input);

    return res.status(201).json({
      success: true,
      data: booking,
    });
  });

  createGroupBooking = asyncHandler(async (req, res) => {
    const actor = req.user;
    if (!actor || !actor.id) {
      throw new AppError(
        401,
        "Vui lòng đăng nhập để tiếp tục.",
        "UNAUTHORIZED",
      );
    }

    if (actor.role !== "CUSTOMER") {
      throw new AppError(
        403,
        "Chỉ khách hàng (CUSTOMER) mới có quyền tạo nhóm đặt sân.",
        "FORBIDDEN",
      );
    }

    const input = {
      title: req.body.title,
      description: req.body.description,
      courtIds: req.body.courtIds,
      bookingDate: req.body.bookingDate,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      requiredMembers: req.body.requiredMembers,
      slotAmount: req.body.slotAmount,
      customerName: req.body.customerName,
      customerPhone: req.body.customerPhone,
      paymentMethod: req.body.paymentMethod,
      ownerUserId: actor.id,
    };

    const result = await courtBookingsService.createGroupBooking(input);

    return res.status(201).json({
      success: true,
      data: result,
    });
  });

  joinGroup = asyncHandler(async (req, res) => {
    const updatedGroup = await courtBookingsService.joinGroup(
      req.params.groupId,
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      data: updatedGroup,
    });
  });

  leaveGroup = asyncHandler(async (req, res) => {
    const updatedGroup = await courtBookingsService.leaveGroup(
      req.params.groupId,
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      data: updatedGroup,
    });
  });

  cancelGroup = asyncHandler(async (req, res) => {
    const result = await courtBookingsService.cancelGroup(
      req.params.groupId,
      req.user.id,
      req.user.role,
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  });

  cancelSingleBooking = asyncHandler(async (req, res) => {
    const booking = await courtBookingsService.cancelSingleBooking(
      req.params.bookingId,
      req.user.id,
      req.user.role,
    );

    return res.status(200).json({
      success: true,
      message: "Hủy lượt đặt sân thành công.",
      data: booking,
    });
  });
  myBookings = asyncHandler(async (req, res) =>
    res.json({
      success: true,
      ...(await courtBookingsService.myBookings(req.user.id, req.query)),
    }),
  );
  bookingDetail = asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await courtBookingsService.bookingDetail(
        req.params.bookingId,
        req.user.id,
      ),
    }),
  );
  listGroups = asyncHandler(async (req, res) =>
    res.json({
      success: true,
      ...(await courtBookingsService.listGroups(req.query)),
    }),
  );
  groupDetail = asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await courtBookingsService.groupDetail(req.params.groupId),
    }),
  );
}

module.exports = new CourtBookingsController();
