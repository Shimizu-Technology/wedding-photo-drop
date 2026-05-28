# frozen_string_literal: true

require "test_helper"

class ClerkAuthenticatableTest < ActiveSupport::TestCase
  Resolver = Class.new do
    include ClerkAuthenticatable

    public :find_or_link_user, :identity_from
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
    assert_not_nil invited.accepted_at
    assert_equal "Riley", invited.first_name
  end

  test "does not link or accept an inactive pending user" do
    invited = User.create!(
      clerk_id: "pending_inactive",
      email: "inactive-reviewer@example.com",
      role: "reviewer",
      invitation_status: "pending",
      active: false
    )

    resolved = Resolver.new.find_or_link_user({
      "sub" => "inactive_clerk_user",
      "email" => "inactive-reviewer@example.com"
    })

    assert_equal invited, resolved
    assert_equal "pending_inactive", invited.reload.clerk_id
    assert_equal "pending", invited.invitation_status
    assert_nil invited.accepted_at
  end

  test "does not fetch Clerk profile when JWT already has identity fields" do
    resolver = Resolver.new

    original_get = HTTParty.method(:get)
    HTTParty.define_singleton_method(:get) { |*| raise "Clerk API should not be called" }

    identity = resolver.identity_from({
      "sub" => "clerk_user_with_claims",
      "email" => "person@example.com",
      "first_name" => "Pat",
      "last_name" => "Guest"
    })

    assert_equal "person@example.com", identity[:email]
    assert_equal "Pat", identity[:first_name]
    assert_equal "Guest", identity[:last_name]
  ensure
    HTTParty.define_singleton_method(:get, original_get) if original_get
  end

  test "does not raise when a returning Clerk user's token email conflicts with another user" do
    returning = User.create!(
      clerk_id: "returning_clerk_user",
      email: "old@example.com",
      role: "admin",
      invitation_status: "accepted"
    )
    User.create!(
      clerk_id: "other_clerk_user",
      email: "new@example.com",
      role: "reviewer",
      invitation_status: "accepted"
    )

    resolved = Resolver.new.find_or_link_user({
      "sub" => "returning_clerk_user",
      "email" => "new@example.com"
    })

    assert_equal returning, resolved
    assert_equal "old@example.com", returning.reload.email
  end
end
