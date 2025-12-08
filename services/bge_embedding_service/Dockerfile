FROM python:3.10-slim

WORKDIR /app

RUN pip install --no-cache-dir fastapi uvicorn[standard] sentence-transformers

COPY main.py .

ENV BGE_MODEL=BAAI/bge-large-en-v1.5

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
