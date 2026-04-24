FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Argos language packages at build time so startup is instant
# Override ARGOS_LANG_PAIRS build arg to include different language pairs
ARG ARGOS_LANG_PAIRS=en-vi,vi-en
ENV ARGOS_LANG_PAIRS=${ARGOS_LANG_PAIRS}
COPY install_packages.py .
RUN python install_packages.py

COPY main.py .

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
