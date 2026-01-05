# app/controllers/chat_controller.rb
class ChatController < ApplicationController
  skip_before_action :verify_authenticity_token  # allow API POST requests
  require "openai"
  require "json"

  @@conversation = []
  SYSTEM_PROMPT = "You are a professional legal AI assistant. Answer questions clearly and politely."

  # GET /
  def index
    # renders app/views/chat/index.html.erb
  end

  # Load FAQs from JSON file
  def load_faqs
    faqs_file = Rails.root.join("faqs.json")
    if File.exist?(faqs_file)
      JSON.parse(File.read(faqs_file))
    else
      []
    end
  end

  # POST /chat
  def chat
    user_message = params[:message].to_s.strip
    @@conversation << { role: "user", content: user_message }

    faqs = load_faqs
    faq_match = faqs.find { |f| user_message.downcase.include?(f["question"].downcase) }

    if faq_match
      reply = faq_match["answer"]
      response_type = "faq"
    else
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
        response_type = "ai"
      rescue StandardError => e
        puts "OpenAI fallback: #{e.message}"
        reply = "I understand you said: '#{user_message}'. This is a demo AI response."
        response_type = "fallback"
      end
    end

    # Only show disclaimer at the first message
    disclaimer = ""
    if @@conversation.size == 1
      disclaimer = "This does not constitute legal advice."
    end
    reply += "\n\n**Disclaimer:** #{disclaimer}" unless disclaimer.empty?

    # Lead capture trigger
    lead_trigger = user_message.downcase.match?(/lawyer|consultation|help|call|legal|advice/)

    render json: { reply: reply, type: response_type, lead_capture: lead_trigger }
  end

  # POST /summary
  def summary
    summaries_dir = Rails.root.join("summaries")
    Dir.mkdir(summaries_dir) unless Dir.exist?(summaries_dir)

    filename = summaries_dir.join("chat_#{Time.now.to_i}.txt")
    File.write(filename, @@conversation.map { |m| "#{m[:role].capitalize}: #{m[:content]}" }.join("\n"))

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
