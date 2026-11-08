/*
  Warnings:

  - A unique constraint covering the columns `[public_id]` on the table `product_images` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `public_id` to the `product_images` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "public_id" VARCHAR(255) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "product_images_public_id_key" ON "product_images"("public_id");
