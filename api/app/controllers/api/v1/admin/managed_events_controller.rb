# frozen_string_literal: true

module Api
  module V1
    module Admin
      class ManagedEventsController < ApplicationController
        include MediaSerialization

        before_action :require_staff!
        before_action :set_event, only: [ :show, :update ]

        def index
          events = Event.order(created_at: :desc)
          render json: { events: events.map { |event| serialize_admin_event_summary(event) } }
        end

        def show
          uploads = filtered_uploads.with_attached_file.newest_first.offset(page_offset).limit(page_limit)
          render json: admin_event_payload(@event, uploads)
        end

        def create
          event = Event.new(event_params)
          if event.save
            render json: { event: serialize_admin_event_summary(event) }, status: :created
          else
            render json: { error: event.errors.full_messages.to_sentence, errors: event.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def update
          if @event.update(event_params)
            uploads = filtered_uploads.with_attached_file.newest_first.offset(page_offset).limit(page_limit)
            render json: admin_event_payload(@event, uploads)
          else
            render json: { error: @event.errors.full_messages.to_sentence, errors: @event.errors.full_messages }, status: :unprocessable_entity
          end
        end

        private

        def set_event
          @event = Event.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Event not found" }, status: :not_found
        end

        def event_params
          params.require(:event).permit(:name, :slug, :uploads_enabled, :public_gallery_enabled)
        end

        def filtered_uploads
          uploads = @event.media_uploads
          return uploads.where(status: params[:status]) if MediaUpload::STATUSES.include?(params[:status])

          uploads
        end

        def admin_event_payload(event, uploads)
          {
            event: serialize_event(event),
            counts: counts_for(event),
            pagination: {
              limit: page_limit,
              offset: page_offset,
              next_offset: uploads.length == page_limit ? page_offset + page_limit : nil
            },
            uploads: uploads.map { |upload| serialize_upload(upload) }
          }
        end

        def serialize_admin_event_summary(event)
          serialize_event(event).merge(counts: counts_for(event))
        end

        def counts_for(event)
          {
            pending: event.media_uploads.pending.count,
            approved: event.media_uploads.approved.count,
            rejected: event.media_uploads.where(status: "rejected").count,
            total: event.media_uploads.count
          }
        end

        def page_limit
          params.fetch(:limit, 100).to_i.clamp(1, 200)
        end

        def page_offset
          params.fetch(:offset, 0).to_i.clamp(0, 100_000)
        end
      end
    end
  end
end
