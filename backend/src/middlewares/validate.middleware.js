const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const AppError = require("../utils/AppError");

dayjs.extend(utc);
dayjs.extend(timezone);

const BUSINESS_TZ = "Asia/Ho_Chi_Minh";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:00)?$/;
const ALLOWED_PAYMENT_METHODS = [
  "COD",
  "CASH",
  "BANK_TRANSFER",
  "SANDBOX_GATEWAY",
];

function isValidStrictDate(dateStr) {
  if (typeof dateStr !== "string" || !DATE_REGEX.test(dateStr)) {
    return false;
  }
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function minutesUntilStart(bookingDate, startTime) {
  const d = dayjs.utc(bookingDate).format("YYYY-MM-DD");
  const t = dayjs.utc(startTime).format("HH:mm:ss");
  return dayjs
    .tz(`${d} ${t}`, "YYYY-MM-DD HH:mm:ss", BUSINESS_TZ)
    .diff(dayjs(), "minute", true);
}

function validateBookingDateValue(bookingDate, startTime) {
  if (!isValidStrictDate(bookingDate)) {
    throw new AppError(400, "Ngày đặt sân không hợp lệ.", "INVALID_DATE");
  }

  if (minutesUntilStart(bookingDate, startTime) < 0) {
    throw new AppError(
      400,
      "Không thể đặt khung giờ đã qua.",
      "PAST_BOOKING_TIME",
    );
  }

  const today = dayjs().tz(BUSINESS_TZ).startOf("day");
  const targetDate = dayjs.tz(bookingDate, BUSINESS_TZ).startOf("day");
  const diffDays = targetDate.diff(today, "day");

  if (diffDays > 30) {
    throw new AppError(
      400,
      "Chỉ được phép đặt sân trước tối đa 30 ngày.",
      "BOOKING_DATE_TOO_FAR",
    );
  }
}

function validateBookingTimeRange(startTime, endTime) {
  if (
    typeof startTime !== "string" ||
    typeof endTime !== "string" ||
    !TIME_REGEX.test(startTime) ||
    !TIME_REGEX.test(endTime)
  ) {
    throw new AppError(
      400,
      "Định dạng giờ không hợp lệ (HH:mm).",
      "INVALID_TIME_FORMAT",
    );
  }

  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);

  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  if (endMinutes <= startMinutes) {
    throw new AppError(
      400,
      "Giờ kết thúc phải lớn hơn giờ bắt đầu.",
      "INVALID_TIME_RANGE",
    );
  }

  if (sm !== 0 || em !== 0) {
    throw new AppError(
      400,
      "Chỉ hỗ trợ đặt sân theo khung giờ chẵn (ví dụ 10:00, 11:00).",
      "INVALID_TIME_STEP",
    );
  }

  const durationMinutes = endMinutes - startMinutes;
  if (
    durationMinutes < 60 ||
    durationMinutes > 480 ||
    durationMinutes % 60 !== 0
  ) {
    throw new AppError(
      400,
      "Thời lượng đặt sân phải theo bội số của 1 giờ và không quá 8 giờ.",
      "INVALID_DURATION",
    );
  }

  if (sh < 6 || eh > 23 || (eh === 23 && em > 0)) {
    throw new AppError(
      400,
      "Khung giờ đặt nằm ngoài giờ hoạt động của sân (06:00 - 23:00).",
      "OUTSIDE_OPERATING_HOURS",
    );
  }
}

function validateCustomerFields(customerName, customerPhone) {
  if (
    typeof customerName !== "string" ||
    customerName.trim().length === 0 ||
    customerName.trim().length > 120
  ) {
    throw new AppError(
      400,
      "Tên khách hàng không được để trống và tối đa 120 ký tự.",
      "INVALID_CUSTOMER_NAME",
    );
  }

  if (
    typeof customerPhone !== "string" ||
    customerPhone.trim().length === 0 ||
    customerPhone.trim().length > 20
  ) {
    throw new AppError(
      400,
      "Số điện thoại không được để trống và tối đa 20 ký tự.",
      "INVALID_CUSTOMER_PHONE",
    );
  }
}

