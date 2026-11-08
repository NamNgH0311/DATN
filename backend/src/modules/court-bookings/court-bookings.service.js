const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const prisma = require("../../lib/prisma");
const AppError = require("../../utils/AppError");
const { minutesUntilStart } = require("../../middlewares/validate.middleware");

dayjs.extend(utc);
dayjs.extend(timezone);

const TX_OPTIONS = {
  maxWait: 10000,
  timeout: 15000,
};

function parseBookingDate(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function parseBookingTime(timeStr) {
  const normalized = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return new Date(`1970-01-01T${normalized}.000Z`);
}

function calculateDurationHours(startTime, endTime) {
  const diffMs = endTime.getTime() - startTime.getTime();
  const hours = diffMs / (1000 * 60 * 60);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new AppError(
      400,
      "Giờ kết thúc phải lớn hơn giờ bắt đầu.",
      "INVALID_TIME_RANGE",
    );
  }
  return hours;
}

function generateCode(prefix) {
  const ts = Date.now();
  const rand = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${ts}-${rand}`;
}

function isPostgresExclusionViolation(error) {
  const rawMsg = String(error?.message || "");
  const metaCode =
    error?.meta?.code || error?.meta?.driverAdapterError?.cause?.code;
  return (
    error?.code === "23P01" ||
    metaCode === "23P01" ||
    rawMsg.includes("23P01") ||
    rawMsg.includes("excl_court_bookings_no_overlap")
  );
}

function isConcurrencyConflictError(error) {
  const rawMsg = String(error?.message || "");
  const metaCode =
    error?.meta?.code || error?.meta?.driverAdapterError?.cause?.code;
  return (
    error?.code === "P2034" ||
    error?.code === "P2028" ||
    error?.code === "40P01" ||
    error?.code === "40001" ||
    metaCode === "40P01" ||
    metaCode === "40001" ||
    rawMsg.includes("40P01") ||
    rawMsg.toLowerCase().includes("deadlock") ||
    rawMsg.toLowerCase().includes("transaction already closed")
  );
}

async function withRetry(fn, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries || !isConcurrencyConflictError(e)) {
        throw e;
      }
    }
  }
}

class CourtBookingsService {
  async validateAndLockCourtsInTx(
    tx,
    courtIds,
    bookingDate,
    startTime,
    endTime,
    userId,
    userRole,
  ) {
    const sortedCourtIds = [...new Set(courtIds)].sort();

    const lockedRows = await tx.$queryRaw`
      SELECT id, name, price_per_hour, status, is_active
      FROM courts
      WHERE id = ANY(${sortedCourtIds}::uuid[])
      ORDER BY id ASC
      FOR UPDATE
    `;

    if (!lockedRows || lockedRows.length !== sortedCourtIds.length) {
      throw new AppError(
        404,
        "Một hoặc nhiều sân không tồn tại trong hệ thống.",
        "COURT_NOT_FOUND",
      );
    }

    if (userRole === "FIELD_STAFF") {
      const assignments = await tx.courtStaffAssignment.findMany({
        where: {
          userId: userId,
          courtId: { in: sortedCourtIds },
          unassignedAt: null,
        },
      });
      const assignedSet = new Set(assignments.map((a) => a.courtId));
      for (const cId of sortedCourtIds) {
        if (!assignedSet.has(cId)) {
          throw new AppError(
            403,
            "Bạn không được phân công quản lý sân này.",
            "COURT_NOT_ASSIGNED",
          );
        }
      }
    }

    for (const court of lockedRows) {
      if (
        !court.is_active ||
        court.status === "MAINTENANCE" ||
        court.status === "TEMPORARILY_LOCKED"
      ) {
        throw new AppError(
          409,
          `Sân "${court.name}" hiện không khả dụng.`,
          "COURT_UNAVAILABLE",
        );
      }
    }

    const conflictingBooking = await tx.courtBooking.findFirst({
      where: {
        courtId: { in: sortedCourtIds },
        bookingDate: bookingDate,
        status: { in: ["PENDING_CONFIRMATION", "CONFIRMED"] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      include: { court: { select: { name: true } } },
    });

    if (conflictingBooking) {
      throw new AppError(
        409,
        `Khung giờ trên sân "${conflictingBooking.court.name}" đã có người đặt trùng.`,
        "BOOKING_TIME_OVERLAP",
      );
    }

    return new Map(lockedRows.map((c) => [c.id, c]));
  }

  // 1. Đặt sân lẻ
  async createSingleBooking(input) {
    const bookingDate = parseBookingDate(input.bookingDate);
    const startTime = parseBookingTime(input.startTime);
    const endTime = parseBookingTime(input.endTime);
    const durationHours = calculateDurationHours(startTime, endTime);

    return withRetry(async () => {
      try {
        return await prisma.$transaction(async (tx) => {
          if (input.userId && input.source !== "OFFLINE") {
            const pendingCount = await tx.courtBooking.count({
              where: {
                userId: input.userId,
                status: "PENDING_CONFIRMATION",
                bookingDate: { gte: new Date() },
              },
            });

            if (pendingCount >= 3) {
              throw new AppError(
                409,
                "Bạn đang có quá nhiều lượt đặt sân chờ xác nhận (tối đa 3).",
                "TOO_MANY_PENDING_BOOKINGS",
              );
            }
          }

          const courtMap = await this.validateAndLockCourtsInTx(
            tx,
            [input.courtId],
            bookingDate,
            startTime,
            endTime,
            input.userId,
            input.userRole,
          );

          const court = courtMap.get(input.courtId);
          const totalAmount = Number(court.price_per_hour) * durationHours;
          const isOffline = input.source === "OFFLINE";
          const expiresAt = isOffline
            ? null
            : dayjs().add(15, "minute").toDate();

          const booking = await tx.courtBooking.create({
            data: {
              bookingCode: generateCode("BK"),
              courtId: input.courtId,
              userId: isOffline ? null : input.userId,
              createdByUserId: input.userId,
              customerName: input.customerName.trim(),
              customerPhone: input.customerPhone.trim(),
              bookingDate,
              startTime,
              endTime,
              totalAmount,
              source: input.source,
              status: isOffline ? "CONFIRMED" : "PENDING_CONFIRMATION",
              expiresAt,
              paymentMethod: input.paymentMethod || "CASH",
              paymentStatus: "UNPAID",
              note: input.note || null,
            },
          });

          return booking;
        }, TX_OPTIONS);
      } catch (error) {
        if (isPostgresExclusionViolation(error)) {
          throw new AppError(
            409,
            "Khung giờ bạn chọn trên sân này vừa có người đặt trùng.",
            "BOOKING_TIME_OVERLAP",
          );
        }
        if (isConcurrencyConflictError(error)) {
          throw new AppError(
            409,
            "Xung đột giao dịch đồng thời. Vui lòng thử lại.",
            "CONCURRENT_MODIFICATION_CONFLICT",
          );
        }
        throw error;
      }
    });
  }

  async createGroupBooking(input) {
    const uniqueCourtIds = [...new Set(input.courtIds)].sort();
    const bookingDate = parseBookingDate(input.bookingDate);
    const startTime = parseBookingTime(input.startTime);
    const endTime = parseBookingTime(input.endTime);
    const durationHours = calculateDurationHours(startTime, endTime);

    return withRetry(async () => {
      try {
        return await prisma.$transaction(async (tx) => {
          const courtMap = await this.validateAndLockCourtsInTx(
            tx,
            uniqueCourtIds,
            bookingDate,
            startTime,
            endTime,
            input.ownerUserId,
            "CUSTOMER",
          );

          const groupCode = generateCode("GRP");
          const group = await tx.courtBookingGroup.create({
            data: {
              groupCode,
              ownerUserId: input.ownerUserId,
              title: input.title.trim(),
              description: input.description || null,
              bookingDate,
              startTime,
              endTime,
              requiredMembers: input.requiredMembers,
              currentMembers: 1,
              status: "RECRUITING",
              slotAmount: input.slotAmount ?? 0,
            },
          });

          const indexMap = new Map(
            uniqueCourtIds.map((id, idx) => [id, idx + 1]),
          );
          const bookingsByOriginalOrder = new Array(uniqueCourtIds.length);

          for (const courtId of uniqueCourtIds) {
            const court = courtMap.get(courtId);
            const seqNumber = indexMap.get(courtId);
            const totalAmount = Number(court.price_per_hour) * durationHours;

            const booking = await tx.courtBooking.create({
              data: {
                bookingCode: `${groupCode}-S${seqNumber}`,
                courtId,
                userId: input.ownerUserId,
                createdByUserId: input.ownerUserId,
                groupId: group.id,
                customerName: input.customerName.trim(),
                customerPhone: input.customerPhone.trim(),
                bookingDate,
                startTime,
                endTime,
                totalAmount,
                source: "ONLINE",
                status: "PENDING_CONFIRMATION",
                expiresAt: dayjs().add(15, "minute").toDate(),
                paymentMethod: input.paymentMethod || "CASH",
                paymentStatus: "UNPAID",
              },
            });

            bookingsByOriginalOrder[seqNumber - 1] = booking;
          }

          await tx.courtBookingGroupMember.create({
            data: {
              groupId: group.id,
              userId: input.ownerUserId,
              role: "OWNER",
              status: "JOINED",
              assignedCourtBookingId: bookingsByOriginalOrder[0].id,
            },
          });

          return { group, bookings: bookingsByOriginalOrder };
        }, TX_OPTIONS);
      } catch (error) {
        if (isPostgresExclusionViolation(error)) {
          throw new AppError(
            409,
            "Một trong các sân bạn chọn đã bị trùng lịch.",
            "GROUP_OVERLAP",
          );
        }
        if (isConcurrencyConflictError(error)) {
          throw new AppError(
            409,
            "Xung đột giao dịch đồng thời.",
            "CONCURRENT_MODIFICATION_CONFLICT",
          );
        }
        throw error;
      }
    });
  }

  async joinGroup(groupId, userId) {
    return withRetry(async () => {
      return prisma.$transaction(async (tx) => {
        const lockedGroups = await tx.$queryRaw`
          SELECT id, status, current_members, required_members, booking_date, start_time
          FROM court_booking_groups
          WHERE id = ${groupId}::uuid
          FOR UPDATE
        `;

        if (!lockedGroups || lockedGroups.length === 0) {
          throw new AppError(
            404,
            "Nhóm chơi không tồn tại.",
            "GROUP_NOT_FOUND",
          );
        }

        const group = lockedGroups[0];

        if (minutesUntilStart(group.booking_date, group.start_time) <= 60) {
          throw new AppError(
            409,
            "Đã hết hạn tham gia nhóm (phải còn hơn 60 phút trước giờ chơi).",
            "JOIN_WINDOW_EXPIRED",
          );
        }

        const existingMember = await tx.courtBookingGroupMember.findFirst({
          where: { groupId, userId, status: "JOINED" },
        });

        if (existingMember) {
          throw new AppError(
            400,
            "Bạn đã là thành viên của nhóm này rồi.",
            "ALREADY_MEMBER",
          );
        }

        if (
          group.status === "FULL" ||
          group.current_members >= group.required_members
        ) {
          throw new AppError(
            400,
            "Nhóm đã đủ số lượng thành viên.",
            "GROUP_FULL",
          );
        }

        if (group.status !== "RECRUITING") {
          throw new AppError(
            400,
            "Nhóm hiện không nhận thêm thành viên.",
            "GROUP_NOT_AVAILABLE",
          );
        }

        const incrementResult = await tx.courtBookingGroup.updateMany({
          where: {
            id: groupId,
            status: "RECRUITING",
            currentMembers: { lt: group.required_members },
          },
          data: { currentMembers: { increment: 1 } },
        });

        if (incrementResult.count !== 1) {
          throw new AppError(409, "Nhóm đã đủ thành viên.", "GROUP_FULL");
        }

        const previousLeft = await tx.courtBookingGroupMember.findFirst({
          where: { groupId, userId, status: "LEFT" },
          orderBy: { joinedAt: "desc" },
        });

        if (previousLeft) {
          await tx.courtBookingGroupMember.update({
            where: { id: previousLeft.id },
            data: { status: "JOINED", joinedAt: new Date(), leftAt: null },
          });
        } else {
          await tx.courtBookingGroupMember.create({
            data: { groupId, userId, role: "MEMBER", status: "JOINED" },
          });
        }

        const updatedGroup = await tx.courtBookingGroup.findUnique({
          where: { id: groupId },
        });
        if (updatedGroup.currentMembers >= updatedGroup.requiredMembers) {
          return tx.courtBookingGroup.update({
            where: { id: groupId },
            data: { status: "FULL" },
          });
        }

        return updatedGroup;
      }, TX_OPTIONS);
    });
  }

  async leaveGroup(groupId, userId) {
    return withRetry(async () => {
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM court_booking_groups WHERE id = ${groupId}::uuid FOR UPDATE`;

        const group = await tx.courtBookingGroup.findUnique({
          where: { id: groupId },
        });
        if (!group)
          throw new AppError(
            404,
            "Nhóm chơi không tồn tại.",
            "GROUP_NOT_FOUND",
          );

        const member = await tx.courtBookingGroupMember.findFirst({
          where: { groupId, userId, status: "JOINED" },
        });

        if (!member)
          throw new AppError(
            404,
            "Bạn không có trong nhóm này.",
            "MEMBER_NOT_FOUND",
          );
        if (member.role === "OWNER")
          throw new AppError(
            400,
            "Chủ nhóm không thể rời nhóm.",
            "OWNER_CANNOT_LEAVE",
          );

        if (["CANCELLED", "COMPLETED", "PLAYING"].includes(group.status)) {
          throw new AppError(
            409,
            "Không thể rời nhóm ở trạng thái hiện tại.",
            "GROUP_NOT_AVAILABLE",
          );
        }

        if (minutesUntilStart(group.bookingDate, group.startTime) <= 60) {
          throw new AppError(
            400,
            "Không thể rời nhóm khi thời gian bắt đầu còn 60 phút hoặc ít hơn.",
            "LEAVE_WINDOW_EXPIRED",
          );
        }

        await tx.courtBookingGroupMember.updateMany({
          where: { id: member.id, status: "JOINED" },
          data: {
            status: "LEFT",
            leftAt: new Date(),
            assignedCourtBookingId: null,
          },
        });

        await tx.courtBookingGroup.updateMany({
          where: { id: groupId, currentMembers: { gt: 1 } },
          data: { currentMembers: { decrement: 1 }, status: "RECRUITING" },
        });

        return tx.courtBookingGroup.findUnique({ where: { id: groupId } });
      }, TX_OPTIONS);
    });
  }

  // 5. Hủy nhóm (Cancel Group)
  async cancelGroup(groupId, userId, userRole) {
    return withRetry(async () => {
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM court_booking_groups WHERE id = ${groupId}::uuid FOR UPDATE`;

        const group = await tx.courtBookingGroup.findUnique({
          where: { id: groupId },
        });
        if (!group)
          throw new AppError(
            404,
            "Nhóm chơi không tồn tại.",
            "GROUP_NOT_FOUND",
          );

        if (
          userRole !== "ADMIN" &&
          userRole !== "FIELD_STAFF" &&
          group.ownerUserId !== userId
        ) {
          throw new AppError(
            403,
            "Bạn không có quyền hủy nhóm này.",
            "FORBIDDEN",
          );
        }

        if (userRole === "FIELD_STAFF") {
          const groupCourts = await tx.courtBooking.findMany({
            where: { groupId },
            select: { courtId: true },
          });
          const ids = [...new Set(groupCourts.map((b) => b.courtId))];
          const assigned = await tx.courtStaffAssignment.count({
            where: { userId, courtId: { in: ids }, unassignedAt: null },
          });
          if (!ids.length || assigned !== ids.length)
            throw new AppError(
              403,
              "Bạn không được phân công quản lý toàn bộ sân trong nhóm.",
              "COURT_NOT_ASSIGNED",
            );
        }

        if (group.status === "CANCELLED") {
          throw new AppError(
            409,
            "Nhóm đã được hủy trước đó.",
            "GROUP_ALREADY_CANCELLED",
          );
        }

        if (["COMPLETED", "PLAYING"].includes(group.status)) {
          throw new AppError(
            409,
            "Không thể hủy nhóm đang diễn ra hoặc đã hoàn tất.",
            "GROUP_CANNOT_BE_CANCELLED",
          );
        }

        if (
          userRole === "CUSTOMER" &&
          minutesUntilStart(group.bookingDate, group.startTime) < 60
        ) {
          throw new AppError(
            400,
            "Chỉ được phép hủy nhóm khi còn tối thiểu 60 phút trước giờ bắt đầu.",
            "CANCELLATION_WINDOW_EXPIRED",
          );
        }

        const paidCount = await tx.courtBooking.count({
          where: { groupId, paymentStatus: "PAID" },
        });
        if (paidCount)
          throw new AppError(
            409,
            "Nhóm có booking đã thanh toán; cần quy trình hoàn tiền trước khi hủy.",
            "REFUND_REQUIRED",
          );

        await tx.courtBookingGroup.update({
          where: { id: groupId },
          data: { status: "CANCELLED" },
        });
        await tx.courtBooking.updateMany({
          where: {
            groupId,
            status: { not: "COMPLETED" },
            paymentStatus: { not: "PAID" },
          },
          data: { status: "CANCELLED" },
        });
        await tx.courtBookingGroupMember.updateMany({
          where: { groupId, status: "JOINED" },
          data: {
            status: "LEFT",
            leftAt: new Date(),
            assignedCourtBookingId: null,
          },
        });

        return { message: "Đã hủy toàn bộ nhóm chơi thành công." };
      }, TX_OPTIONS);
    });
  }
  async cancelSingleBooking(bookingId, userId, userRole) {
    return withRetry(async () => {
      return prisma.$transaction(async (tx) => {
        const booking = await tx.courtBooking.findUnique({
          where: { id: bookingId },
        });

        if (!booking) {
          throw new AppError(
            404,
            "Không tìm thấy lượt đặt sân.",
            "BOOKING_NOT_FOUND",
          );
        }

        if (booking.groupId)
          throw new AppError(
            409,
            "Vui lòng hủy theo nhóm chơi.",
            "GROUP_BOOKING_CANCEL_REQUIRED",
          );

        if (userRole === "CUSTOMER") {
          if (booking.userId !== userId) {
            throw new AppError(
              403,
              "Bạn không có quyền hủy lượt đặt sân này.",
              "FORBIDDEN",
            );
          }
        } else if (userRole !== "ADMIN") {
          throw new AppError(
            403,
            "Bạn không có quyền hủy lượt đặt sân.",
            "FORBIDDEN",
          );
        }

        if (booking.status === "CANCELLED" || booking.status === "EXPIRED") {
          throw new AppError(
            409,
            "Lượt đặt sân đã được hủy hoặc đã hết hạn trước đó.",
            "BOOKING_ALREADY_INACTIVE",
          );
        }

        if (booking.status === "COMPLETED") {
          throw new AppError(
            409,
            "Không thể hủy lượt đặt sân đã hoàn tất.",
            "BOOKING_ALREADY_COMPLETED",
          );
        }

        if (minutesUntilStart(booking.bookingDate, booking.startTime) < 60) {
          throw new AppError(
            400,
            "Chỉ được phép hủy lượt đặt sân khi còn tối thiểu 60 phút trước giờ bắt đầu.",
            "CANCELLATION_WINDOW_EXPIRED",
          );
        }

        const updatedBooking = await tx.courtBooking.update({
          where: { id: bookingId },
          data: { status: "CANCELLED" },
        });

        return updatedBooking;
      }, TX_OPTIONS);
    });
  }
  async myBookings(userId, query) {
    const page = Number(query.page || 1),
      limit = Number(query.limit || 20);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      throw new AppError(400, "Phân trang không hợp lệ.", "INVALID_PAGINATION");
    const where = { userId };
    const [data, total] = await Promise.all([
      prisma.courtBooking.findMany({
        where,
        include: {
          court: { select: { id: true, name: true, sportId: true } },
          group: { select: { id: true, title: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
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

  async bookingDetail(id, userId) {
    const booking = await prisma.courtBooking.findUnique({
      where: { id },
      include: {
        court: { select: { id: true, name: true, sportId: true } },
        group: { select: { id: true, title: true, status: true } },
      },
    });
    if (!booking || booking.userId !== userId)
      throw new AppError(
        404,
        "Không tìm thấy lượt đặt sân.",
        "BOOKING_NOT_FOUND",
      );
    return booking;
  }

  async listGroups(query) {
    const page = Number(query.page || 1),
      limit = Number(query.limit || 20);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      throw new AppError(400, "Phân trang không hợp lệ.", "INVALID_PAGINATION");
    const where = {
      status: { in: ["RECRUITING", "FULL"] },
      bookings: {
        some: { status: { in: ["PENDING_CONFIRMATION", "CONFIRMED"] } },
      },
    };
    if (query.sportId) {
      if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(query.sportId))
        throw new AppError(400, "sportId không hợp lệ.", "INVALID_SPORT_ID");
      where.bookings.some.court = { sportId: query.sportId };
    }
    if (query.date) {
      if (
        typeof query.date !== "string" ||
        !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(query.date)
      )
        throw new AppError(400, "Ngày không hợp lệ.", "INVALID_DATE");
      const d = new Date(`${query.date}T00:00:00.000Z`);
      if (
        Number.isNaN(d.getTime()) ||
        d.toISOString().slice(0, 10) !== query.date
      )
        throw new AppError(400, "Ngày không hợp lệ.", "INVALID_DATE");
      where.bookingDate = d;
    }
    const [data, total] = await Promise.all([
      prisma.courtBookingGroup.findMany({
        where,
        include: {
          bookings: {
            select: {
              id: true,
              courtId: true,
              status: true,
              court: { select: { name: true, sportId: true } },
            },
          },
        },
        orderBy: [{ bookingDate: "asc" }, { startTime: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.courtBookingGroup.count({ where }),
    ]);
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async groupDetail(id) {
    // Public endpoint: only return display-safe fields, never booking PII, member userId or payment metadata.
    const group = await prisma.courtBookingGroup.findUnique({
      where: { id },
      select: {
        id: true,
        groupCode: true,
        title: true,
        description: true,
        bookingDate: true,
        startTime: true,
        endTime: true,
        requiredMembers: true,
        currentMembers: true,
        status: true,
        createdAt: true,
        bookings: {
          select: {
            id: true,
            courtId: true,
            status: true,
            court: { select: { id: true, name: true, sportId: true } },
          },
        },
        members: {
          where: { status: "JOINED" },
          select: { role: true, joinedAt: true },
        },
      },
    });
    if (!group)
      throw new AppError(404, "Không tìm thấy nhóm chơi.", "GROUP_NOT_FOUND");
    return group;
  }

  async expirePendingBookings() {
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const expired = await tx.courtBooking.updateMany({
        where: { status: "PENDING_CONFIRMATION", expiresAt: { lte: now } },
        data: { status: "EXPIRED" },
      });
      const groups = await tx.courtBookingGroup.findMany({
        where: {
          status: { in: ["RECRUITING", "FULL"] },
          bookings: { every: { status: { in: ["EXPIRED", "CANCELLED"] } } },
        },
        select: { id: true },
      });
      if (groups.length)
        await tx.courtBookingGroup.updateMany({
          where: { id: { in: groups.map((g) => g.id) } },
          data: { status: "CANCELLED" },
        });
      return { expiredBookings: expired.count, cancelledGroups: groups.length };
    }, TX_OPTIONS);
  }
}

module.exports = new CourtBookingsService();
