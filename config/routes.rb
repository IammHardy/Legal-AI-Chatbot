Rails.application.routes.draw do
  root "chat#index"

  post "/chat", to: "chat#chat"
  post "/summary", to: "chat#summary"
  post "/clear_chat", to: "chat#clear_chat"

  post "/leads", to: "leads#create"
  post "/intake_report", to: "chat#intake_report"
  post "/documents", to: "documents#create"
  post "/document_review", to: "documents#review"
  get "/admin", to: "admin#index"
end