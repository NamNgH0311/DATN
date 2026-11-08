const express = require("express");

const app = express();

const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./modules/auth/auth.routes");
const productRoutes = require("./modules/products/products.routes");
const courtsRoutes = require("./modules/courts/courts.routes");
const courtBookingsRoutes = require("./modules/court-bookings/court-bookings.routes");
const adminCourtBookingsRoutes = require("./modules/admin-court-bookings/admin-court-bookings.routes");

const notFoundMiddleware = require("./middlewares/notFound.middleware");
const errorMiddleware = require("./middlewares/error.middleware");

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({ success: true, message: "SportHub API is running" });
});

app.use(healthRoutes);
app.use(authRoutes);
app.use(productRoutes);

app.use(courtsRoutes);
app.use(courtBookingsRoutes);
app.use(adminCourtBookingsRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
