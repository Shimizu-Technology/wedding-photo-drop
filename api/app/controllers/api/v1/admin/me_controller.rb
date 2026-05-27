# frozen_string_literal: true

module Api
  module V1
    module Admin
      class MeController < ApplicationController
        before_action :require_staff!

        def show
          render json: { user: serialize_user(current_user) }
        end

        private

        def serialize_user(user)
          {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            full_name: user.full_name,
            role: user.role,
            active: user.active?,
            is_admin: user.admin?,
            is_staff: user.staff?
          }
        end
      end
    end
  end
end
