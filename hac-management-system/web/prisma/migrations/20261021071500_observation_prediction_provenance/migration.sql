-- AlterTable
ALTER TABLE `Observation` ADD COLUMN `recognitionPredictionId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Observation_recognitionPredictionId_key` ON `Observation`(`recognitionPredictionId`);

-- AddForeignKey
ALTER TABLE `Observation` ADD CONSTRAINT `Observation_recognitionPredictionId_fkey` FOREIGN KEY (`recognitionPredictionId`) REFERENCES `RecognitionPrediction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
