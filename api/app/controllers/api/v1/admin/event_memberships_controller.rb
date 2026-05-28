# frozen_string_literal: true

module Api
  module V1
    module Admin
      class EventMembershipsController < ApplicationController
        before_action :set_event
        before_action :require_current_event_admin!
        before_action :set_membership, only: [ :update, :destroy, :resend_invitation ]

        def index
          memberships = @event.event_memberships.includes(:user).order("users.email")
          render json: { memberships: memberships.map { |membership| membership_json(membership) } }
        end

        def create
          user = find_or_build_user
          membership = @event.event_memberships.find_or_initialize_by(user: user)
          membership.assign_attributes(role: safe_role(membership_params[:role]), active: true, invited_by: current_user, invited_at: Time.current)

          EventMembership.transaction do
            user.save! if user.new_record? || user.changed?
            membership.save!
          end

          invite_result = user.invitation_pending? ? create_clerk_invitation(user) : { success: true, email_sent: false }
          render json: membership_response(membership.reload, invite_result), status: :created
        rescue ActiveRecord::RecordInvalid => e
          render json: { error: e.record.errors.full_messages.to_sentence, errors: e.record.errors.full_messages }, status: :unprocessable_entity
        end

        def update
          if @membership.update(role: safe_role(membership_params[:role]), active: membership_params.key?(:active) ? ActiveModel::Type::Boolean.new.cast(membership_params[:active]) : @membership.active)
            render json: { membership: membership_json(@membership.reload) }
          else
            render json: { error: @membership.errors.full_messages.to_sentence, errors: @membership.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def destroy
          @membership.destroy!
          head :no_content
        end

        def resend_invitation
          user = @membership.user
          return render json: { error: "Invitation has already been accepted" }, status: :unprocessable_entity unless user.invitation_pending?

          invite_result = create_clerk_invitation(user, ignore_existing: true)
          render json: membership_response(@membership.reload, invite_result)
        end

        private

        def set_event
          @event = Event.find(params[:event_id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Event not found" }, status: :not_found
        end

        def set_membership
          @membership = @event.event_memberships.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Event membership not found" }, status: :not_found
        end

        def require_current_event_admin!
          require_event_admin!(@event) if @event
        end

        def membership_params
          params.require(:membership).permit(:email, :first_name, :last_name, :role, :active)
        end

        def find_or_build_user
          email = membership_params[:email].to_s.strip.downcase
          raise ActiveRecord::RecordInvalid, User.new.tap { |user| user.errors.add(:email, "can't be blank") } if email.blank?

          user = User.find_or_initialize_by(email: email)
          return user unless user.new_record?

          user.assign_attributes(
            clerk_id: "pending_#{SecureRandom.uuid}",
            first_name: membership_params[:first_name],
            last_name: membership_params[:last_name],
            role: "reviewer",
            invitation_status: "pending",
            invited_by: current_user,
            invited_at: Time.current
          )
          user
        end

        def safe_role(role)
          EventMembership::ROLES.include?(role.to_s) ? role.to_s : "reviewer"
        end

        def create_clerk_invitation(user, ignore_existing: false)
          result = ClerkInvitationService.new.create_invitation(
            email: user.email,
            redirect_url: admin_redirect_url,
            public_metadata: { event_id: @event.id },
            ignore_existing: ignore_existing
          )

          if result[:success]
            user.update!(clerk_invitation_id: result[:invitation_id], invited_at: Time.current)
            email_sent = false
            if result[:url].present?
              SendUserInviteEmailJob.perform_later(user.id, current_user&.id, result[:url])
              email_sent = UserInviteEmailService.configured?
            end
            result.merge(email_sent: email_sent)
          else
            result.merge(email_sent: false)
          end
        end

        def membership_response(membership, result)
          {
            membership: membership_json(membership),
            invitation_sent: result[:email_sent],
            invitation_error: result[:success] ? nil : result[:error]
          }
        end

        def admin_redirect_url
          frontend = ENV.fetch("FRONTEND_URL", "http://localhost:5173").delete_suffix("/")
          "#{frontend}/admin/events/#{@event.id}"
        end

        def membership_json(membership)
          user = membership.user
          {
            id: membership.id,
            event_id: membership.event_id,
            role: membership.role,
            active: membership.active?,
            invited_at: membership.invited_at,
            user: {
              id: user.id,
              email: user.email,
              first_name: user.first_name,
              last_name: user.last_name,
              full_name: user.full_name,
              invitation_pending: user.invitation_pending?,
              invitation_status: user.invitation_status,
              active: user.active?,
              is_super_admin: user.super_admin?
            }
          }
        end
      end
    end
  end
end
