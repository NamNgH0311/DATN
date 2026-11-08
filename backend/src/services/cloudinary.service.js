const cloudinary = require("../config/cloudinary");

function uploadImage(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "sportzone/products",
        resource_type: "image",
        ...options,
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          width: result.width,
          height: result.height,
        });
      },
    );

    stream.end(buffer);
  });
}

async function deleteImage(publicId) {
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
  });

  return result;
}

module.exports = {
  uploadImage,
  deleteImage,
};
