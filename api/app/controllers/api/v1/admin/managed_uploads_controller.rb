# frozen_string_literal: true

module Api
  module V1
    module Admin
      class ManagedUploadsController < ApplicationController
        include MediaSerialization

        before_action :require_staff!
        before_action :set_event
        before_action :set_upload, only: [ :approve, :reject, :update, :destroy ]

        def approve
          @upload.approve!
          render json: { upload: serialize_upload(@upload.reload) }
        end

        def reject
          @upload.reject!
          render json: { upload: serialize_upload(@upload.reload) }
        end

        def update
          if @upload.update(upload_params)
            render json: { upload: serialize_upload(@upload.reload) }
          else
            render json: { error: @upload.errors.full_messages.to_sentence, errors: @upload.errors.full_messages }, status: :unprocessable_entity
          end
        rescue ActiveRecord::RecordInvalid => e
          render json: { error: e.record.errors.full_messages.to_sentence, errors: e.record.errors.full_messages }, status: :unprocessable_entity
        end

        def bulk_approve
          bulk_update_status("approved")
        end

        def bulk_reject
          bulk_update_status("rejected")
        end

        def bulk_destroy
          uploads = selected_uploads.with_attached_file
          count = uploads.count
          uploads.find_each do |upload|
            upload.file.purge_later if upload.file.attached?
            upload.destroy!
          end
          render json: { deleted: count }
        rescue ActiveRecord::RecordNotFound
          render json: { error: "No uploads selected" }, status: :unprocessable_entity
        end

        def destroy
          @upload.file.purge_later if @upload.file.attached?
          @upload.destroy!
          head :no_content
        end

        private

        def set_event
          @event = Event.find(params[:event_id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Event not found" }, status: :not_found
        end

        def set_upload
          return unless @event

          @upload = @event.media_uploads.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Upload not found" }, status: :not_found
        end

        def selected_uploads
          ids = Array(params[:ids]).map(&:to_i).reject(&:zero?)
          raise ActiveRecord::RecordNotFound if ids.empty?

          @event.media_uploads.where(id: ids)
        end

        def bulk_update_status(status)
          uploads = selected_uploads
          updated = uploads.update_all(status: status, updated_at: Time.current)
          render json: { updated: updated }
        rescue ActiveRecord::RecordNotFound
          render json: { error: "No uploads selected" }, status: :unprocessable_entity
        end

        def upload_params
          attrs = params.require(:upload).permit(:sort_order)
          if params.require(:upload).key?(:album_section_id)
            section_id = params.dig(:upload, :album_section_id).presence
            attrs[:album_section_id] = section_id.present? ? scoped_album_section_id(section_id) : nil
          end
          attrs
        end

        def scoped_album_section_id(section_id)
          @event.album_sections.find(section_id).id
        rescue ActiveRecord::RecordNotFound
          raise ActiveRecord::RecordInvalid, @upload.tap { |upload| upload.errors.add(:album_section, "must belong to this event") }
        end
      end
    end
  end
end
