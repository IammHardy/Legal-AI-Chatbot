class ChatController < ApplicationController
  skip_before_action :verify_authenticity_token
  require "json"
  require "fileutils"
  require "openai"

  LEAD_THRESHOLD = 60

 SYSTEM_PROMPT = <<~PROMPT
  You are a premium, conversational legal intake assistant for a law office.
  Your job is to collect facts clearly and efficiently so a legal professional can review them.

  Tone & style:
  - Sound human, calm, and professional.
  - Keep it concise (avoid long lectures).
  - Ask at most 3 questions per message.
  - Use plain English (no legal jargon).

  Strict rules:
  - Do NOT give legal advice.
  - Do NOT cite laws/statutes/case law.
  - Do NOT predict outcomes or guarantee results.
  - Do NOT draft final legal documents as if they are ready to file.
  - Only recommend speaking to a lawyer if the user explicitly asks for a lawyer/legal representation.

  Intake priorities (collect these over the conversation):
  1) Issue category (contract, landlord/tenant, employment, family, debt/finance, other)
  2) Jurisdiction/location (country/state) — ask early if unknown
  3) Timeline (when it started, key dates, any upcoming deadlines)
  4) Parties involved (who vs who, relationship)
  5) What happened (facts, not opinions)
  6) Documents/evidence available (contract, messages, emails, receipts)
  7) Desired outcome (what the user wants to achieve)
  8) Urgency/safety (only ask if relevant)

  IMPORTANT handling for vague messages:
  - If the user only greets ("hi", "hello") or is too vague, do NOT summarize it as an issue.
    Instead, ask: (a) what type of issue, (b) jurisdiction, (c) a brief description.

  Always respond using this format:

  **Intake so far**
  - Category: <known or "Unknown">
  - Location/Jurisdiction: <known or "Unknown">
  - Key dates/deadlines: <known or "Unknown">
  - Parties involved: <known or "Unknown">
  - Goal: <known or "Unknown">

  **What I understood**
  - 1–3 bullet points of the user’s facts (or say “No details yet” if they only greeted)

  **Questions (max 3)**
  1) ...
  2) ...
  3) ...

  **Next step**
  - One non-legal-advice action that helps move intake forward (e.g., “Share the key clause”, “Tell me the date it was signed”, “List the parties on the agreement”, “Upload/quote the relevant section if you have it”).
PROMPT

  # GET /
  def index
    session[:inquiry_score] ||= 0
    session[:conversation] ||= []
    session[:disclaimer_shown] ||= false
    session[:last_user_message] ||= nil
    session[:last_api_call_at] ||= 0.0

    @conversation = session[:conversation]
    @score = session[:inquiry_score]
  end

  # POST /chat
  def chat
    user_message = params[:message].to_s.strip
    return render json: { reply: "Please enter a message.", score: session[:inquiry_score] } if user_message.empty?

    # server-side throttle (prevents accidental doubles)
    now = Time.now.to_f
    last = session[:last_api_call_at].to_f
    if (now - last) < 1.0
      return render json: { reply: "One sec — please try again.", score: session[:inquiry_score] }
    end
    session[:last_api_call_at] = now

    # Store user message in session
    session[:last_user_message] = user_message
    session[:conversation] << { role: "user", content: user_message }

    # Increment score per message
    session[:inquiry_score] += calculate_score(user_message)

    # Handoff if threshold reached
    if session[:inquiry_score] >= LEAD_THRESHOLD
      return render json: {
        reply: handoff_message,
        cta: "Please submit your details so a legal professional can contact you.",
        score: session[:inquiry_score]
      }
    end

    disclaimer = nil
    reply = nil

    begin
      Rails.logger.warn("[ChatController#chat] Using key prefix: #{ENV["OPENAI_API_KEY"].to_s[0, 12]}")

      client = OpenAI::Client.new(access_token: ENV["OPENAI_API_KEY"])

      # Keep history tiny while debugging quota issues
      history = session[:conversation].last(8)
      messages = [{ role: "system", content: SYSTEM_PROMPT }] + history
      
      max_retries = 3
      attempt = 0

      begin
        attempt += 1

        response = client.chat(
          parameters: {
            model: "gpt-4o-mini",
            messages: messages,
            temperature: 0.4,
            max_tokens: 250
          }
        )

        reply = response.dig("choices", 0, "message", "content").to_s.strip
        raise "Empty reply from API. Raw response: #{response.inspect}" if reply.empty?

      rescue Faraday::TooManyRequestsError => e
        body = e.response&.dig(:body)

        # Handle insufficient quota explicitly
        if body.is_a?(Hash) && body.dig("error", "code") == "insufficient_quota"
          Rails.logger.error("[ChatController#chat] OpenAI insufficient_quota: #{body}")
          reply = "AI service is not available because the OpenAI account/project has no active quota. Please check billing/settings in the OpenAI dashboard."
        else
          Rails.logger.warn("[ChatController#chat] 429 rate-limited (attempt #{attempt}/#{max_retries})")
          Rails.logger.warn("[ChatController#chat] 429 body: #{body}") if body

          if attempt < max_retries
            sleep_time = 0.8 * (2 ** (attempt - 1)) # 0.8s, 1.6s, 3.2s
            sleep(sleep_time)
            retry
          end

          reply = "I’m getting a lot of requests right now. Please wait about 10–20 seconds and try again."
        end
      end # ✅ closes inner begin/rescue

      # Only store assistant reply if it’s a real model reply (not system errors)
      if reply.present? &&
         !reply.start_with?("I’m getting a lot of requests right now") &&
         !reply.start_with?("AI service is not available")
        session[:conversation] << { role: "assistant", content: reply }
      end

      # Show disclaimer only once per session
      unless session[:disclaimer_shown]
        disclaimer = "This does not constitute legal advice."
        session[:disclaimer_shown] = true
      end

    rescue => e
      Rails.logger.error("[ChatController#chat] OpenAI error: #{e.class} #{e.message}")
      reply = "Sorry — something went wrong. Please try again in a moment."
      disclaimer = nil
    end

    render json: {
      reply: reply,
      disclaimer: disclaimer,
      score: session[:inquiry_score]
    }
  end


  # POST /intake_report
