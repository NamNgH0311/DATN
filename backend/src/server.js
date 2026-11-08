require("dotenv").config();

const app = require("./app");

const port = process.env.PORT || 4000;

const server = app.listen(port, () => {
  console.log(`SportZone API đang chạy tại cổng ${port}`);
});

server.on("error", (error) => {
  console.error("Không thể khởi động server:", error.message);
  process.exit(1);
});
