# frozen_string_literal: true

module Api
  module V1
    module Admin
      class UploadsController < ApplicationController
        include MediaSerialization

        before_action :set_event
        before_action :set_upload, only: [ :approve, :reject, :destroy ]

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
          @event = Event.find_by_admin_token!(admin_token)
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Admin event not found" }, status: :not_found
        end

        def admin_token
          request.headers["X-Admin-Token"].presence || params[:admin_token]
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
