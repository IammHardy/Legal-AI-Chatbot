Rails.application.routes.draw do
  root "chat#index"

  post "/chat", to: "chat#chat"
  post "/summary", to: "chat#summary"
  post "/clear_chat", to: "chat#clear_chat"

  post "/leads", to: "leads#create"
  post "/intake_report", to: "chat#intake_report"
  post "/documents", to: "documents#create"
  post "/document_review", to: "documents#review"
  post "/clause_search", to: "documents#clause_search"
post "/clause_rewrite", to: "documents#clause_rewrite"
  get "/admin", to: "admin#index"
end