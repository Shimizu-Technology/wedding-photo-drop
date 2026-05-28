# frozen_string_literal: true

class MediaUploadProcessingJob < ApplicationJob
  queue_as :default

  retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
    media_upload_id = job.arguments.first
    Rails.logger.warn("MediaUploadProcessingJob discarded for media_upload_id=#{media_upload_id}: #{error.class}: #{error.message}")
    MediaUpload.where(id: media_upload_id).update_all(processing_error: error.message.truncate(1_000), updated_at: Time.current)
  end

  def perform(media_upload_id)
    upload = MediaUpload.find(media_upload_id)
    return unless upload.file.attached?

    upload.file.analyze unless upload.file.analyzed?
    warm_image_variant(upload) if upload.image? && upload.file.variable?
    upload.update!(processed_at: Time.current, processing_error: nil)
  end

  private

  def warm_image_variant(upload)
    upload.file.variant(resize_to_limit: [ 2400, 2400 ]).processed
  end
end
