const express = require("express");
const productController = require("./products.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const authorize = require("../../middlewares/authorize.middleware");
const upload = require("../../middlewares/upload.middleware");

const router = express.Router();

router.get("/products", productController.getProducts);

router.get(
  "/products/manage",
  authMiddleware,
  authorize("ADMIN"),
  productController.getManageProducts,
);

router.get(
  "/products/manage/:id",
  authMiddleware,
  authorize("ADMIN"),
  productController.getManageProductById,
);

router.get("/products/:id", productController.getProductById);

router.post(
  "/products",
  authMiddleware,
  authorize("ADMIN"),
  productController.createProduct,
);

router.post(
  "/products/:productId/variants",
  authMiddleware,
  authorize("ADMIN"),
  productController.createProductVariant,
);

router.put(
  "/product-variants/:id",
  authMiddleware,
  authorize("ADMIN"),
  productController.updateProductVariant,
);

router.patch(
  "/product-variants/:id/status",
  authMiddleware,
  authorize("ADMIN"),
  productController.updateProductVariantStatus,
);

router.put(
  "/products/:id",
  authMiddleware,
  authorize("ADMIN"),
  productController.updateProduct,
);

router.patch(
  "/products/:id/status",
  authMiddleware,
  authorize("ADMIN"),
  productController.updateProductStatus,
);

router.post(
  "/products/:productId/images",
  authMiddleware,
  authorize("ADMIN"),
  upload.array("images", 10),
  productController.uploadProductImages,
);

router.delete(
  "/products/:productId/images/:imageId",
  authMiddleware,
  authorize("ADMIN"),
  productController.deleteProductImage,
);

router.patch(
  "/products/:productId/images/:imageId/primary",
  authMiddleware,
  authorize("ADMIN"),
  productController.setPrimaryProductImage,
);

router.patch(
  "/products/:productId/images/:imageId",
  authMiddleware,
  authorize("ADMIN"),
  productController.updateProductImage,
);

module.exports = router;
