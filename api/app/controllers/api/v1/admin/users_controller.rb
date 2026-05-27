# frozen_string_literal: true

module Api
  module V1
    module Admin
      class UsersController < ApplicationController
        before_action :require_admin!
        before_action :set_user, only: [ :show, :update, :destroy, :resend_invitation ]

        def index
          users = User.order(:email)
          render json: { users: users.map { |user| user_json(user) } }
        end

        def show
          render json: { user: user_json(@user) }
        end

        def create
          user = User.new(create_user_params)
          user.clerk_id = "pending_#{SecureRandom.uuid}"
          user.invitation_status = "pending"
          user.invited_by = current_user
          user.invited_at = Time.current

          if user.save
            invite_result = create_clerk_invitation(user)
            render json: invitation_response(user, invite_result), status: :created
          else
            render json: { error: user.errors.full_messages.to_sentence, errors: user.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def update
          attrs = update_user_params

          if @user.id == current_user.id && attrs[:role].present? && attrs[:role] != @user.role
            return render json: { error: "You cannot change your own role" }, status: :unprocessable_entity
          end

          if accepted_email_change?(attrs)
            return render json: { error: "Accepted user email addresses cannot be changed here. Invite a new user instead." }, status: :unprocessable_entity
          end

          if last_admin_change?(attrs)
            return render json: { error: "Cannot remove the last admin" }, status: :unprocessable_entity
          end

          pending_email_changed = pending_email_change?(attrs)

          if @user.update(attrs)
            if pending_email_changed
              revoke_pending_invitation(@user)
              invite_result = create_clerk_invitation(@user, ignore_existing: true)
              render json: invitation_response(@user.reload, invite_result)
            else
              render json: { user: user_json(@user) }
            end
          else
            render json: { error: @user.errors.full_messages.to_sentence, errors: @user.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def destroy
          return render json: { error: "You cannot delete yourself" }, status: :unprocessable_entity if @user.id == current_user.id
          return render json: { error: "Cannot delete the last admin" }, status: :unprocessable_entity if last_active_admin?(@user)

          revoke_pending_invitation(@user)
          @user.destroy!
          head :no_content
        end

        def resend_invitation
          return render json: { error: "Invitation has already been accepted" }, status: :unprocessable_entity unless @user.invitation_pending?

          revoke_pending_invitation(@user)
          invite_result = create_clerk_invitation(@user, ignore_existing: true)
          render json: invitation_response(@user.reload, invite_result)
        end

        private

        def set_user
          @user = User.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "User not found" }, status: :not_found
        end

        def create_user_params
          user = params.require(:user)
          attrs = user.permit(:email, :first_name, :last_name)
          attrs[:role] = safe_role(user[:role])
          attrs
        end

        def update_user_params
          user = params.require(:user)
          attrs = user.permit(:email, :first_name, :last_name)
          attrs[:role] = safe_role(user[:role]) if user[:role].present?
          attrs[:active] = ActiveModel::Type::Boolean.new.cast(user[:active]) if user.key?(:active)
          attrs
        end

        def safe_role(role)
          User::ROLES.include?(role.to_s) ? role.to_s : "reviewer"
        end

        def pending_email_change?(attrs)
          @user.invitation_pending? && attrs[:email].present? && attrs[:email].to_s.strip.downcase != @user.email
        end

        def accepted_email_change?(attrs)
          !@user.invitation_pending? && attrs[:email].present? && attrs[:email].to_s.strip.downcase != @user.email
        end

        def last_admin_change?(attrs)
          return false unless last_active_admin?(@user)

          attrs[:role].present? && attrs[:role] != "admin" || attrs.key?(:active) && ActiveModel::Type::Boolean.new.cast(attrs[:active]) == false
        end

        def last_active_admin?(user)
          user.admin? && user.active? && User.where(role: "admin", active: true).where.not(id: user.id).none?
        end

        def create_clerk_invitation(user, ignore_existing: false)
          service = ClerkInvitationService.new
          result = service.create_invitation(
            email: user.email,
            redirect_url: admin_redirect_url,
            public_metadata: { role: user.role },
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

        def revoke_pending_invitation(user)
          return unless user.clerk_invitation_id.present? && user.invitation_pending?

          ClerkInvitationService.new.revoke_invitation(user.clerk_invitation_id)
        end

        def invitation_response(user, result)
          {
            user: user_json(user),
            invitation_sent: result[:email_sent],
            invitation_error: result[:success] ? nil : result[:error]
          }
        end

        def admin_redirect_url
          frontend = ENV.fetch("FRONTEND_URL", "http://localhost:5173").delete_suffix("/")
          "#{frontend}/admin"
        end

        def user_json(user)
          {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            full_name: user.full_name,
            role: user.role,
            active: user.active?,
            is_admin: user.admin?,
            is_staff: user.staff?,
            invitation_status: user.invitation_status,
            invitation_pending: user.invitation_pending?,
            invited_at: user.invited_at,
            accepted_at: user.accepted_at,
            last_sign_in_at: user.last_sign_in_at,
            created_at: user.created_at,
            updated_at: user.updated_at
          }
        end
      end
    end
  end
end
