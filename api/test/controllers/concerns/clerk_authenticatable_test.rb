# frozen_string_literal: true

require "test_helper"

class ClerkAuthenticatableTest < ActiveSupport::TestCase
  Resolver = Class.new do
    include ClerkAuthenticatable

    public :find_or_link_user
  end

  test "does not link a new Clerk identity to an accepted user by email" do
    existing = User.create!(
      clerk_id: "existing_clerk_user",
      email: "admin@example.com",
      role: "admin",
      invitation_status: "accepted"
    )

    resolved = Resolver.new.find_or_link_user({
      "sub" => "attacker_clerk_user",
      "email" => "admin@example.com"
    })

    assert_nil resolved
    assert_equal "existing_clerk_user", existing.reload.clerk_id
  end

  test "links a pending invited user by matching email" do
    invited = User.create!(
      clerk_id: "pending_abc123",
      email: "reviewer@example.com",
      role: "reviewer",
      invitation_status: "pending"
    )

    resolved = Resolver.new.find_or_link_user({
      "sub" => "new_clerk_user",
      "email" => "reviewer@example.com",
      "first_name" => "Riley"
    })

    assert_equal invited, resolved
    assert_equal "new_clerk_user", invited.reload.clerk_id
    assert_equal "accepted", invited.invitation_status
    assert_equal "Riley", invited.first_name
  end
end
