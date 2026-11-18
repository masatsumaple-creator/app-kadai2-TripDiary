-- CreateTable
CREATE TABLE `user_spots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `spot_id` INTEGER NOT NULL,
    `status` ENUM('visited', 'wishlist') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_spots_user_id_status_id_idx`(`user_id`, `status`, `id`),
    INDEX `user_spots_spot_id_idx`(`spot_id`),
    UNIQUE INDEX `user_spots_user_id_spot_id_key`(`user_id`, `spot_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_spots` ADD CONSTRAINT `user_spots_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_spots` ADD CONSTRAINT `user_spots_spot_id_fkey` FOREIGN KEY (`spot_id`) REFERENCES `spots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- 既存の投稿の持ち主を、「訪問済み」としてリストに入れる(自分の投稿は自動で訪問済み)。
-- 登録日時は、投稿の作成日時にそろえる。以降の投稿は、アプリが作成時に同じ行を入れる
INSERT INTO `user_spots` (`user_id`, `spot_id`, `status`, `created_at`, `updated_at`)
SELECT `user_id`, `id`, 'visited', `created_at`, `created_at` FROM `spots`;
