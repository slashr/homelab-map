FROM python:3.11-slim

WORKDIR /app

# Install build dependencies for psutil
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    make \
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Clean up build dependencies to reduce image size (optional)
# RUN apt-get purge -y --auto-remove gcc g++ make libc6-dev

# Copy agent code
COPY agent.py .

# Run as non-root user
RUN useradd -m -u 1000 agent && chown -R agent:agent /app
USER agent

CMD ["python", "agent.py"]
