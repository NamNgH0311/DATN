const productService = require("./products.service");

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getProducts(req, res, next) {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    // Xử lý an toàn khi tham số q bị lặp dạng ?q=a&q=b (Test Q07)
    let q = req.query.q;
    if (Array.isArray(q)) {
      q = q[0];
    }
    q = typeof q === "string" ? q.trim() : "";

    const sportId = req.query.sportId?.trim() || "";
    const categoryId = req.query.categoryId?.trim() || "";
    const sortBy = req.query.sortBy ?? "createdAt";
    const sortOrder = req.query.sortOrder ?? "desc";
    const inStock = req.query.inStock;
    const minPriceRaw = req.query.minPrice;
    const maxPriceRaw = req.query.maxPrice;
    const validPrice = (v) =>
      typeof v === "string" &&
      v.trim() !== "" &&
      Number.isFinite(Number(v)) &&
      Number(v) >= 0;
    if (
      !["createdAt", "name", "price"].includes(sortBy) ||
      !["asc", "desc"].includes(sortOrder) ||
      (inStock !== undefined && !["true", "false"].includes(inStock)) ||
      (minPriceRaw !== undefined && !validPrice(minPriceRaw)) ||
      (maxPriceRaw !== undefined && !validPrice(maxPriceRaw)) ||
      (minPriceRaw !== undefined &&
        maxPriceRaw !== undefined &&
        Number(minPriceRaw) > Number(maxPriceRaw))
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Tham số lọc hoặc sắp xếp không hợp lệ",
        });
    }
    const minPrice =
      minPriceRaw === undefined ? undefined : Number(minPriceRaw);
    const maxPrice =
      maxPriceRaw === undefined ? undefined : Number(maxPriceRaw);

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    ) {
      return res.status(400).json({
        success: false,
        message: "page phải >= 1; limit phải từ 1 đến 50",
      });
    }

    if (sportId && !UUID_REGEX.test(sportId)) {
      return res.status(400).json({
        success: false,
        message: "sportId phải là UUID hợp lệ",
      });
    }

    if (categoryId && !UUID_REGEX.test(categoryId)) {
      return res.status(400).json({
        success: false,
        message: "categoryId phải là UUID hợp lệ",
      });
    }

    const result = await productService.getProducts({
      page,
      limit,
      q,
      sportId,
      categoryId,
      sortBy,
      sortOrder,
      inStock: inStock === undefined ? undefined : inStock === "true",
      minPrice,
      maxPrice,
    });

    return res.status(200).json({
      success: true,
      data: result.products,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getProductById(req, res, next) {
  try {
    const { id } = req.params;

    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm phải là UUID hợp lệ",
      });
    }

    const product = await productService.getProductById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sản phẩm",
      });
    }

    return res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

