const prisma = require("../../lib/prisma");
const AppError = require("../../utils/AppError");

const {
  uploadImage,
  deleteImage,
} = require("../../services/cloudinary.service");

async function getProducts({
  page,
  limit,
  q,
  sportId,
  categoryId,
  sortBy = "createdAt",
  sortOrder = "desc",
  inStock,
  minPrice,
  maxPrice,
}) {
  const variantWhere = { isActive: true };
  if (inStock === true) variantWhere.stockQuantity = { gt: 0 };
  if (inStock === false) variantWhere.stockQuantity = { lte: 0 };
  if (minPrice !== undefined || maxPrice !== undefined) {
    variantWhere.price = {
      ...(minPrice !== undefined ? { gte: minPrice } : {}),
      ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
    };
  }

  const where = {
    status: "ACTIVE",
    sport: { isActive: true },
    category: { isActive: true },
    variants: { some: variantWhere },
    ...(sportId ? { sportId } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { shortDescription: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const select = {
    id: true,
    name: true,
    slug: true,
    shortDescription: true,
    description: true,
    specs: true,
    createdAt: true,
    sport: { select: { id: true, name: true, slug: true } },
    category: { select: { id: true, name: true, slug: true } },
    images: {
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
      select: { id: true, url: true, altText: true, isPrimary: true },
    },
    variants: {
      where: { isActive: true },
      orderBy: { price: "asc" },
      select: {
        id: true,
        sku: true,
        name: true,
        attributes: true,
        price: true,
        originalPrice: true,
        stockQuantity: true,
      },
    },
  };

  if (sortBy !== "price") {
    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ [sortBy]: sortOrder }, { id: "asc" }],
        select,
      }),
      prisma.product.count({ where }),
    ]);
    return { products, total };
  }

  // Price is a property of variants, not products. Aggregate prices for all
  // eligible products BEFORE applying pagination.
  const eligible = await prisma.product.findMany({
    where,
    select: { id: true },
  });
  const ids = eligible.map((p) => p.id);
  if (!ids.length) return { products: [], total: 0 };

  const aggregates = await prisma.productVariant.groupBy({
    by: ["productId"],
    where: { ...variantWhere, productId: { in: ids } },
    _min: { price: true },
  });
  const priceById = new Map(aggregates.map((r) => [r.productId, r._min.price]));
  ids.sort((a, b) => {
    const pa = priceById.get(a);
    const pb = priceById.get(b);
    const cmp = pa.comparedTo(pb);
    return (sortOrder === "asc" ? cmp : -cmp) || a.localeCompare(b);
  });
  const pageIds = ids.slice((page - 1) * limit, page * limit);
  const products = await prisma.product.findMany({
    where: { id: { in: pageIds } },
    select,
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return {
    products: pageIds.map((id) => byId.get(id)).filter(Boolean),
    total: ids.length,
  };
}

async function getProductById(id) {
  const product = await prisma.product.findFirst({
    where: {
      id,
      status: "ACTIVE",
      sport: {
        isActive: true,
      },
      category: {
        isActive: true,
      },
      variants: {
        some: {
          isActive: true,
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      shortDescription: true,
      description: true,
      specs: true,
      createdAt: true,

      sport: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },

      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },

      images: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          url: true,
          altText: true,
          isPrimary: true,
        },
      },

      variants: {
        where: {
          isActive: true,
        },
        orderBy: {
          price: "asc",
        },
        select: {
          id: true,
          sku: true,
          name: true,
          attributes: true,
          price: true,
          originalPrice: true,
          stockQuantity: true,
        },
      },
    },
  });

  return product;
}

