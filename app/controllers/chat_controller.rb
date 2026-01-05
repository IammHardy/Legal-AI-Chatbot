# app/controllers/chat_controller.rb
class ChatController < ApplicationController
  skip_before_action :verify_authenticity_token
  require "openai"

  @@conversation = []
  SYSTEM_PROMPT = "You are a helpful legal assistant."

  # GET /
  def index
    # renders app/views/chat/index.html.erb
  end

  # POST /chat
  def chat
    user_message = params[:message].to_s
    @@conversation << { role: "user", content: user_message }

    begin
      client = OpenAI::Client.new(access_token: ENV["OPENAI_API_KEY"])
      response = client.chat(
        parameters: {
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: SYSTEM_PROMPT }] + @@conversation,
          temperature: 0.7
        }
      )
      reply = response.dig("choices", 0, "message", "content") || "OpenAI returned no content."
    rescue StandardError => e
      puts "OpenAI fallback: #{e.message}"
      reply = "I understand you said: '#{user_message}'. This is a demo AI response with disclaimer: This does not constitute legal advice."
    end

    lead_trigger = user_message.downcase.match?(/lawyer|consultation|help|call/)
    render json: { reply: reply, lead_capture: lead_trigger }
  end

  # POST /summary
  def summary
    summaries_dir = Rails.root.join("summaries")
    Dir.mkdir(summaries_dir) unless Dir.exist?(summaries_dir)

    filename = summaries_dir.join("chat_#{Time.now.to_i}.txt")
    File.write(filename, @@conversation.map { |m| m[:content] }.join("\n"))
    render json: { status: "saved" }
  end

  # GET /admin
  def admin
    summaries_dir = Rails.root.join("summaries")
    Dir.mkdir(summaries_dir) unless Dir.exist?(summaries_dir)
    @summaries = Dir.children(summaries_dir)
    render "admin/index"
  end
end