def intake_report
  conversation = session[:conversation] || []
  user_text = conversation
    .map { |m| "#{(m[:role] || m['role']).to_s.upcase}: #{(m[:content] || m['content']).to_s}" }
    .join("\n")

  return render json: { error: "No conversation yet." }, status: 422 if user_text.strip.empty?

  begin
    client = OpenAI::Client.new(access_token: ENV["OPENAI_API_KEY"])

    report_prompt = <<~PROMPT
      You are generating an INTERNAL intake report for a law office.
      This report is for lawyers/staff, not the user.

      Rules:
      - Do NOT give legal advice.
      - Do NOT cite laws or statutes.
      - If information is missing, write "Unknown" and list it in missing_info.
      - Be concise and professional.

      Output MUST be valid JSON only (no markdown, no commentary), in this schema:

      {
        "category": "Contract | Landlord/Tenant | Employment | Family | Debt/Finance | Other | Unknown",
        "jurisdiction": "Unknown or location",
        "parties": ["..."],
        "timeline": ["...key dates/events..."],
        "facts_summary": ["...bullets..."],
        "what_user_wants": "string",
        "documents_mentioned": ["..."],
        "urgency_flags": ["..."],
        "missing_info": ["..."],
        "suggested_next_questions": ["...max 6..."],
        "handoff_recommended": true/false
      }

      Conversation:
      #{user_text}
    PROMPT

    response = client.chat(
      parameters: {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You output strict JSON only." },
          { role: "user", content: report_prompt }
        ],
        temperature: 0.2,
        max_tokens: 650
      }
    )

    raw = response.dig("choices", 0, "message", "content").to_s.strip

    # Parse JSON safely
    report = JSON.parse(raw)

    # Save a copy to /reports for demo “enterprise feel”
  # Save optional (keep this if you want)
reports_dir = Rails.root.join("reports")
FileUtils.mkdir_p(reports_dir)
File.write(reports_dir.join("intake_report_#{Time.now.to_i}.json"), JSON.pretty_generate(report))

# ✅ Return as downloadable file (always works)
send_data JSON.pretty_generate(report),
          filename: "intake_report_#{Time.now.to_i}.json",
          type: "application/json",
          disposition: "attachment"
  rescue JSON::ParserError => e
    Rails.logger.error("[ChatController#intake_report] JSON parse error: #{e.message}")
    render json: {
      status: "error",
      error: "Model returned invalid JSON. Try again."
    }, status: 500
  rescue => e
    Rails.logger.error("[ChatController#intake_report] Error: #{e.class} #{e.message}")
    render json: {
      status: "error",
      error: "Could not generate intake report right now."
    }, status: 500
  end
end

# GET /reports/:filename
# GET /reports/:filename
def download_report
  filename = params[:filename].to_s
  safe = filename.gsub(/[^a-zA-Z0-9_\-\.]/, "")

  path_a = Rails.root.join("reports", safe)
  path_b = Rails.root.join("public", "reports", safe)

  Rails.logger.warn("[download_report] requested=#{filename} safe=#{safe}")
  Rails.logger.warn("[download_report] path_a=#{path_a} exists=#{File.exist?(path_a)}")
  Rails.logger.warn("[download_report] path_b=#{path_b} exists=#{File.exist?(path_b)}")

  path =
    if File.exist?(path_a) then path_a
    elsif File.exist?(path_b) then path_b
    else nil
    end

  return render(plain: "Report not found", status: :not_found) if path.nil?

  send_file path, type: "application/json", disposition: "attachment"
end
  # POST /summary
  def summary
    summaries_dir = Rails.root.join("summaries")
    Dir.mkdir(summaries_dir) unless Dir.exist?(summaries_dir)

    filename = summaries_dir.join("chat_#{Time.now.to_i}.txt")
    File.write(
      filename,
      session[:conversation].map { |m| "#{m[:role].capitalize}: #{m[:content]}" }.join("\n")
    )

    render json: { status: "saved" }
  end

  # POST /clear_chat
  def clear_chat
    session[:conversation] = []
    session[:inquiry_score] = 0
    session[:disclaimer_shown] = false
    session[:last_user_message] = nil
    session[:last_api_call_at] = 0.0
    render json: { status: "cleared" }
  end

  private

  def calculate_score(message)
    keywords = {
      "lawyer" => 30,
      "court" => 20,
      "divorce" => 30,
      "custody" => 30,
      "assets" => 20,
      "help" => 10
    }
    keywords.sum { |word, value| message.downcase.include?(word) ? value : 0 }
  end

  def handoff_message
    "Thanks for explaining your situation. This looks like something a legal professional should review directly. Please share your details below and someone will contact you shortly."
  end
end