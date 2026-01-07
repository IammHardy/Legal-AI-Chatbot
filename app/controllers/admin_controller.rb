class AdminController < ApplicationController
  def index
    @leads = Dir.glob(Rails.root.join("leads", "*.txt")).map do |file|
      File.read(file)
    end
  end
end