function validatePaymentMethodField(paymentMethod) {
  if (
    paymentMethod !== undefined &&
    paymentMethod !== null &&
    !ALLOWED_PAYMENT_METHODS.includes(paymentMethod)
  ) {
    throw new AppError(
      400,
      "Phương thức thanh toán không hợp lệ.",
      "INVALID_PAYMENT_METHOD",
    );
  }
}

function validateSingleBooking(req, res, next) {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AppError(400, "Dữ liệu yêu cầu không hợp lệ.", "INVALID_INPUT");
    }

    const {
      courtId,
      bookingDate,
      startTime,
      endTime,
      customerName,
      customerPhone,
      paymentMethod,
    } = body;

    if (typeof courtId !== "string" || !UUID_REGEX.test(courtId)) {
      throw new AppError(
        400,
        "Mã sân (courtId) không hợp lệ.",
        "INVALID_COURT_ID",
      );
    }

    validateBookingTimeRange(startTime, endTime);
    validateBookingDateValue(bookingDate, startTime);
    validateCustomerFields(customerName, customerPhone);
    validatePaymentMethodField(paymentMethod);

    return next();
  } catch (err) {
    return next(err);
  }
}

function validateGroupBooking(req, res, next) {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AppError(400, "Dữ liệu yêu cầu không hợp lệ.", "INVALID_INPUT");
    }

    const {
      title,
      courtIds,
      bookingDate,
      startTime,
      endTime,
      requiredMembers,
      slotAmount,
      customerName,
      customerPhone,
      paymentMethod,
    } = body;

    if (!Array.isArray(courtIds) || courtIds.length === 0) {
      throw new AppError(
        400,
        "Phải chọn ít nhất một sân để tạo nhóm.",
        "INVALID_INPUT",
      );
    }

    for (const id of courtIds) {
      if (typeof id !== "string" || !UUID_REGEX.test(id)) {
        throw new AppError(
          400,
          "Danh sách sân chứa mã sân (UUID) không hợp lệ.",
          "INVALID_INPUT",
        );
      }
    }

    const uniqueIds = new Set(courtIds);
    if (uniqueIds.size !== courtIds.length) {
      throw new AppError(
        400,
        "Danh sách sân không được chứa sân trùng lặp.",
        "DUPLICATE_COURT_IDS",
      );
    }

    if (
      typeof title !== "string" ||
      title.trim().length === 0 ||
      title.trim().length > 255
    ) {
      throw new AppError(
        400,
        "Tiêu đề nhóm không được để trống và tối đa 255 ký tự.",
        "INVALID_TITLE",
      );
    }

    if (
      typeof requiredMembers !== "number" ||
      !Number.isInteger(requiredMembers) ||
      requiredMembers < 2
    ) {
      throw new AppError(
        400,
        "Số lượng thành viên cần tuyển (requiredMembers) phải là số nguyên >= 2.",
        "INVALID_REQUIRED_MEMBERS",
      );
    }

    if (slotAmount !== undefined && slotAmount !== null) {
      if (
        typeof slotAmount !== "number" ||
        !Number.isFinite(slotAmount) ||
        slotAmount < 0
      ) {
        throw new AppError(
          400,
          "Mức đóng góp tham khảo (slotAmount) phải là số không âm.",
          "INVALID_SLOT_AMOUNT",
        );
      }
    }

    validateBookingTimeRange(startTime, endTime);
    validateBookingDateValue(bookingDate, startTime);
    validateCustomerFields(customerName, customerPhone);
    validatePaymentMethodField(paymentMethod);

    return next();
  } catch (err) {
    return next(err);
  }
}

function validateGroupIdParam(req, res, next) {
  const { groupId } = req.params;
  if (typeof groupId !== "string" || !UUID_REGEX.test(groupId)) {
    return next(
      new AppError(
        400,
        "Mã nhóm (groupId) không đúng định dạng UUID.",
        "INVALID_UUID",
      ),
    );
  }
  return next();
}

module.exports = {
  validateSingleBooking,
  validateGroupBooking,
  validateGroupIdParam,
  minutesUntilStart,
};
