# frozen_string_literal: true

class MediaUploadProcessingJob < ApplicationJob
  queue_as :default

  def perform(media_upload_id)
    upload = MediaUpload.find(media_upload_id)
    return unless upload.file.attached?

    upload.file.analyze unless upload.file.analyzed?
    warm_image_variant(upload) if upload.image? && upload.file.variable?
    upload.update!(processed_at: Time.current, processing_error: nil)
  rescue StandardError => e
    Rails.logger.warn("MediaUploadProcessingJob failed for media_upload_id=#{media_upload_id}: #{e.class}: #{e.message}")
    MediaUpload.where(id: media_upload_id).update_all(processing_error: e.message.truncate(1_000), updated_at: Time.current)
  end

  private

  def warm_image_variant(upload)
    upload.file.variant(resize_to_limit: [ 2400, 2400 ]).processed
  end
end
