const prisma = require("../../lib/prisma");
const AppError = require("../../utils/AppError");
const { minutesUntilStart } = require("../../middlewares/validate.middleware");
const customerService = require("../court-bookings/court-bookings.service");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function validId(id) {
  if (!UUID.test(id || ""))
    throw new AppError(400, "UUID không hợp lệ.", "INVALID_UUID");
}
function validDate(d) {
  if (
    !DATE.test(d || "") ||
    new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d
  )
    throw new AppError(400, "Ngày không hợp lệ.", "INVALID_DATE");
}
async function assignedIds(actor) {
  const a = await prisma.courtStaffAssignment.findMany({
    where: { userId: actor.id, unassignedAt: null },
    select: { courtId: true },
  });
  return [...new Set(a.map((x) => x.courtId))];
}
async function scope(actor) {
  if (actor.role === "ADMIN") return {};
  const ids = await assignedIds(actor);
  return { courtId: { in: ids } };
}
async function assertAssigned(tx, actor, courtId) {
  if (actor.role === "ADMIN") return;
  const a = await tx.courtStaffAssignment.findFirst({
    where: { userId: actor.id, courtId, unassignedAt: null },
  });
  if (!a)
    throw new AppError(
      403,
      "Nhân viên chưa được phân công sân.",
      "COURT_NOT_ASSIGNED",
    );
}
async function list(actor, q) {
  const page = Number(q.page || 1),
    limit = Number(q.limit || 20);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  )
    throw new AppError(400, "Phân trang không hợp lệ.", "INVALID_PAGINATION");
  const where = await scope(actor);
  if (q.courtId) {
    validId(q.courtId);
    where.courtId =
      actor.role === "ADMIN"
        ? q.courtId
        : { in: (await assignedIds(actor)).filter((id) => id === q.courtId) };
  }
  if (q.sportId) {
    validId(q.sportId);
    where.court = { sportId: q.sportId };
  }
  if (q.date) {
    validDate(q.date);
    where.bookingDate = new Date(`${q.date}T00:00:00Z`);
  }
  if (q.status) {
    if (
      ![
        "PENDING_CONFIRMATION",
        "CONFIRMED",
        "CANCELLED",
        "EXPIRED",
        "COMPLETED",
      ].includes(q.status)
    )
      throw new AppError(400, "Trạng thái không hợp lệ.", "INVALID_STATUS");
    where.status = q.status;
  }
  const [data, total] = await Promise.all([
    prisma.courtBooking.findMany({
      where,
      include: { court: { select: { id: true, name: true, sportId: true } } },
      orderBy: [{ bookingDate: "desc" }, { startTime: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.courtBooking.count({ where }),
  ]);
  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
async function schedule(actor, q) {
  if (!q.date) throw new AppError(400, "Thiếu ngày.", "INVALID_DATE");
  return list(actor, { ...q, page: 1, limit: 50 });
}
async function createOffline(actor, body) {
  if (!body || !UUID.test(body.courtId || ""))
    throw new AppError(400, "Sân không hợp lệ.", "INVALID_COURT_ID");
  if (actor.role === "FIELD_STAFF") {
    const ids = await assignedIds(actor);
    if (!ids.includes(body.courtId))
      throw new AppError(
        403,
        "Nhân viên chưa được phân công sân.",
        "COURT_NOT_ASSIGNED",
      );
  }
  return customerService.createSingleBooking({
    ...body,
    userId: actor.id,
    userRole: actor.role,
    source: "OFFLINE",
  });
}
async function transition(actor, id, action) {
  validId(id);
  return prisma.$transaction(
    async (tx) => {
      const locked =
        await tx.$queryRaw`SELECT id FROM court_bookings WHERE id=${id}::uuid FOR UPDATE`;
      if (!locked.length)
        throw new AppError(404, "Không tìm thấy booking.", "BOOKING_NOT_FOUND");
      const b = await tx.courtBooking.findUnique({ where: { id } });
      await assertAssigned(tx, actor, b.courtId);
      if (action === "confirm") {
        if (
          b.status !== "PENDING_CONFIRMATION" ||
          (b.expiresAt && b.expiresAt <= new Date())
        )
          throw new AppError(
            409,
            "Booking không thể xác nhận.",
            "INVALID_BOOKING_STATE",
          );
        return tx.courtBooking.update({
          where: { id },
          data: { status: "CONFIRMED", expiresAt: null },
        });
      }
      if (action === "complete") {
        if (b.status !== "CONFIRMED")
          throw new AppError(
            409,
            "Booking chưa được xác nhận.",
            "INVALID_BOOKING_STATE",
          );
        if (minutesUntilStart(b.bookingDate, b.endTime) > 0)
          throw new AppError(
            409,
            "Chưa đến giờ kết thúc.",
            "BOOKING_NOT_FINISHED",
          );
        return tx.courtBooking.update({
          where: { id },
          data: { status: "COMPLETED" },
        });
      }
      throw new AppError(400, "Hành động không hợp lệ.", "INVALID_ACTION");
    },
    { maxWait: 10000, timeout: 15000 },
  );
}
module.exports = { list, schedule, createOffline, transition };
