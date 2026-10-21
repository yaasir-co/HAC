-- Retain historical duplicate observations and submitted snapshots unchanged.
-- Reserve the identity of the first legacy observation; all new writes use this key.
ALTER TABLE `Observation` ADD COLUMN `identityKey` VARCHAR(191) NULL;
UPDATE `Observation` o JOIN (
  SELECT inspectionId, productId, MIN(id) firstId FROM `Observation`
  WHERE productId IS NOT NULL GROUP BY inspectionId, productId
) firsts ON o.id = firsts.firstId
SET o.identityKey = SHA2(CONCAT('product:', o.productId), 256);
CREATE UNIQUE INDEX `Observation_inspectionId_identityKey_key` ON `Observation`(`inspectionId`, `identityKey`);
CREATE TABLE `CatalogueImage` (
  `id` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `storedName` VARCHAR(191) NOT NULL,
  `mimeType` VARCHAR(191) NOT NULL,
  `sha256` VARCHAR(191) NOT NULL,
  `byteSize` INTEGER NOT NULL,
  `uploadedById` VARCHAR(191) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CatalogueImage_kind_ownerId_key` (`kind`, `ownerId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