async function createProduct(data) {
  const {
    sportId,
    categoryId,
    name,
    slug,
    shortDescription,
    description,
    specs,
    images,
    variants,
  } = data;

  return prisma.$transaction(async (tx) => {
    const sport = await tx.sport.findFirst({
      where: {
        id: sportId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!sport) {
      throw new AppError(
        400,
        "Môn thể thao không tồn tại hoặc đã bị vô hiệu hóa",
        "SPORT_NOT_FOUND",
      );
    }

    const category = await tx.category.findFirst({
      where: {
        id: categoryId,
        sportId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!category) {
      throw new AppError(
        400,
        "Danh mục không hợp lệ hoặc không thuộc môn thể thao đã chọn",
        "INVALID_CATEGORY",
      );
    }

    const product = await tx.product.create({
      data: {
        sportId,
        categoryId,
        name,
        slug,
        shortDescription,
        description,
        specs,
        status: "DRAFT",

        images: {
          create:
            images?.map((image) => ({
              url: image.url,
              publicId: image.publicId,
              altText: image.altText,
              isPrimary: image.isPrimary ?? false,
              sortOrder: image.sortOrder ?? 0,
            })) ?? [],
        },

        variants: {
          create:
            variants?.map((variant) => ({
              sku: variant.sku,
              name: variant.name,
              attributes: variant.attributes,
              price: variant.price,
              originalPrice: variant.originalPrice,
              stockQuantity: variant.stockQuantity ?? 0,
              lowStockThreshold: variant.lowStockThreshold ?? 5,
            })) ?? [],
        },
      },

      select: {
        id: true,
        sportId: true,
        categoryId: true,
        name: true,
        slug: true,
        shortDescription: true,
        description: true,
        specs: true,
        status: true,
        createdAt: true,

        images: {
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        },

        variants: {
          orderBy: { price: "asc" },
        },
      },
    });

    return product;
  });
}

async function updateProduct(id, data) {
  const {
    sportId,
    categoryId,
    name,
    slug,
    shortDescription,
    description,
    specs,
  } = data;

  return prisma.$transaction(async (tx) => {
    const existingProduct = await tx.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingProduct) {
      throw new AppError(404, "Không tìm thấy sản phẩm", "NOT_FOUND");
    }

    if (sportId !== undefined) {
      const sport = await tx.sport.findFirst({
        where: { id: sportId, isActive: true },
        select: { id: true },
      });

      if (!sport) {
        throw new AppError(
          400,
          "Môn thể thao không tồn tại hoặc đã bị vô hiệu hóa",
          "SPORT_NOT_FOUND",
        );
      }
    }

    if (categoryId !== undefined || sportId !== undefined) {
      const current = await tx.product.findUnique({
        where: { id },
        select: { sportId: true, categoryId: true },
      });

      const targetSportId = sportId !== undefined ? sportId : current.sportId;
      const targetCategoryId =
        categoryId !== undefined ? categoryId : current.categoryId;

      const category = await tx.category.findFirst({
        where: {
          id: targetCategoryId,
          sportId: targetSportId,
          isActive: true,
        },
        select: { id: true },
      });

      if (!category) {
        throw new AppError(
          400,
          "Danh mục không hợp lệ hoặc không thuộc môn thể thao đã chọn",
          "INVALID_CATEGORY",
        );
      }
    }

    const updateData = {};

    if (sportId !== undefined) updateData.sportId = sportId;
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (shortDescription !== undefined)
      updateData.shortDescription = shortDescription;
    if (description !== undefined) updateData.description = description;
    if (specs !== undefined) updateData.specs = specs;

    return tx.product.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        sportId: true,
        categoryId: true,
        name: true,
        slug: true,
        shortDescription: true,
        description: true,
        specs: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });
}

async function updateProductStatus(id, status) {
  const existingProduct = await prisma.product.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!existingProduct) {
    throw new AppError(404, "Không tìm thấy sản phẩm", "NOT_FOUND");
  }

  // Chặn kích hoạt lại ACTIVE nếu sản phẩm đã ở trạng thái INACTIVE (Giải quyết Test M31 - Ngừng bán vĩnh viễn)
  if (existingProduct.status === "INACTIVE" && status === "ACTIVE") {
    throw new AppError(
      400,
      "Sản phẩm đã ngừng bán vĩnh viễn, không thể kích hoạt lại. Vui lòng tạo sản phẩm mới",
      "PRODUCT_DISCONTINUED",
    );
  }

  if (status === "ACTIVE") {
    const activeVariantsCount = await prisma.productVariant.count({
      where: { productId: id, isActive: true },
    });
    if (activeVariantsCount === 0) {
      throw new AppError(
        400,
        "Không thể công khai sản phẩm không có biến thể hoạt động",
        "PRODUCT_WITHOUT_VARIANTS",
      );
    }
  }

  return prisma.product.update({
    where: { id },
    data: { status },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      updatedAt: true,
    },
  });
}

async function getManageProducts({ page, limit, q, status }) {
  const where = {};

  if (status) {
    where.status = status;
  }

  if (q) {
    where.name = {
      contains: q,
      mode: "insensitive",
    };
  }

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        slug: true,
        shortDescription: true,
        description: true,
        specs: true,
        status: true,
        createdAt: true,
        updatedAt: true,

        sport: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        },

        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        },

        images: {
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          select: {
            id: true,
            url: true,
            altText: true,
            isPrimary: true,
          },
        },

        variants: {
          orderBy: {
            price: "asc",
          },
          select: {
            id: true,
            sku: true,
            name: true,
            attributes: true,
            price: true,
            originalPrice: true,
            stockQuantity: true,
            isActive: true,
          },
        },
      },
    }),

    prisma.product.count({ where }),
  ]);

  return { products, total };
}

