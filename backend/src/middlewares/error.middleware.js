function errorMiddleware(err, req, res, next) {
  let status = err.statusCode || err.status || 500;
  let message = err.message || "Đã xảy ra lỗi";
  let code = err.code || "INTERNAL_ERROR";

  const rawMsg = String(err.message || "");
  const metaCode = err.meta?.code || err.meta?.driverAdapterError?.cause?.code;

  if (err instanceof SyntaxError && (err.status === 400 || "body" in err)) {
    status = 400;
    code = "INVALID_JSON";
    message = "Dữ liệu JSON gửi lên không hợp lệ.";
  } else if (err.name === "MulterError") {
    status = 400;
    code = err.code || "UPLOAD_ERROR";

    if (err.code === "LIMIT_FILE_SIZE") {
      status = 413;
      message = "Ảnh vượt quá dung lượng cho phép (5MB)";
    } else if (err.code === "LIMIT_FILE_COUNT") {
      message = "Bạn chỉ được tải lên tối đa 10 ảnh mỗi lần";
    } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
      message = "Thông tin tệp tải lên không hợp lệ";
    } else {
      message = "Không thể tải ảnh lên. Vui lòng thử lại";
    }
  } else if (err.message === "Chỉ chấp nhận file ảnh JPEG, PNG hoặc WEBP") {
    status = 400;
    code = "UNSUPPORTED_FILE_TYPE";
    message = "Chỉ hỗ trợ ảnh định dạng JPG, PNG hoặc WEBP";
  } else if (
    err.code === "23P01" ||
    metaCode === "23P01" ||
    rawMsg.includes("23P01") ||
    rawMsg.includes("excl_court_bookings_no_overlap")
  ) {
    status = 409;
    code = err.businessCode || "BOOKING_TIME_OVERLAP";
    message = "Khung giờ trên sân này đã có người đặt trước.";
  } else if (
    err.code === "P2034" ||
    err.code === "P2028" ||
    err.code === "40P01" ||
    err.code === "40001" ||
    metaCode === "40P01" ||
    metaCode === "40001" ||
    rawMsg.includes("40P01") ||
    rawMsg.toLowerCase().includes("deadlock")
  ) {
    status = 409;
    code = "CONCURRENT_MODIFICATION_CONFLICT";
    message = "Xung đột giao dịch đồng thời. Vui lòng thử lại.";
  } else if (
    err.code === "23514" ||
    metaCode === "23514" ||
    rawMsg.includes("23514") ||
    rawMsg.includes("violates check constraint")
  ) {
    status = 400;
    code = "CHECK_CONSTRAINT_VIOLATION";
    message = "Dữ liệu không thỏa mãn điều kiện ràng buộc.";
  } else if (
    err.code === "P2002" ||
    err.code === "23505" ||
    metaCode === "23505"
  ) {
    status = 409;
    if (
      rawMsg.includes("uq_group_members_active_user") ||
      rawMsg.includes("court_booking_group_members")
    ) {
      status = 400;
      code = "ALREADY_MEMBER";
      message = "Bạn đã là thành viên của nhóm này rồi.";
    } else {
      code = "DUPLICATE_RESOURCE";
      message = "Thông tin đã tồn tại trong hệ thống.";
    }
  } else if (
    err.code === "P2000" ||
    err.code === "P2023" ||
    err.code === "P2003" ||
    err.code === "22P02" ||
    err.code === "22001" ||
    metaCode === "22P02" ||
    metaCode === "22001" ||
    err.name === "PrismaClientValidationError"
  ) {
    status = 400;
    code = "INVALID_INPUT";
    message = "Dữ liệu đầu vào vượt quá giới hạn cho phép hoặc sai định dạng.";
  } else if (err.code === "P2025") {
    status = 404;
    code = "NOT_FOUND";
    message = "Không tìm thấy dữ liệu yêu cầu.";
  }

  if (status >= 500) {
    message = "Hệ thống đang gặp sự cố. Vui lòng thử lại sau";
    code = "INTERNAL_ERROR";
  }

  return res.status(status).json({
    success: false,
    code,
    errorCode: code,
    message,
  });
}

module.exports = errorMiddleware;
