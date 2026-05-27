# frozen_string_literal: true

require "zip"

module Api
  module V1
    module Admin
      class ExportsController < ApplicationController
        before_action :require_staff!
        before_action :set_event

        def approved
          uploads = @event.media_uploads.approved.with_attached_file.includes(:album_section).gallery_order
          return render json: { error: "No approved uploads to download" }, status: :not_found if uploads.empty?

          zip_buffer = Zip::OutputStream.write_buffer do |zip|
            uploads.each_with_index do |upload, index|
              next unless upload.file.attached?

              zip.put_next_entry(zip_filename(upload, index))
              zip.write upload.file.download
            end
          end
          zip_buffer.rewind

          send_data zip_buffer.read,
            filename: "#{@event.slug}-approved-media.zip",
            type: "application/zip",
            disposition: "attachment"
        end

        private

        def set_event
          @event = Event.find(params[:event_id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Event not found" }, status: :not_found
        end

        def zip_filename(upload, index)
          section = upload.album_section&.slug.presence || "uncategorized"
          basename = File.basename(upload.original_filename, ".*").parameterize.presence || "upload-#{upload.id}"
          extension = File.extname(upload.original_filename).presence || extension_for(upload.content_type)
          "#{section}/#{format('%04d', index + 1)}-#{basename}-#{upload.id}#{extension}"
        end

        def extension_for(content_type)
          case content_type
          when "image/jpeg" then ".jpg"
          when "image/png" then ".png"
          when "image/heic" then ".heic"
          when "image/heif" then ".heif"
          when "image/webp" then ".webp"
          when "video/mp4" then ".mp4"
          when "video/quicktime" then ".mov"
          else ""
          end
        end
      end
    end
  end
end
