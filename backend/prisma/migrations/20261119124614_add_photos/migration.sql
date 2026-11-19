-- CreateTable
CREATE TABLE `photos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `spot_id` INTEGER NOT NULL,
    `s3_key` VARCHAR(255) NOT NULL,
    `content_type` VARCHAR(20) NOT NULL,
    `status` ENUM('pending', 'ready') NOT NULL DEFAULT 'pending',
    `sort_order` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `photos_s3_key_key`(`s3_key`),
    INDEX `photos_spot_id_status_sort_order_idx`(`spot_id`, `status`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `photos` ADD CONSTRAINT `photos_spot_id_fkey` FOREIGN KEY (`spot_id`) REFERENCES `spots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
