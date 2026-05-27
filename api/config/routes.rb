Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      get "events/:token", to: "events#show"
      post "events/:event_token/uploads", to: "uploads#create"
      get "events/:event_token/gallery", to: "galleries#show"

      namespace :admin do
        get "me", to: "me#show"
        resources :events, controller: "managed_events", only: [ :index, :show, :create, :update ] do
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
