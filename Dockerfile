FROM python:3.7-alpine

WORKDIR /app
RUN apk add --no-cache --virtual .build-deps gcc musl-dev
ADD requirements.txt .
RUN pip install -r requirements.txt
ADD . .

CMD gunicorn main:application -b 0.0.0.0:8000 -t 300 -w 1 --threads 3 --worker-class gevent
EXPOSE 8000
