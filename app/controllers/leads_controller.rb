# app/controllers/leads_controller.rb
class LeadsController < ApplicationController
  skip_before_action :verify_authenticity_token

  last_message = @@last_user_message

  # POST /leads
  def create
    leads_dir = Rails.root.join("leads")
    Dir.mkdir(leads_dir) unless Dir.exist?(leads_dir)

    filename = leads_dir.join("lead_#{Time.now.to_i}.json")
    lead_data = {
      name: params[:name],
      email: params[:email],
      last_message: params[:last_message]
    }
    File.write(filename, lead_data.to_json)

    render json: { status: "saved" }
  rescue
    render json: { status: "failed" }
  end
end
