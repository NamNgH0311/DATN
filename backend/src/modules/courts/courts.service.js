const prisma = require("../../lib/prisma");
const AppError = require("../../utils/AppError");

async function ensureSport(sportId) {
  const sport = await prisma.sport.findFirst({
    where: { id: sportId, isActive: true },
    select: { id: true, name: true },
  });
  if (!sport)
    throw new AppError(
      404,
      "Môn thể thao không tồn tại hoặc đã ngừng hoạt động.",
      "SPORT_NOT_FOUND",
    );
  return sport;
}
const courtFields = {
  id: true,
  name: true,
  location: true,
  pricePerHour: true,
  status: true,
  isActive: true,
  sportId: true,
};
async function list(sportId) {
  await ensureSport(sportId);
  return prisma.court.findMany({
    where: { sportId, isActive: true },
    select: courtFields,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}
function minuteOf(date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}
function overlaps(a, b, start, end) {
  return a < end && b > start;
}
async function calendar(sportId, date) {
  const sport = await ensureSport(sportId);
  const courts = await prisma.court.findMany({
    where: { sportId, isActive: true },
    select: courtFields,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const courtIds = courts.map((c) => c.id);
  const [bookings, holds] = courtIds.length
    ? await Promise.all([
        prisma.courtBooking.findMany({
          where: {
            courtId: { in: courtIds },
            bookingDate: date,
            status: { in: ["PENDING_CONFIRMATION", "CONFIRMED"] },
          },
          select: { courtId: true, startTime: true, endTime: true },
        }),
        prisma.courtBookingHold.findMany({
          where: {
            courtId: { in: courtIds },
            bookingDate: date,
            expiresAt: { gt: new Date() },
          },
          select: { courtId: true, startTime: true, endTime: true },
        }),
      ])
    : [[], []];
  const busy = new Map(courtIds.map((id) => [id, []]));
  for (const item of [...bookings, ...holds])
    busy
      .get(item.courtId)
      .push([minuteOf(item.startTime), minuteOf(item.endTime)]);
  const hours = Array.from(
    { length: 24 },
    (_, h) => `${String(h).padStart(2, "0")}:00`,
  );
  const rows = courts.map((court) => ({
    ...court,
    slots: hours.map((startTime, h) => {
      const start = h * 60,
        end = start + 60;
      const unavailable =
        court.status === "MAINTENANCE" ||
        court.status === "TEMPORARILY_LOCKED" ||
        court.status === "IN_USE";
      const occupied = busy
        .get(court.id)
        .some(([a, b]) => overlaps(a, b, start, end));
      return {
        startTime,
        endTime: `${String(h + 1).padStart(2, "0")}:00`,
        status: unavailable ? "UNAVAILABLE" : occupied ? "BOOKED" : "AVAILABLE",
      };
    }),
  }));
  return {
    sport,
    date: date.toISOString().slice(0, 10),
    slotMinutes: 60,
    hours,
    courts: rows,
  };
}
module.exports = { list, calendar };