async function createProduct(req, res, next) {
  try {
    if (Object.prototype.hasOwnProperty.call(req.body, "images")) {
      return res.status(400).json({
        success: false,
        message:
          "Không gửi trường images khi tạo sản phẩm. Vui lòng sử dụng API POST /products/:productId/images để tải ảnh lên",
      });
    }

    const {
      sportId,
      categoryId,
      name,
      slug,
      shortDescription,
      description,
      specs,
      variants,
    } = req.body;

    // 1. Kiểm tra các trường bắt buộc & độ dài name (Tối đa 255 ký tự - Test M16)
    if (
      !sportId ||
      !categoryId ||
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 255 ||
      typeof slug !== "string" ||
      !slug.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "sportId, categoryId, name (tối đa 255 ký tự) và slug là bắt buộc",
      });
    }

    // Kiểm tra định dạng Slug hợp lệ (Chặn khoảng trắng, thẻ HTML như M15)
    if (!SLUG_REGEX.test(slug.trim())) {
      return res.status(400).json({
        success: false,
        message:
          "slug chỉ được chứa các ký tự chữ thường, số và dấu gạch ngang (-)",
      });
    }

    // 2. Kiểm tra định dạng UUID
    if (!UUID_REGEX.test(sportId) || !UUID_REGEX.test(categoryId)) {
      return res.status(400).json({
        success: false,
        message: "sportId và categoryId phải là UUID hợp lệ",
      });
    }

    // 3. Kiểm tra kiểu dữ liệu của variants
    if (variants !== undefined && !Array.isArray(variants)) {
      return res.status(400).json({
        success: false,
        message: "variants phải là mảng",
      });
    }

    // 5. Kiểm tra từng biến thể sản phẩm
    if (
      variants?.some(
        (variant) =>
          !variant ||
          typeof variant.sku !== "string" ||
          !variant.sku.trim() ||
          (variant.name !== undefined &&
            variant.name !== null &&
            typeof variant.name !== "string") ||
          typeof variant.price !== "number" ||
          !Number.isFinite(variant.price) ||
          variant.price < 0 ||
          (variant.originalPrice !== undefined &&
            variant.originalPrice !== null &&
            (typeof variant.originalPrice !== "number" ||
              !Number.isFinite(variant.originalPrice) ||
              variant.originalPrice < 0)) ||
          (variant.stockQuantity !== undefined &&
            (!Number.isInteger(variant.stockQuantity) ||
              variant.stockQuantity < 0)) ||
          (variant.lowStockThreshold !== undefined &&
            variant.lowStockThreshold !== null &&
            (!Number.isInteger(variant.lowStockThreshold) ||
              variant.lowStockThreshold < 0)),
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Thông tin variants không hợp lệ; mỗi biến thể cần sku và price hợp lệ",
      });
    }

    const product = await productService.createProduct({
      sportId,
      categoryId,
      name: name.trim(),
      slug: slug.trim(),
      shortDescription,
      description,
      specs,
      variants,
    });

    return res.status(201).json({
      success: true,
      message: "Tạo sản phẩm thành công",
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    const {
      sportId,
      categoryId,
      name,
      slug,
      shortDescription,
      description,
      specs,
    } = req.body;

    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm phải là UUID hợp lệ",
      });
    }

    const allowedFields = [
      "sportId",
      "categoryId",
      "name",
      "slug",
      "shortDescription",
      "description",
      "specs",
    ];

    const hasAllowedField = allowedFields.some((field) =>
      Object.prototype.hasOwnProperty.call(req.body, field),
    );

    if (!hasAllowedField) {
      return res.status(400).json({
        success: false,
        message: "Cần cung cấp ít nhất một trường để cập nhật",
      });
    }

    if (
      (sportId !== undefined && !UUID_REGEX.test(sportId)) ||
      (categoryId !== undefined && !UUID_REGEX.test(categoryId))
    ) {
      return res.status(400).json({
        success: false,
        message: "sportId và categoryId phải là UUID hợp lệ",
      });
    }

    if (
      (name !== undefined &&
        (typeof name !== "string" ||
          !name.trim() ||
          name.trim().length > 255)) ||
      (slug !== undefined && (typeof slug !== "string" || !slug.trim()))
    ) {
      return res.status(400).json({
        success: false,
        message:
          "name (tối đa 255 ký tự) và slug phải là chuỗi không được để trống",
      });
    }

    if (slug !== undefined && !SLUG_REGEX.test(slug.trim())) {
      return res.status(400).json({
        success: false,
        message: "slug không hợp lệ",
      });
    }

    const updateData = {};

    if (sportId !== undefined) updateData.sportId = sportId;
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (name !== undefined) updateData.name = name.trim();
    if (slug !== undefined) updateData.slug = slug.trim();
    if (shortDescription !== undefined)
      updateData.shortDescription = shortDescription;
    if (description !== undefined) updateData.description = description;
    if (specs !== undefined) updateData.specs = specs;

    const product = await productService.updateProduct(id, updateData);

    return res.status(200).json({
      success: true,
      message: "Cập nhật sản phẩm thành công",
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

async function updateProductStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm phải là UUID hợp lệ",
      });
    }

    const allowedStatuses = ["DRAFT", "ACTIVE", "INACTIVE"];

    if (typeof status !== "string" || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status phải là DRAFT, ACTIVE hoặc INACTIVE",
      });
    }

    const product = await productService.updateProductStatus(id, status);

    return res.status(200).json({
      success: true,
      message: "Cập nhật trạng thái sản phẩm thành công",
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

async function getManageProducts(req, res, next) {
  try {
    const page = req.query.page === undefined ? 1 : Number(req.query.page);

    const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);
    const q = req.query.q?.trim() || "";
    const status = req.query.status?.trim() || "";

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    ) {
      return res.status(400).json({
        success: false,
        message: "page phải >= 1; limit phải từ 1 đến 50",
      });
    }

    const allowedStatuses = ["DRAFT", "ACTIVE", "INACTIVE"];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status phải là DRAFT, ACTIVE hoặc INACTIVE",
      });
    }

    const result = await productService.getManageProducts({
      page,
      limit,
      q,
      status,
    });

    return res.status(200).json({
      success: true,
      data: result.products,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getManageProductById(req, res, next) {
  try {
    const { id } = req.params;

    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm phải là UUID hợp lệ",
      });
    }

    const product = await productService.getManageProductById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sản phẩm",
      });
    }

    return res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

