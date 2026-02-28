class CreateDocuments < ActiveRecord::Migration[8.0]
  def change
    create_table :documents do |t|
      t.string :title
      t.text :extracted_text
      t.string :content_type
      t.string :filename

      t.timestamps
    end
  end
end
