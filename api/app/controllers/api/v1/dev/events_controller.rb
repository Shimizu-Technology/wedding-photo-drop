# frozen_string_literal: true

module Api
  module V1
    module Dev
      class EventsController < ApplicationController
        def index
          return head :not_found unless Rails.env.local?

          events = Event.order(:created_at)
          render json: {
            events: events.map do |event|
              {
                id: event.id,
                name: event.name,
                slug: event.slug,
                upload_path: "/upload/#{event.upload_token}",
                gallery_path: "/gallery/#{event.upload_token}",
                admin_path: "/admin",
                uploads_enabled: event.uploads_enabled,
                public_gallery_enabled: event.public_gallery_enabled
              }
            end
          }
        end
      end
    end
  end
end