async function createProductVariant(req, res, next) {
  try {
    const { productId } = req.params;
    const {
      sku,
      name,
      attributes,
      price,
      originalPrice,
      stockQuantity,
      lowStockThreshold,
    } = req.body;

    if (!UUID_REGEX.test(productId)) {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm phải là UUID hợp lệ",
      });
    }

    if (typeof sku !== "string" || !sku.trim() || sku.trim().length > 100) {
      return res.status(400).json({
        success: false,
        message: "sku là chuỗi bắt buộc và tối đa 100 ký tự",
      });
    }

    if (
      name !== undefined &&
      name !== null &&
      (typeof name !== "string" || name.length > 255)
    ) {
      return res.status(400).json({
        success: false,
        message: "name phải là chuỗi tối đa 255 ký tự hoặc null",
      });
    }

    if (
      attributes !== undefined &&
      attributes !== null &&
      (typeof attributes !== "object" || Array.isArray(attributes))
    ) {
      return res.status(400).json({
        success: false,
        message: "attributes phải là object JSON hoặc null",
      });
    }

    if (
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price < 0 ||
      price > 9999999999.99 ||
      Math.round(price * 100) !== price * 100
    ) {
      return res.status(400).json({
        success: false,
        message: "price phải là số hợp lệ từ 0 đến 9999999999.99",
      });
    }

    const variant = await productService.createProductVariant(productId, {
      sku: sku.trim(),
      name,
      attributes,
      price,
      originalPrice,
      stockQuantity,
      lowStockThreshold,
    });

    return res.status(201).json({
      success: true,
      message: "Tạo biến thể sản phẩm thành công",
      data: variant,
    });
  } catch (error) {
    next(error);
  }
}

async function updateProductVariant(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body ?? {};
    const { sku, name, attributes, price, originalPrice, lowStockThreshold } =
      body;

    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        message: "ID biến thể phải là UUID hợp lệ",
      });
    }

    if (Object.prototype.hasOwnProperty.call(body, "stockQuantity")) {
      return res.status(400).json({
        success: false,
        message:
          "Không thể cập nhật tồn kho qua API biến thể. Vui lòng điều chỉnh tồn kho bằng nghiệp vụ Inventory",
      });
    }

    const allowedFields = [
      "sku",
      "name",
      "attributes",
      "price",
      "originalPrice",
      "lowStockThreshold",
    ];

    const hasAllowedField = allowedFields.some((field) =>
      Object.prototype.hasOwnProperty.call(body, field),
    );

    if (!hasAllowedField) {
      return res.status(400).json({
        success: false,
        message: "Cần cung cấp ít nhất một trường để cập nhật",
      });
    }

    const variant = await productService.updateProductVariant(id, body);

    return res.status(200).json({
      success: true,
      message: "Cập nhật biến thể sản phẩm thành công",
      data: variant,
    });
  } catch (error) {
    next(error);
  }
}

async function updateProductVariantStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        message: "ID biến thể phải là UUID hợp lệ",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive phải là true hoặc false",
      });
    }

    const variant = await productService.updateProductVariantStatus(
      id,
      isActive,
    );

    return res.status(200).json({
      success: true,
      message: "Cập nhật trạng thái biến thể thành công",
      data: variant,
    });
  } catch (error) {
    next(error);
  }
}

async function uploadProductImages(req, res, next) {
  try {
    const { productId } = req.params;

    if (!UUID_REGEX.test(productId)) {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm phải là UUID hợp lệ",
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn ít nhất một hình ảnh",
      });
    }

    const images = await productService.uploadProductImages(
      productId,
      req.files,
    );

    return res.status(201).json({
      success: true,
      message: "Upload hình ảnh sản phẩm thành công",
      data: images,
    });
  } catch (error) {
    next(error);
  }
}

async function deleteProductImage(req, res, next) {
  try {
    const { productId, imageId } = req.params;

    if (!UUID_REGEX.test(productId) || !UUID_REGEX.test(imageId)) {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm và ID hình ảnh phải là UUID hợp lệ",
      });
    }

    const result = await productService.deleteProductImage(productId, imageId);

    return res.status(200).json({
      success: true,
      message: result.message,
      data: { id: result.id },
    });
  } catch (error) {
    next(error);
  }
}

async function setPrimaryProductImage(req, res, next) {
  try {
    const { productId, imageId } = req.params;

    if (!UUID_REGEX.test(productId) || !UUID_REGEX.test(imageId)) {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm và ID hình ảnh phải là UUID hợp lệ",
      });
    }

    const result = await productService.setPrimaryProductImage(
      productId,
      imageId,
    );

    return res.status(200).json({
      success: true,
      message: "Đặt ảnh chính thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function updateProductImage(req, res, next) {
  try {
    const { productId, imageId } = req.params;
    const { altText, sortOrder } = req.body;

    if (!UUID_REGEX.test(productId) || !UUID_REGEX.test(imageId)) {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm và ID hình ảnh phải là UUID hợp lệ",
      });
    }

    const result = await productService.updateProductImage(productId, imageId, {
      altText,
      sortOrder,
    });

    return res.status(200).json({
      success: true,
      message: "Cập nhật thông tin hình ảnh thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProducts,
  getProductById,
  getManageProducts,
  getManageProductById,
  createProduct,
  updateProduct,
  updateProductStatus,
  createProductVariant,
  updateProductVariant,
  updateProductVariantStatus,
  uploadProductImages,
  deleteProductImage,
  setPrimaryProductImage,
  updateProductImage,
};
