-- Preserve every existing template, response and inspection. New visits may omit a checklist.
ALTER TABLE `Inspection` MODIFY `checklistVersionId` VARCHAR(191) NULL;
