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
          params.require(:upload).permit(:album_section_id, :sort_order)
        end
      end
    end
  end
end
