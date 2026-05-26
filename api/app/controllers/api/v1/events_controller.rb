# frozen_string_literal: true

module Api
  module V1
    class EventsController < ApplicationController
      include MediaSerialization

      def show
        event = Event.find_by_public_token!(params[:token])
        render json: {
          event: serialize_event(event).except(:admin_token),
          approved_count: event.media_uploads.approved.count
        }
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Event not found" }, status: :not_found
      end
    end
  end
end
