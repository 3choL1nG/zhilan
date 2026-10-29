FROM python:3.11.11-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 MPLBACKEND=Agg OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 HOME=/tmp XDG_CACHE_HOME=/tmp/.cache
RUN sed -i 's|http://deb.debian.org|https://mirrors.cloud.tencent.com|g' /etc/apt/sources.list.d/debian.sources && apt-get update && apt-get install -y --no-install-recommends fonts-wqy-microhei libreoffice-calc && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /opt/runtime/requirements.txt
RUN pip install --no-cache-dir --timeout=120 --retries=3 -i https://mirrors.cloud.tencent.com/pypi/simple -r /opt/runtime/requirements.txt
COPY kernel.py client.py /opt/runtime/
USER 1000:1000
WORKDIR /work
CMD ["python","/opt/runtime/kernel.py"]
