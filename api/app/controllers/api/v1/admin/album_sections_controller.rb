# frozen_string_literal: true

module Api
  module V1
    module Admin
      class AlbumSectionsController < ApplicationController
        before_action :set_event
        before_action :require_current_event_admin!
        before_action :set_section, only: [ :update, :destroy ]

        def index
          render json: { album_sections: @event.album_sections.ordered.map { |section| section_json(section) } }
        end

        def create
          section = @event.album_sections.build(section_params)
          if section.save
            render json: { album_section: section_json(section) }, status: :created
          else
            render json: { error: section.errors.full_messages.to_sentence, errors: section.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def update
          if @section.update(section_params)
            render json: { album_section: section_json(@section) }
          else
            render json: { error: @section.errors.full_messages.to_sentence, errors: @section.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def destroy
          @section.media_uploads.update_all(album_section_id: nil, updated_at: Time.current)
          @section.destroy!
          head :no_content
        end

        private

        def set_event
          @event = Event.find(params[:event_id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Event not found" }, status: :not_found
        end

        def set_section
          @section = @event.album_sections.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Album section not found" }, status: :not_found
        end

        def require_current_event_admin!
          require_event_admin!(@event)
        end

        def section_params
          params.require(:album_section).permit(:name, :slug, :description, :sort_order, :visible)
        end

        def section_json(section)
          {
            id: section.id,
            event_id: section.event_id,
            name: section.name,
            slug: section.slug,
            description: section.description,
            sort_order: section.sort_order,
            visible: section.visible?,
            uploads_count: section.media_uploads.count,
            created_at: section.created_at,
            updated_at: section.updated_at
          }
        end
      end
    end
  end
end
