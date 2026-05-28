# frozen_string_literal: true

module Api
  module V1
    class UploadsController < ApplicationController
      include MediaSerialization

      MAX_FILES = 20
      MAX_BATCH_SIZE = 500.megabytes
      ALLOWED_CONTENT_TYPES = MediaUpload::ALLOWED_CONTENT_TYPES

      def create
        event = Event.find_by_public_token!(params[:event_token])
        files = Array(params[:files]).compact
        signed_blob_ids = Array(params[:signed_blob_ids]).compact

        unless event.uploads_enabled?
          return render json: { error: "Uploads are currently closed for this event." }, status: :forbidden
        end

        if files.empty? && signed_blob_ids.empty?
          return render json: { error: "Please choose at least one photo or video." }, status: :unprocessable_entity
        end

        if files.length + signed_blob_ids.length > MAX_FILES
          return render json: { error: "Please upload #{MAX_FILES} files or fewer at a time." }, status: :unprocessable_entity
        end

        invalid_file_error = validate_files(files)
        return render json: { error: invalid_file_error }, status: :unprocessable_entity if invalid_file_error

        blobs = signed_blob_ids.map { |signed_id| ActiveStorage::Blob.find_signed!(signed_id) }
        invalid_blob_metadata_error = validate_blob_metadata(blobs)
        return render json: { error: invalid_blob_metadata_error }, status: :unprocessable_entity if invalid_blob_metadata_error

        invalid_batch_error = validate_combined_batch_size(files, blobs)
        return render json: { error: invalid_batch_error }, status: :unprocessable_entity if invalid_batch_error

        blob_content_types = sniff_blob_content_types(blobs)
        invalid_blob_content_error = validate_blob_content_types(blobs, blob_content_types)
        return render json: { error: invalid_blob_content_error }, status: :unprocessable_entity if invalid_blob_content_error

        uploads = files.map { |file| build_upload(event, file) } + blobs.map { |blob| build_direct_upload(event, blob, blob_content_types.fetch(blob.id)) }
        invalid = uploads.find(&:invalid?)

        if invalid
          return render json: { error: invalid.errors.full_messages.to_sentence, errors: invalid.errors.full_messages }, status: :unprocessable_entity
        end

        MediaUpload.transaction { uploads.each(&:save!) }

        render json: { uploads: uploads.map { |upload| serialize_upload(upload) } }, status: :created
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Event not found" }, status: :not_found
      rescue ActiveSupport::MessageVerifier::InvalidSignature
        render json: { error: "Upload could not be verified. Please try again." }, status: :unprocessable_entity
      end

      private

      def build_upload(event, file)
        content_type = normalized_content_type(file)
        upload = event.media_uploads.build(
          guest_name: params[:guest_name].to_s.strip.first(80).presence,
          guest_message: params[:guest_message].to_s.strip.first(1_000).presence,
          media_kind: media_kind_for(content_type),
          original_filename: file.original_filename.to_s,
          content_type: content_type,
          file_size: file.size.to_i
        )

        upload.file.attach(file)
        upload
      end

      def build_direct_upload(event, blob, content_type)
        upload = event.media_uploads.build(
          guest_name: params[:guest_name].to_s.strip.first(80).presence,
          guest_message: params[:guest_message].to_s.strip.first(1_000).presence,
          media_kind: media_kind_for(content_type),
          original_filename: blob.filename.to_s,
          content_type: content_type,
          file_size: blob.byte_size.to_i
        )

        blob.update!(content_type: content_type) if blob.content_type != content_type
        upload.file.attach(blob)
        upload
      end

      def validate_files(files)
        invalid_type = files.find { |file| !allowed_content_type?(normalized_content_type(file)) }
        return "Uploads must be JPEG, PNG, HEIC, WebP, MP4, or MOV files." if invalid_type

        empty_file = files.find { |file| file.size.to_i <= 0 }
        return "Uploads cannot be empty files." if empty_file

        oversized = files.find { |file| file.size.to_i > MediaUpload::MAX_FILE_SIZE }
        return "Each file must be #{MediaUpload::MAX_FILE_SIZE / 1.megabyte}MB or smaller." if oversized

        long_filename = files.find { |file| file.original_filename.to_s.length > 255 }
        return "Filenames must be 255 characters or fewer." if long_filename

        total_size = files.sum { |file| file.size.to_i }
        return "Please upload #{MAX_BATCH_SIZE / 1.megabyte}MB or less at a time." if total_size > MAX_BATCH_SIZE

        nil
      end

      def validate_blob_metadata(blobs)
        empty_blob = blobs.find { |blob| blob.byte_size.to_i <= 0 }
        return "Uploads cannot be empty files." if empty_blob

        oversized = blobs.find { |blob| blob.byte_size.to_i > MediaUpload::MAX_FILE_SIZE }
        return "Each file must be #{MediaUpload::MAX_FILE_SIZE / 1.megabyte}MB or smaller." if oversized

        long_filename = blobs.find { |blob| blob.filename.to_s.length > 255 }
        return "Filenames must be 255 characters or fewer." if long_filename

        total_size = blobs.sum { |blob| blob.byte_size.to_i }
        return "Please upload #{MAX_BATCH_SIZE / 1.megabyte}MB or less at a time." if total_size > MAX_BATCH_SIZE

        nil
      end

      def validate_blob_content_types(blobs, content_types)
        invalid_type = blobs.find { |blob| !allowed_content_type?(content_types.fetch(blob.id)) }
        return "Uploads must be JPEG, PNG, HEIC, WebP, MP4, or MOV files." if invalid_type

        nil
      end

      def sniff_blob_content_types(blobs)
        blobs.each_with_object({}) do |blob, content_types|
          header = blob.service.download_chunk(blob.key, 0...4.kilobytes)
          content_types[blob.id] = Marcel::MimeType.for(StringIO.new(header), name: nil, declared_type: nil).presence || "application/octet-stream"
        end
      end

      def validate_combined_batch_size(files, blobs)
        total_size = files.sum { |file| file.size.to_i } + blobs.sum { |blob| blob.byte_size.to_i }
        return "Please upload #{MAX_BATCH_SIZE / 1.megabyte}MB or less at a time." if total_size > MAX_BATCH_SIZE

        nil
      end

      def allowed_content_type?(content_type)
        ALLOWED_CONTENT_TYPES.include?(content_type)
      end

      def normalized_content_type(file)
        Marcel::MimeType.for(file.tempfile, name: file.original_filename, declared_type: file.content_type).presence || "application/octet-stream"
      end

      def media_kind_for(content_type)
        return "image" if content_type.start_with?("image/")
        return "video" if content_type.start_with?("video/")

        "other"
      end
    end
  end
end
