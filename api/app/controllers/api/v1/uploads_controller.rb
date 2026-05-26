# frozen_string_literal: true

module Api
  module V1
    class UploadsController < ApplicationController
      include MediaSerialization

      MAX_FILES = 30
      MAX_FILE_SIZE = 250.megabytes
      ALLOWED_PREFIXES = %w[image/ video/].freeze

      def create
        event = Event.find_by_public_token!(params[:event_token])
        files = Array(params[:files]).compact

        if files.empty?
          return render json: { error: "Please choose at least one photo or video." }, status: :unprocessable_entity
        end

        if files.length > MAX_FILES
          return render json: { error: "Please upload #{MAX_FILES} files or fewer at a time." }, status: :unprocessable_entity
        end

        invalid_file_error = validate_files(files)
        return render json: { error: invalid_file_error }, status: :unprocessable_entity if invalid_file_error

        uploads = files.map { |file| build_upload(event, file) }
        invalid = uploads.find(&:invalid?)

        if invalid
          return render json: { error: invalid.errors.full_messages.to_sentence, errors: invalid.errors.full_messages }, status: :unprocessable_entity
        end

        MediaUpload.transaction { uploads.each(&:save!) }

        render json: { uploads: uploads.map { |upload| serialize_upload(upload) } }, status: :created
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Event not found" }, status: :not_found
      end

      private

      def build_upload(event, file)
        content_type = file.content_type.presence || "application/octet-stream"
        upload = event.media_uploads.build(
          guest_name: params[:guest_name].to_s.strip.presence,
          guest_message: params[:guest_message].to_s.strip.presence,
          media_kind: media_kind_for(content_type),
          original_filename: file.original_filename.to_s,
          content_type: content_type,
          file_size: file.size
        )

        upload.file.attach(file)
        upload
      end

      def validate_files(files)
        invalid_type = files.find { |file| !allowed_content_type?(file.content_type.presence || "application/octet-stream") }
        return "Uploads must be photos or videos." if invalid_type

        oversized = files.find { |file| file.size > MAX_FILE_SIZE }
        return "Each file must be #{MAX_FILE_SIZE / 1.megabyte}MB or smaller." if oversized

        nil
      end

      def allowed_content_type?(content_type)
        ALLOWED_PREFIXES.any? { |prefix| content_type.start_with?(prefix) }
      end

      def media_kind_for(content_type)
        return "image" if content_type.start_with?("image/")
        return "video" if content_type.start_with?("video/")

        "other"
      end
    end
  end
end
