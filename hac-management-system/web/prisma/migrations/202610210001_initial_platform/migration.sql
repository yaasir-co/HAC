-- Initial HAC platform schema, authored from the WASM-validated Prisma datamodel.
-- Additive creation only. No existing database has been baselined or reset.

CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'SUPERVISOR',
    `companyId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `User_email_key` (`email`),
    INDEX `User_companyId_idx` (`companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Session_tokenHash_key` (`tokenHash`),
    INDEX `Session_userId_expiresAt_idx` (`userId`, `expiresAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Company` (
    `id` VARCHAR(191) NOT NULL,
    `legalName` VARCHAR(191) NOT NULL,
    `tradingName` VARCHAR(191) NULL,
    `registrationNumber` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'RETAILER',
    `industry` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Company_registrationNumber_key` (`registrationNumber`),
    INDEX `Company_legalName_idx` (`legalName`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CompanyLocation` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'BRANCH',
    `address` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `CompanyLocation_companyId_name_key` (`companyId`, `name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SupervisorCompanyAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `SupervisorCompanyAssignment_userId_companyId_key` (`userId`, `companyId`),
    INDEX `SupervisorCompanyAssignment_companyId_idx` (`companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Brand` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Brand_name_key` (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Manufacturer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NULL,
    `registrationNumber` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Manufacturer_name_key` (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Supplier` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Supplier_name_key` (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Product` (
    `id` VARCHAR(191) NOT NULL,
    `itemCode` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `normalizedName` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'PRODUCT',
    `category` VARCHAR(191) NOT NULL DEFAULT 'FOOD',
    `brandId` VARCHAR(191) NOT NULL,
    `manufacturerId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NULL,
    `origin` VARCHAR(191) NULL,
    `ingredients` TEXT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Product_itemCode_key` (`itemCode`),
    UNIQUE INDEX `Product_normalizedName_brandId_manufacturerId_key` (`normalizedName`, `brandId`, `manufacturerId`),
    INDEX `Product_status_name_idx` (`status`, `name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProductVariant` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NOT NULL,
    `barcode` VARCHAR(191) NULL,
    `packageSize` VARCHAR(191) NULL,
    `packaging` VARCHAR(191) NULL,
    `flavour` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `ProductVariant_sku_key` (`sku`),
    UNIQUE INDEX `ProductVariant_barcode_key` (`barcode`),
    INDEX `ProductVariant_productId_idx` (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CompanyItem` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `relationship` VARCHAR(191) NOT NULL DEFAULT 'RETAILER',
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `effectiveAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `CompanyItem_companyId_productId_key` (`companyId`, `productId`),
    INDEX `CompanyItem_productId_idx` (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Certificate` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `holderId` VARCHAR(191) NOT NULL,
    `issuer` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'HAC',
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `issuedAt` DATETIME(3) NOT NULL,
    `effectiveAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `supersedesId` VARCHAR(191) NULL,
    `documentPath` VARCHAR(191) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Certificate_number_key` (`number`),
    UNIQUE INDEX `Certificate_supersedesId_key` (`supersedesId`),
    INDEX `Certificate_status_expiresAt_idx` (`status`, `expiresAt`),
    INDEX `Certificate_holderId_idx` (`holderId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CertificateScope` (
    `id` VARCHAR(191) NOT NULL,
    `certificateId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NULL,
    `facilityId` VARCHAR(191) NULL,
    `brandName` VARCHAR(191) NULL,
    `manufacturerName` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `requiresCompanyRelationship` BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (`id`),
    INDEX `CertificateScope_productId_variantId_idx` (`productId`, `variantId`),
    INDEX `CertificateScope_certificateId_idx` (`certificateId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `License` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `manufacturerId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `authority` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `effectiveAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `required` BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `License_number_key` (`number`),
    INDEX `License_expiresAt_idx` (`expiresAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RestrictionRecord` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `manufacturerId` VARCHAR(191) NULL,
    `authority` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `scope` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `effectiveAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `RestrictionRecord_reference_key` (`reference`),
    INDEX `RestrictionRecord_productId_status_idx` (`productId`, `status`),
    INDEX `RestrictionRecord_manufacturerId_status_idx` (`manufacturerId`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChecklistTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChecklistTemplateVersion` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `ChecklistTemplateVersion_templateId_version_key` (`templateId`, `version`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChecklistQuestion` (
    `id` VARCHAR(191) NOT NULL,
    `versionId` VARCHAR(191) NOT NULL,
    `section` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'COMPLIANCE',
    `required` BOOLEAN NOT NULL DEFAULT true,
    `order` INTEGER NOT NULL DEFAULT 0,
    `options` JSON NULL,
    `condition` JSON NULL,
    `requiresEvidenceOn` JSON NULL,
    PRIMARY KEY (`id`),
    INDEX `ChecklistQuestion_versionId_order_idx` (`versionId`, `order`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Inspection` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `inspectorId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'ROUTINE',
    `status` VARCHAR(191) NOT NULL DEFAULT 'SCHEDULED',
    `priority` VARCHAR(191) NOT NULL DEFAULT 'NORMAL',
    `objectives` TEXT NULL,
    `scheduledAt` DATETIME(3) NOT NULL,
    `startedAt` DATETIME(3) NULL,
    `submittedAt` DATETIME(3) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewReason` TEXT NULL,
    `checklistVersionId` VARCHAR(191) NOT NULL,
    `masterDataVersion` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `snapshot` JSON NULL,
    `snapshotHash` VARCHAR(191) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Inspection_reference_key` (`reference`),
    INDEX `Inspection_companyId_status_scheduledAt_idx` (`companyId`, `status`, `scheduledAt`),
    INDEX `Inspection_inspectorId_scheduledAt_idx` (`inspectorId`, `scheduledAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Observation` (
    `id` VARCHAR(191) NOT NULL,
    `inspectionId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `variantId` VARCHAR(191) NULL,
    `observedName` VARCHAR(191) NULL,
    `observedBrand` VARCHAR(191) NULL,
    `observedManufacturer` VARCHAR(191) NULL,
    `observedBarcode` VARCHAR(191) NULL,
    `observedVariant` VARCHAR(191) NULL,
    `physicalExpiry` DATETIME(3) NULL,
    `manufactureDate` DATETIME(3) NULL,
    `batch` VARCHAR(191) NULL,
    `quantity` DOUBLE NULL,
    `storageLocation` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `verification` JSON NOT NULL,
    `conclusion` VARCHAR(191) NOT NULL,
    `identityConfirmed` BOOLEAN NOT NULL DEFAULT false,
    `clientMutationId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Observation_clientMutationId_key` (`clientMutationId`),
    INDEX `Observation_inspectionId_createdAt_idx` (`inspectionId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChecklistResponse` (
    `id` VARCHAR(191) NOT NULL,
    `inspectionId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `answer` JSON NOT NULL,
    `notes` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `ChecklistResponse_inspectionId_questionId_key` (`inspectionId`, `questionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InspectionFinding` (
    `id` VARCHAR(191) NOT NULL,
    `inspectionId` VARCHAR(191) NOT NULL,
    `observationId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(191) NOT NULL DEFAULT 'OBSERVATION',
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `InspectionFinding_inspectionId_severity_idx` (`inspectionId`, `severity`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InspectionEvidence` (
    `id` VARCHAR(191) NOT NULL,
    `inspectionId` VARCHAR(191) NOT NULL,
    `observationId` VARCHAR(191) NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `originalName` VARCHAR(191) NOT NULL,
    `storedName` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `byteSize` INTEGER NOT NULL,
    `sha256` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `capturedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `InspectionEvidence_storedName_key` (`storedName`),
    INDEX `InspectionEvidence_inspectionId_idx` (`inspectionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InspectionSignature` (
    `id` VARCHAR(191) NOT NULL,
    `inspectionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `signature` LONGTEXT NULL,
    `reason` TEXT NULL,
    `signedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `InspectionSignature_inspectionId_role_key` (`inspectionId`, `role`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InspectionReport` (
    `id` VARCHAR(191) NOT NULL,
    `inspectionId` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `format` VARCHAR(191) NOT NULL DEFAULT 'PDF',
    `sha256` VARCHAR(191) NOT NULL,
    `storedName` VARCHAR(191) NOT NULL,
    `generatedById` VARCHAR(191) NOT NULL,
    `snapshotHash` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `InspectionReport_reference_key` (`reference`),
    UNIQUE INDEX `InspectionReport_inspectionId_revision_format_key` (`inspectionId`, `revision`, `format`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Investigation` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `inspectionId` VARCHAR(191) NULL,
    `productId` VARCHAR(191) NULL,
    `observationId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `priority` VARCHAR(191) NOT NULL DEFAULT 'NORMAL',
    `status` VARCHAR(191) NOT NULL DEFAULT 'AWAITING_TRIAGE',
    `assignedToId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `dueAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Investigation_reference_key` (`reference`),
    INDEX `Investigation_companyId_status_idx` (`companyId`, `status`),
    INDEX `Investigation_inspectionId_idx` (`inspectionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InvestigationEvent` (
    `id` VARCHAR(191) NOT NULL,
    `investigationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `visibility` VARCHAR(191) NOT NULL DEFAULT 'INTERNAL',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `InvestigationEvent_investigationId_createdAt_idx` (`investigationId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Complaint` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `inspectionId` VARCHAR(191) NULL,
    `productId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'SUBMITTED',
    `priority` VARCHAR(191) NOT NULL DEFAULT 'NORMAL',
    `assignedToId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `investigationId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Complaint_reference_key` (`reference`),
    INDEX `Complaint_companyId_status_idx` (`companyId`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `NonConformity` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `inspectionId` VARCHAR(191) NULL,
    `productId` VARCHAR(191) NULL,
    `observationId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `severity` VARCHAR(191) NOT NULL DEFAULT 'MINOR',
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `responsibleParty` VARCHAR(191) NULL,
    `dueAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `NonConformity_reference_key` (`reference`),
    INDEX `NonConformity_companyId_status_dueAt_idx` (`companyId`, `status`, `dueAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CorrectiveAction` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `nonConformityId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `rootCause` TEXT NOT NULL,
    `proposedAction` TEXT NOT NULL,
    `evidenceDescription` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'SUBMITTED',
    `createdById` VARCHAR(191) NOT NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewNotes` TEXT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `dueAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `CorrectiveAction_reference_key` (`reference`),
    INDEX `CorrectiveAction_companyId_status_idx` (`companyId`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `href` VARCHAR(191) NULL,
    `dedupeKey` VARCHAR(191) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Notification_dedupeKey_key` (`dedupeKey`),
    INDEX `Notification_userId_readAt_createdAt_idx` (`userId`, `readAt`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `companyId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `reason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `AuditLog_companyId_createdAt_idx` (`companyId`, `createdAt`),
    INDEX `AuditLog_entityType_entityId_idx` (`entityType`, `entityId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TrainingDataset` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(191) NOT NULL DEFAULT 'COLLECTING_DATA',
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TrainingImage` (
    `id` VARCHAR(191) NOT NULL,
    `datasetId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `label` VARCHAR(191) NOT NULL,
    `split` VARCHAR(191) NOT NULL DEFAULT 'TRAIN',
    `captureGroup` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `sha256` VARCHAR(191) NOT NULL,
    `perceptualHash` VARCHAR(191) NULL,
    `quality` JSON NULL,
    `embedding` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `TrainingImage_path_key` (`path`),
    UNIQUE INDEX `TrainingImage_datasetId_sha256_key` (`datasetId`, `sha256`),
    INDEX `TrainingImage_datasetId_split_idx` (`datasetId`, `split`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ModelVersion` (
    `id` VARCHAR(191) NOT NULL,
    `datasetId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `extractor` VARCHAR(191) NOT NULL DEFAULT 'MOBILENET_V2',
    `artifact` JSON NULL,
    `metrics` JSON NULL,
    `threshold` DOUBLE NOT NULL DEFAULT 0.85,
    `margin` DOUBLE NOT NULL DEFAULT 0.08,
    `createdById` VARCHAR(191) NOT NULL,
    `publishedById` VARCHAR(191) NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `ModelVersion_datasetId_version_key` (`datasetId`, `version`),
    INDEX `ModelVersion_status_idx` (`status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RecognitionPrediction` (
    `id` VARCHAR(191) NOT NULL,
    `modelVersionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `inspectionId` VARCHAR(191) NULL,
    `candidates` JSON NOT NULL,
    `acceptedProductId` VARCHAR(191) NULL,
    `uncertain` BOOLEAN NOT NULL DEFAULT true,
    `latencyMs` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `RecognitionPrediction_modelVersionId_createdAt_idx` (`modelVersionId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LoginRateLimit` (
    `keyHash` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`keyHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CertificateHistory` (
    `id` VARCHAR(191) NOT NULL,
    `certificateId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `effectiveAt` DATETIME(3) NOT NULL,
    `reason` TEXT NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `CertificateHistory_certificateId_effectiveAt_idx` (`certificateId`, `effectiveAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `User` ADD CONSTRAINT `User_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CompanyLocation` ADD CONSTRAINT `CompanyLocation_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SupervisorCompanyAssignment` ADD CONSTRAINT `SupervisorCompanyAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SupervisorCompanyAssignment` ADD CONSTRAINT `SupervisorCompanyAssignment_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Product` ADD CONSTRAINT `Product_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `Brand` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Product` ADD CONSTRAINT `Product_manufacturerId_fkey` FOREIGN KEY (`manufacturerId`) REFERENCES `Manufacturer` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Product` ADD CONSTRAINT `Product_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ProductVariant` ADD CONSTRAINT `ProductVariant_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CompanyItem` ADD CONSTRAINT `CompanyItem_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CompanyItem` ADD CONSTRAINT `CompanyItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Certificate` ADD CONSTRAINT `Certificate_holderId_fkey` FOREIGN KEY (`holderId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Certificate` ADD CONSTRAINT `Certificate_supersedesId_fkey` FOREIGN KEY (`supersedesId`) REFERENCES `Certificate` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CertificateScope` ADD CONSTRAINT `CertificateScope_certificateId_fkey` FOREIGN KEY (`certificateId`) REFERENCES `Certificate` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CertificateScope` ADD CONSTRAINT `CertificateScope_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CertificateScope` ADD CONSTRAINT `CertificateScope_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CertificateScope` ADD CONSTRAINT `CertificateScope_facilityId_fkey` FOREIGN KEY (`facilityId`) REFERENCES `CompanyLocation` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `License` ADD CONSTRAINT `License_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `License` ADD CONSTRAINT `License_manufacturerId_fkey` FOREIGN KEY (`manufacturerId`) REFERENCES `Manufacturer` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `RestrictionRecord` ADD CONSTRAINT `RestrictionRecord_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `RestrictionRecord` ADD CONSTRAINT `RestrictionRecord_manufacturerId_fkey` FOREIGN KEY (`manufacturerId`) REFERENCES `Manufacturer` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ChecklistTemplateVersion` ADD CONSTRAINT `ChecklistTemplateVersion_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `ChecklistTemplate` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ChecklistQuestion` ADD CONSTRAINT `ChecklistQuestion_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `ChecklistTemplateVersion` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Inspection` ADD CONSTRAINT `Inspection_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Inspection` ADD CONSTRAINT `Inspection_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `CompanyLocation` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Inspection` ADD CONSTRAINT `Inspection_inspectorId_fkey` FOREIGN KEY (`inspectorId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Inspection` ADD CONSTRAINT `Inspection_checklistVersionId_fkey` FOREIGN KEY (`checklistVersionId`) REFERENCES `ChecklistTemplateVersion` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Observation` ADD CONSTRAINT `Observation_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `Inspection` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Observation` ADD CONSTRAINT `Observation_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Observation` ADD CONSTRAINT `Observation_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Observation` ADD CONSTRAINT `Observation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ChecklistResponse` ADD CONSTRAINT `ChecklistResponse_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `Inspection` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ChecklistResponse` ADD CONSTRAINT `ChecklistResponse_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `ChecklistQuestion` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `InspectionFinding` ADD CONSTRAINT `InspectionFinding_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `Inspection` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `InspectionFinding` ADD CONSTRAINT `InspectionFinding_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `Observation` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `InspectionEvidence` ADD CONSTRAINT `InspectionEvidence_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `Inspection` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `InspectionEvidence` ADD CONSTRAINT `InspectionEvidence_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `Observation` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `InspectionSignature` ADD CONSTRAINT `InspectionSignature_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `Inspection` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `InspectionSignature` ADD CONSTRAINT `InspectionSignature_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `InspectionReport` ADD CONSTRAINT `InspectionReport_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `Inspection` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Investigation` ADD CONSTRAINT `Investigation_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Investigation` ADD CONSTRAINT `Investigation_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `Inspection` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Investigation` ADD CONSTRAINT `Investigation_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Investigation` ADD CONSTRAINT `Investigation_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `Observation` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `InvestigationEvent` ADD CONSTRAINT `InvestigationEvent_investigationId_fkey` FOREIGN KEY (`investigationId`) REFERENCES `Investigation` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `Inspection` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `NonConformity` ADD CONSTRAINT `NonConformity_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `NonConformity` ADD CONSTRAINT `NonConformity_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `Inspection` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CorrectiveAction` ADD CONSTRAINT `CorrectiveAction_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CorrectiveAction` ADD CONSTRAINT `CorrectiveAction_nonConformityId_fkey` FOREIGN KEY (`nonConformityId`) REFERENCES `NonConformity` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `TrainingImage` ADD CONSTRAINT `TrainingImage_datasetId_fkey` FOREIGN KEY (`datasetId`) REFERENCES `TrainingDataset` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `TrainingImage` ADD CONSTRAINT `TrainingImage_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ModelVersion` ADD CONSTRAINT `ModelVersion_datasetId_fkey` FOREIGN KEY (`datasetId`) REFERENCES `TrainingDataset` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `RecognitionPrediction` ADD CONSTRAINT `RecognitionPrediction_modelVersionId_fkey` FOREIGN KEY (`modelVersionId`) REFERENCES `ModelVersion` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CertificateHistory` ADD CONSTRAINT `CertificateHistory_certificateId_fkey` FOREIGN KEY (`certificateId`) REFERENCES `Certificate` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
