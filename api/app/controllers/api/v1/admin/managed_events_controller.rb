# frozen_string_literal: true

module Api
  module V1
    module Admin
      class ManagedEventsController < ApplicationController
        include MediaSerialization

        before_action :require_staff!, only: [ :index ]
        before_action :require_super_admin!, only: [ :create ]
        before_action :set_event, only: [ :show, :update ]

        def index
          events = visible_events.order(created_at: :desc).to_a
          counts_by_event = upload_counts_by_event_id(events.map(&:id))
          render json: { events: events.map { |event| serialize_admin_event_summary(event, counts_by_event[event.id]) } }
        end

        def show
          require_event_staff!(@event)
          return if performed?

          uploads = filtered_uploads.with_attached_file.includes(:album_section).newest_first.offset(page_offset).limit(page_limit)
          render json: admin_event_payload(@event, uploads)
        end

        def create
          event = nil

          Event.transaction do
            event = Event.create!(event_params)
            event.event_memberships.create!(user: current_user, role: "admin", active: true, invited_by: current_user, invited_at: Time.current)
          end

          render json: { event: serialize_admin_event_summary(event) }, status: :created
        rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique => e
          render json: create_error_payload(e), status: :unprocessable_entity
        end

        def update
          require_event_admin!(@event)
          return if performed?

          if @event.update(event_params)
            uploads = filtered_uploads.with_attached_file.includes(:album_section).newest_first.offset(page_offset).limit(page_limit)
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

        def create_error_payload(error)
          if error.respond_to?(:record) && error.record&.errors&.any?
            { error: error.record.errors.full_messages.to_sentence, errors: error.record.errors.full_messages }
          else
            { error: "Event could not be created. Please try again." }
          end
        end

        def visible_events
          return Event.all if current_user.super_admin?

          Event.joins(:event_memberships).where(event_memberships: { user_id: current_user.id, active: true }).distinct
        end

        def event_params
          params.require(:event).permit(:name, :slug, :uploads_enabled, :public_gallery_enabled)
        end

        def filtered_uploads
          uploads = @event.media_uploads
          uploads = uploads.where(status: params[:status]) if MediaUpload::STATUSES.include?(params[:status])
          if params.key?(:album_section_id)
            section_id = params[:album_section_id].presence
            uploads = section_id.present? ? uploads.where(album_section_id: section_id) : uploads.where(album_section_id: nil)
          end

          uploads
        end

        def admin_event_payload(event, uploads)
          {
            event: serialize_event(event),
            album_sections: event.album_sections.ordered.map { |section| serialize_album_section(section) },
            counts: counts_for(event),
            pagination: {
              limit: page_limit,
              offset: page_offset,
              next_offset: uploads.length == page_limit ? page_offset + page_limit : nil
            },
            uploads: uploads.map { |upload| serialize_upload(upload) }
          }
        end

        def serialize_album_section(section)
          {
            id: section.id,
            event_id: section.event_id,
            name: section.name,
            slug: section.slug,
            description: section.description,
            sort_order: section.sort_order,
            visible: section.visible?,
            uploads_count: section.media_uploads.count
          }
        end

        def serialize_admin_event_summary(event, counts = nil)
          serialize_event(event).merge(counts: counts || counts_for(event))
        end

        def upload_counts_by_event_id(event_ids)
          base_counts = event_ids.index_with { { pending: 0, approved: 0, rejected: 0, total: 0 } }
          grouped = MediaUpload.where(event_id: event_ids).group(:event_id, :status).count

          grouped.each_with_object(base_counts) do |((event_id, status), count), memo|
            memo[event_id][status.to_sym] = count if memo[event_id]&.key?(status.to_sym)
            memo[event_id][:total] += count if memo[event_id]
          end
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
