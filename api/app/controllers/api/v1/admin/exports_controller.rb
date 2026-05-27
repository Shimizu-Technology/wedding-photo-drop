# frozen_string_literal: true

require "fileutils"
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

          cleanup_old_exports
          zip_path = build_zip_file(uploads)

          response.headers["Content-Type"] = "application/zip"
          response.headers["Content-Disposition"] = "attachment; filename=\"approved-media.zip\""
          self.response_body = zip_file_stream(zip_path)
        end

        private

        def set_event
          @event = Event.find(params[:event_id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Event not found" }, status: :not_found
        end

        def zip_file_stream(path)
          Enumerator.new do |stream|
            File.open(path, "rb") do |file|
              stream << file.read(64.kilobytes) until file.eof?
            end
          ensure
            File.delete(path) if File.exist?(path)
          end
        end

        def build_zip_file(uploads)
          FileUtils.mkdir_p(export_dir)
          zip_path = export_dir.join("approved-media-#{SecureRandom.hex(8)}.zip")

          Zip::File.open(zip_path, create: true) do |zip|
            uploads.each_with_index do |upload, index|
              next unless upload.file.attached?

              zip.get_output_stream(zip_filename(upload, index)) do |zip_entry|
                upload.file.blob.open do |source|
                  IO.copy_stream(source, zip_entry)
                end
              end
            end
          end

          zip_path
        end

        def cleanup_old_exports
          FileUtils.mkdir_p(export_dir)
          Dir.glob(export_dir.join("*.zip")).each do |path|
            File.delete(path) if File.mtime(path) < 2.hours.ago
          rescue Errno::ENOENT
            next
          end
        end

        def export_dir
          Rails.root.join("tmp/exports")
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
