# frozen_string_literal: true

module Api
  module V1
    module Admin
      class EventsController < ApplicationController
        include MediaSerialization

        def show
          event = Event.find_by_admin_token!(params[:admin_token])
          uploads = event.media_uploads.with_attached_file.newest_first
          render json: {
            event: serialize_event(event),
            counts: {
              pending: event.media_uploads.pending.count,
              approved: event.media_uploads.approved.count,
              rejected: event.media_uploads.where(status: "rejected").count,
              total: event.media_uploads.count
            },
            uploads: uploads.map { |upload| serialize_upload(upload) }
          }
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Admin event not found" }, status: :not_found
        end
      end
    end
  end
end
