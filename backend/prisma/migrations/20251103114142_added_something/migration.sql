/*
  Warnings:

  - Added the required column `what_count` to the `updates` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "updates" ADD COLUMN     "what_count" INTEGER NOT NULL;
