from dotenv import load_dotenv
load_dotenv()
import os
from supabase import Client, create_client
from sentence_transformers import SentenceTransformer

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
model = SentenceTransformer("nomic-ai/nomic-embed-text-v1.5")

row_ids = [
    "d997f40e-e079-4554-89e3-62687f53ad44",
    "b9ffddad-ffd2-45de-b41c-df9e5c4162eb",
    "c9f1cef5-9d7d-454e-b8f7-76403e32f735",
    "d3ffebba-635a-4ab7-b921-a476afb67c17",
    "4c6fe914-8f8d-45f3-b304-5968a8a65903",
    "40ca79ed-c989-4b6f-8ba1-e69266dce3fa",
    "a710f203-6406-4c26-9488-d56ca71378e5",
    "42b73405-ecb4-4f8d-bd0d-fee4b53276ae",
    "8b66578f-ae34-49e7-a431-2e403717bb7c",
    "58a4f851-d473-4a65-a174-f6a1c649d0eb",
    "c0a77857-d859-4a20-b394-141a0d5c570e",
    "2c636dbe-6af4-4876-a58d-1084ddb2606c",
    "58c25a97-12b4-45a9-9e10-396ff10e5544",
    "2d7a6443-8028-47ef-b74d-2457f8494970",
    "525bc20e-bdea-4709-9d54-b14f64a9f9fa",
    "f93ea9e8-0f3a-4d8d-9136-36e7632cad20",
    "5e464374-ca93-40a1-b688-a5dc253f99f1",
    "048d421d-cdbf-4272-95e2-e693cef23908"
]

for row_id in row_ids:
    # Fetch the chunk_text for this row
    row = supabase.table("embeddings").select("chunk_text").eq("id", row_id).single().execute().data
    if not row or not row.get("chunk_text"):
        print(f"Skipping {row_id}: no chunk_text found.")
        continue
    text = row["chunk_text"]
    embedding = model.encode(text).tolist()
    supabase.table("embeddings").update({"embedding_768": embedding}).eq("id", row_id).execute()
    print(f"Updated row {row_id}")

print("Migration complete for listed IDs.")
