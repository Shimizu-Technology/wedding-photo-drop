# frozen_string_literal: true

module MediaSerialization
  extend ActiveSupport::Concern

  private

  def serialize_upload(upload)
    {
      id: upload.id,
      event_id: upload.event_id,
      guest_name: upload.guest_name,
      guest_message: upload.guest_message,
      status: upload.status,
      media_kind: upload.media_kind,
      original_filename: upload.original_filename,
      content_type: upload.content_type,
      file_size: upload.file_size,
      file_url: attachment_url(upload.file),
      created_at: upload.created_at,
      updated_at: upload.updated_at
    }
  end

  def serialize_event(event)
    {
      id: event.id,
      name: event.name,
      slug: event.slug,
      public_gallery_enabled: event.public_gallery_enabled,
      upload_token: event.upload_token,
      admin_token: event.admin_token
    }
  end

  def attachment_url(attachment)
    return nil unless attachment.attached?

    Rails.application.routes.url_helpers.rails_blob_url(attachment, host: request.base_url)
  end
end
