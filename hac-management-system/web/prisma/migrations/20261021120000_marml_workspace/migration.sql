-- Preserve existing registrations; a company name alone does not establish a legal registration number.
ALTER TABLE `Company` MODIFY `registrationNumber` VARCHAR(191) NULL;

CREATE TABLE `RawMaterialListing` (
  `id` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `sourceCompanyId` VARCHAR(191) NOT NULL,
  `sourceCompanyName` VARCHAR(191) NOT NULL,
  `sourceDocument` VARCHAR(191) NOT NULL,
  `sourceMetadata` JSON NOT NULL,
  `sourceRow` JSON NOT NULL,
  `sourcePage` INTEGER NOT NULL,
  `rowNumber` INTEGER NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `insNumber` VARCHAR(191) NULL,
  `physicalState` VARCHAR(191) NULL,
  `brand` VARCHAR(191) NULL,
  `manufacturer` TEXT NULL,
  `localSupplier` TEXT NULL,
  `foreignSupplier` TEXT NULL,
  `certificateBody` VARCHAR(191) NULL,
  `certificateExpiry` DATETIME(3) NULL,
  `otherDocument` TEXT NULL,
  `refNo` VARCHAR(191) NULL,
  `remarks` TEXT NULL,
  `transcriptionNotes` TEXT NULL,
  `transcriptionConfidence` VARCHAR(191) NOT NULL DEFAULT 'REVIEW_REQUIRED',
  `reviewStatus` VARCHAR(191) NOT NULL DEFAULT 'SOURCE_LISTED_REQUIRES_REVIEW',
  `version` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `RawMaterialListing_productId_key` (`productId`),
  UNIQUE INDEX `RawMaterialListing_sourceDocument_rowNumber_key` (`sourceDocument`, `rowNumber`),
  INDEX `RawMaterialListing_sourceCompanyId_certificateExpiry_idx` (`sourceCompanyId`, `certificateExpiry`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `RawMaterialListing` ADD CONSTRAINT `RawMaterialListing_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `RawMaterialListing` ADD CONSTRAINT `RawMaterialListing_sourceCompanyId_fkey` FOREIGN KEY (`sourceCompanyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
