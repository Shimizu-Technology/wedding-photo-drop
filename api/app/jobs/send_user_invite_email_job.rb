# frozen_string_literal: true

class SendUserInviteEmailJob < ApplicationJob
  queue_as :default

  def perform(user_id, invited_by_id, invitation_url)
    user = User.find(user_id)
    invited_by = User.find_by(id: invited_by_id)
    UserInviteEmailService.send_invite(user: user, invited_by: invited_by, invitation_url: invitation_url)
  end
end