async function getManageProductById(id) {
  return prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      shortDescription: true,
      description: true,
      specs: true,
      status: true,
      createdAt: true,
      updatedAt: true,

      sport: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
        },
      },

      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
        },
      },

      images: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          url: true,
          altText: true,
          sortOrder: true,
          isPrimary: true,
        },
      },

      variants: {
        orderBy: {
          price: "asc",
        },
        select: {
          id: true,
          sku: true,
          name: true,
          attributes: true,
          price: true,
          originalPrice: true,
          stockQuantity: true,
          lowStockThreshold: true,
          isActive: true,
        },
      },
    },
  });
}

async function createProductVariant(productId, data) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });

  if (!product) {
    throw new AppError(404, "Không tìm thấy sản phẩm", "NOT_FOUND");
  }

  return prisma.productVariant.create({
    data: {
      productId,
      sku: data.sku,
      name: data.name,
      attributes: data.attributes,
      price: data.price,
      originalPrice: data.originalPrice,
      stockQuantity: data.stockQuantity ?? 0,
      lowStockThreshold: data.lowStockThreshold ?? 5,
    },
    select: {
      id: true,
      productId: true,
      sku: true,
      name: true,
      attributes: true,
      price: true,
      originalPrice: true,
      stockQuantity: true,
      lowStockThreshold: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function updateProductVariant(id, data = {}) {
  if (Object.prototype.hasOwnProperty.call(data, "stockQuantity")) {
    throw new AppError(
      400,
      "Không thể cập nhật tồn kho qua thông tin biến thể. Vui lòng dùng nghiệp vụ Inventory",
      "STOCK_UPDATE_NOT_ALLOWED",
    );
  }

  const existingVariant = await prisma.productVariant.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existingVariant) {
    throw new AppError(404, "Không tìm thấy biến thể sản phẩm", "NOT_FOUND");
  }

  const updateData = {};

  if (data.sku !== undefined) updateData.sku = data.sku;
  if (data.name !== undefined) updateData.name = data.name;
  if (data.attributes !== undefined) updateData.attributes = data.attributes;
  if (data.price !== undefined) updateData.price = data.price;
  if (data.originalPrice !== undefined)
    updateData.originalPrice = data.originalPrice;
  if (data.lowStockThreshold !== undefined)
    updateData.lowStockThreshold = data.lowStockThreshold;

  return prisma.productVariant.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      productId: true,
      sku: true,
      name: true,
      attributes: true,
      price: true,
      originalPrice: true,
      stockQuantity: true,
      lowStockThreshold: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function updateProductVariantStatus(id, isActive) {
  const existingVariant = await prisma.productVariant.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existingVariant) {
    throw new AppError(404, "Không tìm thấy biến thể sản phẩm", "NOT_FOUND");
  }

  return prisma.productVariant.update({
    where: { id },
    data: { isActive },
    select: {
      id: true,
      productId: true,
      sku: true,
      name: true,
      attributes: true,
      price: true,
      originalPrice: true,
      stockQuantity: true,
      lowStockThreshold: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function uploadProductImages(productId, files) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });

  if (!product) {
    throw new AppError(404, "Không tìm thấy sản phẩm", "NOT_FOUND");
  }

  if (!Array.isArray(files) || files.length === 0) {
    throw new AppError(
      400,
      "Vui lòng chọn ít nhất một hình ảnh",
      "BAD_REQUEST",
    );
  }

  const uploadedImages = [];

  try {
    for (const file of files) {
      const uploaded = await uploadImage(file.buffer);
      uploadedImages.push(uploaded);
    }

    const createdImages = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM products
        WHERE id = ${productId}::uuid
        FOR UPDATE
      `;

      const existingImages = await tx.productImage.findMany({
        where: { productId },
        select: {
          sortOrder: true,
          isPrimary: true,
        },
      });

      const hasPrimaryImage = existingImages.some((image) => image.isPrimary);
      const maxSortOrder = existingImages.reduce(
        (max, image) => Math.max(max, image.sortOrder),
        -1,
      );

      const images = [];

      for (let i = 0; i < uploadedImages.length; i++) {
        const uploaded = uploadedImages[i];

        const image = await tx.productImage.create({
          data: {
            productId,
            url: uploaded.url,
            publicId: uploaded.publicId,
            isPrimary: !hasPrimaryImage && i === 0,
            sortOrder: maxSortOrder + i + 1,
          },
          select: {
            id: true,
            productId: true,
            url: true,
            publicId: true,
            altText: true,
            sortOrder: true,
            isPrimary: true,
            createdAt: true,
          },
        });

        images.push(image);
      }

      return images;
    });

    return createdImages;
  } catch (error) {
    await Promise.allSettled(
      uploadedImages.map((image) => deleteImage(image.publicId)),
    );
    throw error;
  }
}

async function deleteProductImage(productId, imageId) {
  const image = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id
      FROM products
      WHERE id = ${productId}::uuid
      FOR UPDATE
    `;

    const currentImage = await tx.productImage.findFirst({
      where: {
        id: imageId,
        productId,
      },
      select: {
        id: true,
        publicId: true,
        isPrimary: true,
      },
    });

    if (!currentImage) {
      throw new AppError(
        404,
        "Không tìm thấy hình ảnh của sản phẩm",
        "NOT_FOUND",
      );
    }

    await tx.productImage.delete({
      where: { id: imageId },
    });

    if (currentImage.isPrimary) {
      const nextImage = await tx.productImage.findFirst({
        where: { productId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });

      if (nextImage) {
        await tx.productImage.update({
          where: { id: nextImage.id },
          data: { isPrimary: true },
        });
      }
    }

    return currentImage;
  });

  try {
    await deleteImage(image.publicId);
  } catch (error) {
    console.error("[Cloudinary] Lỗi khi xóa ảnh:", error.message);
  }

  return {
    id: image.id,
    message: "Xóa hình ảnh sản phẩm thành công",
  };
}

async function setPrimaryProductImage(productId, imageId) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id
      FROM products
      WHERE id = ${productId}::uuid
      FOR UPDATE
    `;

    const image = await tx.productImage.findFirst({
      where: {
        id: imageId,
        productId,
      },
      select: { id: true },
    });

    if (!image) {
      throw new AppError(
        404,
        "Không tìm thấy hình ảnh của sản phẩm",
        "NOT_FOUND",
      );
    }

    await tx.productImage.updateMany({
      where: { productId },
      data: { isPrimary: false },
    });

    await tx.productImage.update({
      where: { id: imageId },
      data: { isPrimary: true },
    });
  });

  return {
    id: imageId,
    isPrimary: true,
  };
}

async function updateProductImage(productId, imageId, data) {
  const image = await prisma.productImage.findFirst({
    where: {
      id: imageId,
      productId,
    },
    select: { id: true },
  });

  if (!image) {
    throw new AppError(
      404,
      "Không tìm thấy hình ảnh của sản phẩm",
      "NOT_FOUND",
    );
  }

  const updateData = {};

  if (Object.prototype.hasOwnProperty.call(data, "altText")) {
    updateData.altText = data.altText;
  }

  if (Object.prototype.hasOwnProperty.call(data, "sortOrder")) {
    updateData.sortOrder = data.sortOrder;
  }

  return prisma.productImage.update({
    where: { id: imageId },
    data: updateData,
    select: {
      id: true,
      productId: true,
      url: true,
      altText: true,
      sortOrder: true,
      isPrimary: true,
      createdAt: true,
    },
  });
}

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductStatus,
  getManageProducts,
  getManageProductById,
  createProductVariant,
  updateProductVariant,
  updateProductVariantStatus,
  uploadProductImages,
  deleteProductImage,
  setPrimaryProductImage,
  updateProductImage,
};
