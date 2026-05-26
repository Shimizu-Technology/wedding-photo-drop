# frozen_string_literal: true

module Api
  module V1
    class GalleriesController < ApplicationController
      include MediaSerialization

      def show
        event = Event.find_by_public_token!(params[:event_token])
        return render json: { event: serialize_event(event).except(:admin_token), uploads: [] } unless event.public_gallery_enabled?

        uploads = event.media_uploads.approved.with_attached_file.newest_first.offset(page_offset).limit(page_limit)
        render json: {
          event: serialize_event(event).except(:admin_token),
          pagination: {
            limit: page_limit,
            offset: page_offset,
            next_offset: uploads.length == page_limit ? page_offset + page_limit : nil
          },
          uploads: uploads.map { |upload| serialize_upload(upload) }
        }
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Event not found" }, status: :not_found
      end

      private

      def page_limit
        params.fetch(:limit, 100).to_i.clamp(1, 200)
      end

      def page_offset
        params.fetch(:offset, 0).to_i.clamp(0, 100_000)
      end
    end
  end
end
