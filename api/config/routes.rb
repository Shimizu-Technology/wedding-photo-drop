Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      get "events/:token", to: "events#show"
      post "events/:event_token/uploads", to: "uploads#create"
      get "events/:event_token/gallery", to: "galleries#show"

      namespace :admin do
        get "me", to: "me#show"
        resources :users do
          post "resend_invitation", on: :member
        end
        resources :events, controller: "managed_events", only: [ :index, :show, :create, :update ] do
          get "approved_download", to: "exports#approved"
          resources :album_sections, only: [ :index, :create, :update, :destroy ]
          resources :memberships, controller: "event_memberships", only: [ :index, :create, :update, :destroy ] do
            post "resend_invitation", on: :member
          end
          patch "uploads/bulk_approve", to: "managed_uploads#bulk_approve"
          patch "uploads/bulk_reject", to: "managed_uploads#bulk_reject"
          delete "uploads/bulk_destroy", to: "managed_uploads#bulk_destroy"
          patch "uploads/:id", to: "managed_uploads#update"
          patch "uploads/:id/approve", to: "managed_uploads#approve"
          patch "uploads/:id/reject", to: "managed_uploads#reject"
          delete "uploads/:id", to: "managed_uploads#destroy"
        end
      end

      namespace :dev do
        get "events", to: "events#index" if Rails.env.local?
      end
    end
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
