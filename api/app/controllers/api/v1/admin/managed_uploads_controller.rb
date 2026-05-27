# frozen_string_literal: true

module Api
  module V1
    module Admin
      class ManagedUploadsController < ApplicationController
        include MediaSerialization

        before_action :require_staff!
        before_action :set_event
        before_action :set_upload

        def approve
          @upload.approve!
          render json: { upload: serialize_upload(@upload.reload) }
        end

        def reject
          @upload.reject!
          render json: { upload: serialize_upload(@upload.reload) }
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
      end
    end
  end
end
