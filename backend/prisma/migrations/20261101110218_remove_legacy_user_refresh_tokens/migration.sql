/*
  Warnings:

  - You are about to drop the column `refresh_token_expires_at` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `refresh_token_hash` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "refresh_token_expires_at",
DROP COLUMN "refresh_token_hash";
